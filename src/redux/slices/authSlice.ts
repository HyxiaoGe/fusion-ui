import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
};

interface DecodedToken {
  user: User;
  exp: number;
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setToken: (state, action: PayloadAction<string | null>) => {
      if (action.payload) {
        try {
          const decoded: DecodedToken = jwtDecode(action.payload);
          // 检查 token 是否过期
          if (decoded.exp * 1000 > Date.now()) {
            state.isAuthenticated = true;
            state.user = decoded.user;
            state.token = action.payload;
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_token", action.payload);
            }
          } else {
            // Token 过期，重置状态
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
});

export const { setToken, logout } = authSlice.actions;

export default authSlice.reducer; 