import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { fetchUserProfileAPI, UserProfile } from '../../lib/api/user';
import { clearAuthStorage, getStoredAccessToken } from '@/lib/auth/authService';

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
  };
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
        const user: UserProfile = userProfile
          ? JSON.parse(userProfile)
          : buildTokenUser(decoded);

        return {
          isAuthenticated: true,
          user: user,
          token: token,
          status: 'succeeded',
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
      });
  },
});

export const { setToken, logout, checkUserState } = authSlice.actions;

export default authSlice.reducer; 
