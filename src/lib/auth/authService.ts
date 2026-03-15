import { AUTH_SERVICE_CONFIG, getAuthCallbackUrl } from '@/lib/config';

const ACCESS_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const USER_PROFILE_KEY = 'user_profile';
const USER_PROFILE_TIMESTAMP_KEY = 'user_profile_timestamp';

export interface AuthServiceTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

type OAuthProvider = 'github' | 'google';

function getAuthServiceBaseUrl(): string {
  return AUTH_SERVICE_CONFIG.BASE_URL.replace(/\/$/, '');
}

function getClientId(): string {
  return AUTH_SERVICE_CONFIG.CLIENT_ID;
}

function getAuthServiceConfigError(): string | null {
  if (!getAuthServiceBaseUrl()) {
    return '认证服务地址未配置';
  }

  if (!getClientId()) {
    return '认证服务 client_id 未配置';
  }

  return null;
}

export function buildOAuthLoginUrl(provider: OAuthProvider): string | null {
  const configError = getAuthServiceConfigError();
  if (configError) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getAuthCallbackUrl(),
  });

  return `${getAuthServiceBaseUrl()}/auth/oauth/${provider}?${params.toString()}`;
}

export async function exchangeAuthCode(
  code: string
): Promise<AuthServiceTokenResponse> {
  const configError = getAuthServiceConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const response = await fetch(`${getAuthServiceBaseUrl()}/auth/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      client_id: getClientId(),
    }),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((payload) => payload?.detail)
      .catch(() => null);
    throw new Error(detail || '授权码兑换失败');
  }

  return response.json();
}

export async function revokeAuthSession(
  refreshToken = getStoredRefreshToken()
): Promise<void> {
  if (!refreshToken || !getAuthServiceBaseUrl()) {
    return;
  }

  try {
    await fetch(`${getAuthServiceBaseUrl()}/auth/token/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    // Ignore revoke failures and clear local state anyway.
  }
}

export function storeAuthSession(tokens: AuthServiceTokenResponse): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearAuthStorage(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_PROFILE_KEY);
  localStorage.removeItem(USER_PROFILE_TIMESTAMP_KEY);
}

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
