import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { fetchUserProfileAPI, UserProfile } from '../../lib/api/user';

interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  status: 'idle',
  error: null,
};

interface DecodedToken {
  id: string;
  login: string;
  avatar_url: string;
  exp: number;
}

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
            state.user = { // Partially populate user from token
              id: decoded.id,
              username: decoded.login,
              avatar: decoded.avatar_url,
              email: null,
              nickname: null,
              mobile: null,
            };
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_token", action.payload);
            }
          } else {
            Object.assign(state, initialState);
            if (typeof window !== "undefined") {
              localStorage.removeItem("auth_token");
            }
          }
        } catch (error) {
          console.error("Invalid token:", error);
          Object.assign(state, initialState);
          if (typeof window !== "undefined") {
            localStorage.removeItem("auth_token");
          }
        }
      } else {
        Object.assign(state, initialState);
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_token");
        }
      }
    },
    logout: (state) => {
      Object.assign(state, initialState);
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
      }
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
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

export const { setToken, logout } = authSlice.actions;

export default authSlice.reducer; 