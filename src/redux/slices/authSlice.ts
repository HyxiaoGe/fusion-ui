import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { fetchUserProfileAPI, updateUserSettingsAPI, UserProfile } from '../../lib/api/user';
import {
  clearAuthStorage,
  completeSsoCallback,
  getStoredAccessToken,
  revokeSsoSession,
} from '@/lib/auth/authService';

interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
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

export const { setToken, logout, checkUserState } = authSlice.actions;

// 在 /auth/callback 页消费 auth-service 回调：SDK 内部完成 state 校验 + PKCE 换 token + 落库，
// 这里只负责把 access token 灌进 Redux 占位并拉取 fusion 自己的完整 profile。
// status 非 authenticated（静默探测的 login_required / 非回调）时软回首页，不报错。
export const completeLogin = createAsyncThunk<
  { redirectPath: string },
  void,
  { rejectValue: string }
>('auth/completeLogin', async (_, { dispatch, rejectWithValue }) => {
  try {
    const result = await completeSsoCallback();
    if (result.status === 'authenticated') {
      const token = getStoredAccessToken();
      if (token) {
        dispatch(setToken(token));
        await dispatch(fetchUserProfile());
      }
      return { redirectPath: result.redirectPath || '/' };
    }
    return { redirectPath: '/' };
  } catch (error: any) {
    // SDK 在 token 落库之后才拉 auth-service /userinfo（fusion 用不到它，自己拉 /api/auth/me）；
    // 那一步若抖动会抛错，但换码其实已成功。若本地确有 token，则按登录成功兜底，
    // 用 JWT 灌 Redux 并拉 fusion profile，避免「已拿到有效会话却提示登录失败」的割裂。
    const token = getStoredAccessToken();
    if (token) {
      dispatch(setToken(token));
      await dispatch(fetchUserProfile());
      return { redirectPath: '/' };
    }
    return rejectWithValue(error?.message || 'callback failed');
  }
});

// 退出登录：先尽力撤销 SSO 会话（失败也不阻塞），再无条件清掉本地 Redux + 存储。
export const logoutWithSso = createAsyncThunk('auth/logoutWithSso', async (_, { dispatch }) => {
  try {
    await revokeSsoSession();
  } catch {
    // best-effort：撤销失败绝不能把用户卡在「本地已登录」
  }
  dispatch(logout());
});

export default authSlice.reducer;
