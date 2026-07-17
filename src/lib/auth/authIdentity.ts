import { jwtDecode } from 'jwt-decode';

interface AuthIdentityStateLike {
  auth?: {
    isAuthenticated?: boolean;
    user?: { id?: string | null } | null;
    token?: string | null;
  };
}

interface AuthIdentityToken {
  sub?: unknown;
}

function normalizeIdentity(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTokenSubject(token: string | null | undefined): string | null {
  if (!token) return null;

  try {
    return normalizeIdentity(jwtDecode<AuthIdentityToken>(token).sub);
  } catch {
    return null;
  }
}

/**
 * 返回一次认证会话内稳定的身份键。
 *
 * Fusion API 用户资料的 id 与 auth-service JWT 的 sub 属于不同命名空间，
 * 因此不能用 user.id 判断是否切换账号；优先使用 JWT sub，只有旧状态没有
 * 可解码 token 时才回退到资料 id。
 */
export function selectStableAuthIdentity(
  state: AuthIdentityStateLike | null | undefined,
): string | null {
  const auth = state?.auth;
  if (!auth?.isAuthenticated) return null;

  return readTokenSubject(auth.token) ?? normalizeIdentity(auth.user?.id);
}
