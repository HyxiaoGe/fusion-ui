import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { fetchUserProfileAPI, updateUserSettingsAPI, UserProfile } from '../../lib/api/user';
import {
  clearAuthStorage,
  completeSsoCallback,
  forceRefreshAccessToken,
  getStoredAccessToken,
  revokeSsoSession,
} from '@/lib/auth/authService';
import { isSafeReturnPath, markSsoProbed, takeSsoReturnPath } from '@/lib/auth/sso-probe';

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
        const parsedUser: UserProfile = userProfile
          ? { system_prompt: '', is_superuser: false, ...JSON.parse(userProfile) }
          : buildTokenUser(decoded);

        return {
          isAuthenticated: true,
          user: parsedUser,
          token: token,
          status: needsProfileRefresh(parsedUser) ? 'idle' : 'succeeded',
          error: null,
          // 本地有未过期 token：会话已定论为「登入」。
          sessionResolved: true,
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

export const fetchUserProfile = createAsyncThunk(
  'auth/fetchUserProfile',
  async (_, { rejectWithValue }) => {
    try {
      const userProfile = await fetchUserProfileAPI();
      return userProfile;
    } catch (error: any) {
      return rejectWithValue(error.message);
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
    },
    // 把会话标记为「已定论」（不改登入/登出本身）。加载侧确认「未发起静默恢复、就是登出」后派发，
    // 用以解锁头像菜单的登出终态；静默恢复在途时绝不派发，以维持中性占位、杜绝登录按钮闪烁。
    resolveSession: (state) => {
      state.sessionResolved = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchUserProfile.fulfilled, (state, action: PayloadAction<UserProfile>) => {
        state.status = 'succeeded';
        state.user = action.payload;
        // 保存用户信息到localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("user_profile", JSON.stringify(action.payload));
          localStorage.setItem("user_profile_timestamp", Date.now().toString());
        }
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
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

export const { setToken, logout, checkUserState, resolveSession } = authSlice.actions;

// 在 /auth/callback 页消费 auth-service 回调：SDK 内部完成 state 校验 + PKCE 换 token + 落库，
// 这里只负责把 access token 灌进 Redux 占位并拉取 fusion 自己的完整 profile。
// status 非 authenticated（静默探测的 login_required / 非回调）时软回首页，不报错。
export const completeLogin = createAsyncThunk<
  { redirectPath: string },
  void,
  { rejectValue: string }
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
        await dispatch(fetchUserProfile());
      }
      return { redirectPath: silentReturn || result.redirectPath || '/' };
    }
    // 静默探测未命中（login_required）等：软回原页（fusion 是软门禁，未登录也可浏览）。
    return { redirectPath: silentReturn || '/' };
  } catch (error: any) {
    // SDK 在 token 落库之后才拉 auth-service /userinfo（fusion 用不到它，自己拉 /api/auth/me）；
    // 那一步若抖动会抛错，但换码其实已成功。若本地确有 token，则按登录成功兜底，
    // 用 JWT 灌 Redux 并拉 fusion profile，避免「已拿到有效会话却提示登录失败」的割裂。
    const token = getStoredAccessToken();
    if (token) {
      dispatch(setToken(token));
      await dispatch(fetchUserProfile());
      return { redirectPath: silentReturn || '/' };
    }
    return rejectWithValue(error?.message || 'callback failed');
  }
});

// 跨应用单点登出（SLO）的前端探测：别处登出后，本标签页手里的 access token 签名仍然有效、
// 本地无从察觉。标签页重新聚焦/可见或接口 401 时强制走一次服务端刷新（forceRefreshAccessToken →
// SDK refresh）：refresh token 已被吊销 → 定论失败返回 null → 翻转为未登录；会话仍在 → SDK 已
// 轮转令牌（此处不 dispatch setToken，否则 buildTokenUser 会用最小信息覆盖完整 profile）；瞬时
// 网络故障 → throw，绝不登出（与 getValidAccessToken 同一套语义）。
export const revalidateToken = createAsyncThunk('auth/revalidateToken', async (_, { dispatch }) => {
  try {
    const token = await forceRefreshAccessToken();
    if (token === null) {
      dispatch(logout());
    }
    return token;
  } catch {
    return null;
  }
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
  dispatch(logout());
});

export default authSlice.reducer;
