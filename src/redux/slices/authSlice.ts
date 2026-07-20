import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { fetchUserProfileAPI, updateUserSettingsAPI, UserProfile } from '../../lib/api/user';
import {
  clearAuthStorage,
  clearFusionProfileStorage,
  clearRemoteSsoSession,
  completeSsoCallback,
  getStoredAccessToken,
  getValidAccessToken,
  probeSessionLiveness,
  reconcileSsoSession,
  resumeCentralSession,
  revokeSsoSession,
} from '@/lib/auth/authService';
import { isSafeReturnPath, markSsoProbed, takeSsoReturnPath } from '@/lib/auth/sso-probe';
import {
  accountSessionSwitchBlocked,
  accountSessionSwitchCompleted,
  accountSessionSwitchStarted,
} from '@/redux/actions/authSessionActions';
import {
  beginAuthSessionTransition,
  blockAuthSessionTransition,
  completeAuthSessionTransition,
} from '@/lib/auth/sessionTransition';

interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  // 会话是否已「定论」：true = 我们确知用户登入或确知登出；false = 尚不确定（加载时本地无 token，
  // 可能正由静默 SSO / 刷新恢复会话）。未定论期间 UI 不画登出终态（「登录」按钮），只占中性位，
  // 避免「登录成功却先闪一下登录按钮」——恢复在途的窗口本就不是登出。
  sessionResolved: boolean;
  accountSwitchStatus: 'stable' | 'synchronizing' | 'blocked';
  accountSwitchError: string | null;
  switchedAccountEmail: string | null;
}

interface DecodedToken {
  sub: string;
  email?: string;
  aud?: string;
  exp: number;
}

function buildTokenUser(decoded: DecodedToken): UserProfile {
  const email = decoded.email?.trim() || null;
  const username =
    email?.split('@')[0] ||
    `user-${decoded.sub.slice(0, 8)}`;

  return {
    id: decoded.sub,
    username,
    avatar: null,
    email,
    nickname: null,
    mobile: null,
    system_prompt: '',
    is_superuser: false,
  };
}

function needsProfileRefresh(profile: UserProfile | null): boolean {
  if (!profile) {
    return true;
  }

  return profile.nickname == null && profile.avatar == null;
}

// 在模块加载时就读取localStorage，避免渲染闪烁
const getInitialAuthState = (): AuthState => {
  const defaultState: AuthState = {
    isAuthenticated: false,
    user: null,
    token: null,
    status: 'idle',
    error: null,
    // 客户端首帧若本地无有效 token：会话尚未定论（可能正静默恢复），先不暴露登出终态。
    // 服务端渲染同样走这里（无 window），与客户端首帧一致，避免水合不一致。
    sessionResolved: false,
    accountSwitchStatus: 'stable',
    accountSwitchError: null,
    switchedAccountEmail: null,
  };

  // 服务端渲染时直接返回默认状态
  if (typeof window === "undefined") {
    return defaultState;
  }

  try {
    const token = getStoredAccessToken();
    const userProfile = localStorage.getItem("user_profile");
    
    if (token) {
      const decoded: DecodedToken = jwtDecode(token);

      // 检查token是否还有效
      if (decoded.exp * 1000 > Date.now()) {
        const cachedProfile = userProfile
          ? { system_prompt: '', is_superuser: false, ...JSON.parse(userProfile) } as UserProfile
          : null;
        // token 与富 profile 必须属于同一 subject；跨标签刚提交 B、旧页面仍留 A profile 时，
        // 宁可回退到 B token 的最小用户并强制刷新，也绝不能把 A 资料拼到 B 会话上。
        const parsedUser = cachedProfile?.id === decoded.sub
          ? cachedProfile
          : buildTokenUser(decoded);
        if (cachedProfile !== null && cachedProfile.id !== decoded.sub) {
          clearFusionProfileStorage();
        }

        return {
          isAuthenticated: true,
          user: parsedUser,
          token: token,
          status: needsProfileRefresh(parsedUser) ? 'idle' : 'succeeded',
          error: null,
          // 本地有未过期 token：会话已定论为「登入」。
          sessionResolved: true,
          accountSwitchStatus: 'stable',
          accountSwitchError: null,
          switchedAccountEmail: null,
        };
      } else {
        clearAuthStorage();
      }
    }
  } catch (error) {
    console.error("Error initializing auth state:", error);
    clearAuthStorage();
  }

  return defaultState;
};

const initialState: AuthState = getInitialAuthState();

interface FetchUserProfileInput {
  expectedToken?: string;
}

interface FetchUserProfileMeta {
  expectedToken: string | null;
}

export const fetchUserProfile = createAsyncThunk<
  UserProfile,
  FetchUserProfileInput | void,
  {
    state: { auth: AuthState };
    rejectValue: string;
    fulfilledMeta: FetchUserProfileMeta;
    rejectedMeta: FetchUserProfileMeta;
  }
>(
  'auth/fetchUserProfile',
  async (input, { fulfillWithValue, getState, rejectWithValue }) => {
    // 在真正发请求前冻结本次请求所属 token。响应返回时 reducer 会再次核对，
    // 防止 A 的迟到 profile 在 logout 或切换到 B 后污染 Redux/localStorage。
    const expectedToken = input?.expectedToken ?? getState().auth.token;
    try {
      const userProfile = await fetchUserProfileAPI();
      return fulfillWithValue(userProfile, { expectedToken });
    } catch (error: unknown) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'profile request failed',
        { expectedToken },
      );
    }
  }
);

export const updateUserSystemPrompt = createAsyncThunk(
  'auth/updateUserSystemPrompt',
  async (systemPrompt: string, { rejectWithValue }) => {
    try {
      const result = await updateUserSettingsAPI(systemPrompt);
      return result.system_prompt;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setToken: (state, action: PayloadAction<string | null>) => {
      // setToken 的每条分支都得出一个确定的登入/登出结论，故无条件标记会话已定论。
      state.sessionResolved = true;
      if (action.payload) {
        try {
          const decoded: DecodedToken = jwtDecode(action.payload);
          if (decoded.exp * 1000 > Date.now()) {
            if (typeof window !== "undefined") {
              let cachedProfileId: string | null = null;
              try {
                const rawProfile = localStorage.getItem('user_profile');
                const cachedProfile = rawProfile ? JSON.parse(rawProfile) as { id?: unknown } : null;
                cachedProfileId = typeof cachedProfile?.id === 'string' ? cachedProfile.id : null;
              } catch {
                cachedProfileId = null;
              }
              if (
                (state.user !== null && state.user.id !== decoded.sub)
                || (localStorage.getItem('user_profile') !== null && cachedProfileId !== decoded.sub)
              ) {
                clearFusionProfileStorage();
              }
            }
            state.isAuthenticated = true;
            state.token = action.payload;
            state.user = buildTokenUser(decoded);
            state.status = 'idle';
            state.error = null;
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_token", action.payload);
            }
          } else {
            if (typeof window !== "undefined") {
              clearAuthStorage();
            }
            state.isAuthenticated = false;
            state.user = null;
            state.token = null;
            state.status = 'idle';
            state.error = null;
          }
        } catch (error) {
          console.error("Invalid token:", error);
          if (typeof window !== "undefined") {
            clearAuthStorage();
          }
          state.isAuthenticated = false;
          state.user = null;
          state.token = null;
          state.status = 'idle';
          state.error = null;
        }
      } else {
        if (typeof window !== "undefined") {
          clearAuthStorage();
        }
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.status = 'idle';
        state.error = null;
      }
    },
    // 这个action现在主要用于检查是否需要刷新数据
    checkUserState: (state) => {
      if (typeof window !== "undefined" && state.isAuthenticated) {
        const lastProfileUpdate = localStorage.getItem("user_profile_timestamp");
        
        if (lastProfileUpdate) {
          const lastUpdate = parseInt(lastProfileUpdate);
          const now = Date.now();
          const oneDay = 24 * 60 * 60 * 1000; // 24小时
          
          // 如果数据过期，标记需要刷新
          if ((now - lastUpdate) > oneDay) {
            state.status = 'idle'; // 重置状态，暗示需要刷新
          }
        }
      }
    },
    logout: (state) => {
      if (typeof window !== "undefined") {
        clearAuthStorage();
      }
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.status = 'idle';
      state.error = null;
      // 显式登出 = 已定论为登出，应露出「登录」终态。
      state.sessionResolved = true;
      state.accountSwitchStatus = 'stable';
      state.accountSwitchError = null;
      state.switchedAccountEmail = null;
    },
    // SDK 已在统一会话写锁内按旧 token 条件清理完成；这里只收敛 Redux，禁止再次无条件
    // clearAuthStorage，否则可能删掉兄弟标签刚提交的新账号。
    remoteSessionCleared: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.status = 'idle';
      state.error = null;
      state.sessionResolved = true;
      state.accountSwitchStatus = 'stable';
      state.accountSwitchError = null;
      state.switchedAccountEmail = null;
    },
    // 把会话标记为「已定论」（不改登入/登出本身）。加载侧确认「未发起静默恢复、就是登出」后派发，
    // 用以解锁头像菜单的登出终态；静默恢复在途时绝不派发，以维持中性占位、杜绝登录按钮闪烁。
    resolveSession: (state) => {
      state.sessionResolved = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(accountSessionSwitchStarted, (state) => {
        if (typeof window !== 'undefined') clearFusionProfileStorage();
        state.accountSwitchStatus = 'synchronizing';
        state.accountSwitchError = null;
      })
      .addCase(accountSessionSwitchBlocked, (state, action) => {
        state.accountSwitchStatus = 'blocked';
        state.accountSwitchError = action.payload;
      })
      .addCase(accountSessionSwitchCompleted, (state, action) => {
        state.accountSwitchStatus = 'stable';
        state.accountSwitchError = null;
        state.switchedAccountEmail = action.payload.email;
      })
      .addCase(fetchUserProfile.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        // 缺少 expectedToken 的手工 action 仅用于既有测试/兼容；真实 thunk action 必带该字段。
        const expectedToken = (action.meta as Partial<FetchUserProfileMeta> | undefined)?.expectedToken;
        if (expectedToken !== undefined && (expectedToken === null || state.token !== expectedToken)) return;
        state.status = 'succeeded';
        state.user = action.payload;
        // 保存用户信息到localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("user_profile", JSON.stringify(action.payload));
          localStorage.setItem("user_profile_timestamp", Date.now().toString());
        }
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        const expectedToken = (action.meta as Partial<FetchUserProfileMeta> | undefined)?.expectedToken;
        if (expectedToken !== undefined && (expectedToken === null || state.token !== expectedToken)) return;
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(updateUserSystemPrompt.fulfilled, (state, action: PayloadAction<string>) => {
        if (state.user) {
          state.user.system_prompt = action.payload;
          if (typeof window !== "undefined") {
            localStorage.setItem("user_profile", JSON.stringify(state.user));
            localStorage.setItem("user_profile_timestamp", Date.now().toString());
          }
        }
      });
  },
});

export const { setToken, logout, remoteSessionCleared, checkUserState, resolveSession } = authSlice.actions;

// 在 /auth/callback 页消费 auth-service 回调：SDK 内部完成 state 校验 + PKCE 换 token + 落库，
// 这里只负责把 access token 灌进 Redux 占位并拉取 fusion 自己的完整 profile。
// status 非 authenticated（静默探测的 login_required / 非回调）时软回首页，不报错。
export const completeLogin = createAsyncThunk<
  { redirectPath: string },
  void,
  { state: { auth: AuthState }; rejectValue: string }
>('auth/completeLogin', async (_, { dispatch, rejectWithValue }) => {
  // 若本次回调源自加载时的静默探测，取回并清除探测前记下的原始路径（HIT/MISS 都回此处）。
  // 交互式登录无此项（登录前已 clearSsoReturn），silentReturn 为 null 时回退到 SDK 解析的路径。
  // 一次性读取，所有分支共用；并在消费端（router.replace 的入口）再校验一次开放重定向，
  // 不安全路径直接丢弃回退——与探测落库端的校验形成纵深防御。
  const rawReturn = takeSsoReturnPath();
  const silentReturn = rawReturn && isSafeReturnPath(rawReturn) ? rawReturn : null;
  try {
    const result = await completeSsoCallback();
    if (result.status === 'authenticated') {
      const token = getStoredAccessToken();
      if (token) {
        dispatch(setToken(token));
        await dispatch(fetchUserProfile({ expectedToken: token }));
      }
      return { redirectPath: silentReturn || result.redirectPath || '/' };
    }
    // 静默探测未命中（login_required）等：软回原页（fusion 是软门禁，未登录也可浏览）。
    return { redirectPath: silentReturn || '/' };
  } catch (error: unknown) {
    // 新版 SDK 以 token + user 原子提交会话：callback 抛错即表示本次授权未完成。
    // 此处不能读取任意现存 token 兜底，否则用户从 A 切换登录 B 失败时，会把 A 误判成 B 登录成功。
    return rejectWithValue(error instanceof Error ? error.message : 'callback failed');
  }
});

// headless 邮箱流程已由 SDK 完成 state/PKCE 校验和原子会话落库；这里只把 SDK token
// 注入 Redux 并拉取 Fusion 自己的 profile。没有 token 说明 SDK completion 未成功，不能
// 为了关闭弹窗而伪造登录态。
export const completeEmailCodeLogin = createAsyncThunk<
  void,
  void,
  { state: { auth: AuthState }; rejectValue: string }
>('auth/completeEmailCodeLogin', async (_, { dispatch, rejectWithValue }) => {
  const token = getStoredAccessToken();
  if (!token) return rejectWithValue('missing access token after email-code completion');
  dispatch(setToken(token));
  // token 已足以建立 Redux 登录态；完整 profile 后台刷新，不能延长验证码 verify 的
  // 不可关闭临界区。createAsyncThunk 的 dispatch promise 会自行收敛，不产生未处理拒绝。
  void dispatch(fetchUserProfile({ expectedToken: token }));
});

// userinfo / 存活探测失败是否为「服务端明确拒绝」（401 未授权 / 403 禁止）——即别处已登出 / 令牌
// 被吊销，应登出。raw fetch 的探测抛出形如 "liveness probe failed (401)" 的 Error；仅当能确凿识别
// 出 401/403 时返回 true。任何含糊（网络中断 / 5xx / 解析异常）一律返回 false → 保持登录，把误登出
// 风险压到零（漏判由下一次正常 API 请求的 401 或 token 过期兜底）。
function isAuthRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b40[13]\b/.test(message);
}

function isBlockingReconcileFailure(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'blocking' in err && err.blocking === true;
}

function tokenSubject(token: string): string | null {
  try {
    const decoded = jwtDecode<Partial<DecodedToken>>(token);
    return typeof decoded.sub === 'string' && decoded.sub.length > 0 ? decoded.sub : null;
  } catch {
    return null;
  }
}

/**
 * 采用 SDK 已原子提交到共享 localStorage 的新会话。
 *
 * 该入口同时服务当前标签的 reconcile 与同源兄弟标签通知。token 已一致时直接返回，
 * 避免当前标签在 SDK subscriber 与 reconcile promise 两条路径上重复清缓存、重复拉 profile。
 */
export const adoptCommittedSsoSession = createAsyncThunk<
  string | null,
  { email?: string },
  { state: { auth: AuthState } }
>('auth/adoptCommittedSsoSession', async ({ email }, { dispatch, getState }) => {
  const switchedToken = getStoredAccessToken();
  if (!switchedToken) {
    blockAuthSessionTransition();
    dispatch(accountSessionSwitchBlocked('账户换票完成后缺少访问令牌，请重新登录'));
    return null;
  }
  const switchedSubject = tokenSubject(switchedToken);
  if (switchedSubject === null) {
    blockAuthSessionTransition();
    dispatch(accountSessionSwitchBlocked('账户换票返回了无效访问令牌，请重新登录'));
    return null;
  }

  const current = getState().auth;
  if (current.token === switchedToken && current.user?.id === switchedSubject) {
    return switchedToken;
  }

  if (current.accountSwitchStatus === 'stable') {
    beginAuthSessionTransition();
    dispatch(accountSessionSwitchStarted());
  }
  dispatch(setToken(switchedToken));
  // 新 token 已落库且旧用户缓存已同步清空，随后才开放新身份请求。
  completeAuthSessionTransition();
  await dispatch(fetchUserProfile({ expectedToken: switchedToken }));
  const adoptedEmail = email ?? getState().auth.user?.email ?? '';
  dispatch(accountSessionSwitchCompleted({ email: adoptedEmail }));
  return switchedToken;
});

/**
 * 已被跨应用 SLO 翻为未登录的标签页，重新聚焦时尝试采用中央会话。
 * SDK 已原子提交 token/user；宿主只把 token 注入 Redux 并刷新自身扩展 profile。
 */
export const resumeSsoSession = createAsyncThunk<
  'local_session' | 'no_session' | 'resumed',
  void,
  { state: { auth: AuthState } }
>('auth/resumeSsoSession', async (_, { dispatch }) => {
  const result = await resumeCentralSession({
    beforeCommit: () => {
      // SDK 尚未落 B 票据；先封住 A 的请求并让所有用户绑定 slice 清空。
      beginAuthSessionTransition();
      dispatch(accountSessionSwitchStarted());
    },
  });
  if (result.status === 'no_session') return 'no_session';
  await dispatch(adoptCommittedSsoSession({
    email: result.status === 'resumed' ? result.user.email ?? '' : '',
  }));
  return result.status;
});

/**
 * 服务端已明确拒绝当前票据时的本地收敛。与显式 logoutWithSso 不同：不写登出守卫、
 * 不销毁中央 Cookie，只清当前应用旧票据和 A 的业务缓存，为稍后无感恢复 B 留出入口。
 */
export const settleRemoteSessionLoss = createAsyncThunk<
  void,
  string | null,
  { state: { auth: AuthState } }
>(
  'auth/settleRemoteSessionLoss',
  async (expectedAccessToken, { dispatch }) => {
    beginAuthSessionTransition();
    dispatch(accountSessionSwitchStarted());
    let result: Awaited<ReturnType<typeof clearRemoteSsoSession>>;
    try {
      result = await clearRemoteSsoSession(expectedAccessToken);
    } catch (error) {
      blockAuthSessionTransition();
      dispatch(accountSessionSwitchBlocked(
        error instanceof Error ? error.message : '旧账户会话清理未完成，请重试',
      ));
      return;
    }
    if (result.status === 'changed') {
      if (result.user === null) {
        blockAuthSessionTransition();
        dispatch(accountSessionSwitchBlocked('检测到新会话，但用户信息不完整，请重试'));
        return;
      }
      await dispatch(adoptCommittedSsoSession({ email: result.user.email ?? '' }));
      return;
    }
    dispatch(remoteSessionCleared());
    completeAuthSessionTransition();
    // SDK 锁释放到 Redux 收敛之间若兄弟标签恰好提交 B，重新读取并采用胜出会话；更晚的提交
    // 则由 session-sync 的 synchronizing → authenticated 通知负责采用。
    if (getStoredAccessToken()) {
      await dispatch(adoptCommittedSsoSession({ email: '' }));
    }
  },
);

// 跨应用单点登出（SLO）的前端存活探测：别处登出后，本标签页手里的 access token 在过期前签名仍然
// 有效、本地无从察觉。标签页重新聚焦/可见或低频定时器触发时调用——【绝不强制轮换 refresh token】
// （旧版 revalidateToken 调 forceRefreshAccessToken 每次切标签都轮换一张一次性 refresh token，慢隧道
// 下丢响应即触发复用检测 → 失同步被动登出，这正是本次要根除的 churn）。注意区分 churn 与正常续期：
// getValidAccessToken 在 token 未过期时直接返回缓存票、【零轮换】（绝大多数 focus 场景）；仅当 token
// 临界过期才按需刷新一次——这是必要续期、且不再是旧版「每次 focus 都轮换」的 churn。【不能】改用纯读
// 的 getStoredAccessToken：过期票直接拿去探测会被 /api/auth/me 拒 401，误判成「别处登出」而误登出。
// 流程：取本地 access token，再打一次查 denylist 的受保护端点 /api/auth/me——别处登出后这张票被吊销
// 标记拒为 401 → 翻转未登录。
//   - getValidAccessToken 返回 null（刷新被定论拒绝 / 无票，SDK 已清自身会话）→ logout；
//   - getValidAccessToken 抛错（瞬时网络故障）→ 保持现状，绝不登出；
//   - 探测 401/403（别处登出）→ logout；探测 5xx / 网络抖动 / 解析失败 → 保持登录。
// 401 重试仍走 fetchWithAuth 的 forceRefreshAccessToken（那里必须强制刷新拿服务端轮换后的新票重试）。
export const checkLiveness = createAsyncThunk<
  string | null | undefined,
  void,
  { state: { auth: AuthState } }
>('auth/checkLiveness', async (_, { dispatch, getState }) => {
  let expectedAccessToken = getState().auth.token ?? getStoredAccessToken();
  try {
    const reconciliation = await reconcileSsoSession({
      beforeCommit: () => {
        beginAuthSessionTransition();
        dispatch(accountSessionSwitchStarted());
      },
    });
    if (reconciliation.status === 'switched') {
      const switchedToken = getStoredAccessToken();
      if (!switchedToken) {
        blockAuthSessionTransition();
        dispatch(accountSessionSwitchBlocked('账户换票完成后缺少访问令牌，请重新登录'));
        return null;
      }
      const switchedSubject = tokenSubject(switchedToken);
      if (switchedSubject === null) {
        blockAuthSessionTransition();
        dispatch(accountSessionSwitchBlocked('账户换票返回了无效访问令牌，请重新登录'));
        return null;
      }
      // SDK subscriber 可能已先采用同一次提交；避免当前 reconcile promise 重复清理/拉取。
      if (
        getState().auth.token === switchedToken
        && getState().auth.user?.id === switchedSubject
      ) {
        return switchedToken;
      }
      dispatch(setToken(switchedToken));
      completeAuthSessionTransition();
      await dispatch(fetchUserProfile({ expectedToken: switchedToken }));
      dispatch(accountSessionSwitchCompleted({ email: reconciliation.user.email ?? '' }));
      return switchedToken;
    }
  } catch (err) {
    if (isBlockingReconcileFailure(err)) {
      blockAuthSessionTransition();
      dispatch(accountSessionSwitchBlocked(
        err instanceof Error ? err.message : '账户同步未完成，请重试',
      ));
      return null;
    }
    // 尚未确认身份分叉的网络故障不改变现有会话，继续用资源服务做只读存活检查。
  }

  let token: string | null;
  try {
    token = await getValidAccessToken();
  } catch {
    return null; // 瞬时网络故障：保持现状，不登出
  }
  if (token === null) {
    await dispatch(settleRemoteSessionLoss(expectedAccessToken)); // 定论失败（刷新被拒 / 无票）
    return null;
  }
  try {
    await probeSessionLiveness(token);
  } catch (err) {
    if (isAuthRejection(err)) {
      expectedAccessToken = token;
      await dispatch(settleRemoteSessionLoss(expectedAccessToken)); // 401/403：别处已登出 / 令牌被吊销
    }
    // 否则瞬时 / 5xx：保持登录
  }
  return token;
});

// 退出登录：先尽力撤销 SSO 会话（失败也不阻塞），再无条件清掉本地 Redux + 存储。
export const logoutWithSso = createAsyncThunk('auth/logoutWithSso', async (_, { dispatch }) => {
  // 先落探测守卫：即便随后撤销抛错，也保证登出后本标签页不被加载时静默探测重新登入
  //（IdP 会话可能仍在，无守卫会被立刻 SSO 回去）。
  markSsoProbed();
  try {
    await revokeSsoSession();
  } catch {
    // best-effort：撤销失败绝不能把用户卡在「本地已登录」
  }
  completeAuthSessionTransition();
  dispatch(logout());
});

export default authSlice.reducer;
