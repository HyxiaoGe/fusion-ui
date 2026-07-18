import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  configureAuthMock,
  clearSsoReturnMock,
  prepareAuthorizationMock,
  completeAuthorizationMock,
  cancelAuthorizationMock,
} = vi.hoisted(() => ({
  configureAuthMock: vi.fn(),
  clearSsoReturnMock: vi.fn(),
  prepareAuthorizationMock: vi.fn(),
  completeAuthorizationMock: vi.fn(),
  cancelAuthorizationMock: vi.fn(),
}));

vi.mock('./auth-sdk', () => ({ configureAuth: configureAuthMock }));
vi.mock('./sso-probe', () => ({ clearSsoReturn: clearSsoReturnMock }));
vi.mock('../config', () => ({
  AUTH_SERVICE_CONFIG: {
    BASE_URL: 'https://auth-hosted.example.com/',
    HEADLESS_BASE_URL: 'http://127.0.0.1:18100/',
  },
}));
vi.mock('auth-client-web', () => ({
  prepareAuthorization: prepareAuthorizationMock,
  completeAuthorization: completeAuthorizationMock,
  cancelAuthorization: cancelAuthorizationMock,
}));

import {
  cancelEmailCodeLogin,
  resendEmailCodeLogin,
  startEmailCodeLogin,
  verifyEmailCodeLogin,
} from './emailCodeAuth';

const prepared = {
  responseType: 'code' as const,
  clientId: 'fusion-app',
  redirectUri: 'https://fusion.example.com/auth/callback',
  state: 'oauth-state-1',
  codeChallenge: 'challenge-1',
  codeChallengeMethod: 'S256' as const,
};

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('emailCodeAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareAuthorizationMock.mockResolvedValue({ ...prepared });
    completeAuthorizationMock.mockResolvedValue({
      status: 'authenticated',
      user: { id: 'u1' },
      redirectPath: '/',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cancelEmailCodeLogin({ interactionToken: 'oauth-state-1' });
    vi.clearAllMocks();
  });

  it('start 使用 SDK 准备 OAuth，按精确协议 start→send，并只向 Panel 返回 state 不透明句柄', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        next: 'verify',
        expires_in: 300,
        resend_after: 60,
        masked_destination: 'u***@example.com',
      }, 202));
    vi.stubGlobal('fetch', fetchMock);

    await expect(startEmailCodeLogin({
      email: 'user@example.com',
      signal: new AbortController().signal,
    })).resolves.toEqual({
      interactionToken: 'oauth-state-1',
      maskedDestination: 'u***@example.com',
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
      codeLength: 6,
    });

    expect(configureAuthMock).toHaveBeenCalledTimes(1);
    expect(clearSsoReturnMock).toHaveBeenCalledTimes(1);
    expect(prepareAuthorizationMock).toHaveBeenCalledWith();
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:18100/auth/email/headless/start', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: 'fusion-app',
        redirect_uri: 'https://fusion.example.com/auth/callback',
        response_type: 'code',
        state: 'oauth-state-1',
        code_challenge: 'challenge-1',
        code_challenge_method: 'S256',
      }),
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:18100/auth/email/headless/send', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'X-CSRF-Token': 'csrf-1',
      },
      body: JSON.stringify({ flow_id: 'flow-1', email: 'user@example.com' }),
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ['start 响应失败', [jsonResponse({ error: 'invalid_request', error_description: 'bad' }, 400)]],
    ['send 响应失败', [
      jsonResponse({ flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6 }, 201),
      jsonResponse({ error: 'delivery_unavailable', error_description: 'smtp down' }, 503),
    ]],
  ] as const)('%s会清掉 SDK pending 和事务 Map', async (_case, responses) => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(responses[0])
      .mockResolvedValueOnce(responses[1]));

    await expect(startEmailCodeLogin({
      email: 'user@example.com',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: expect.any(String) });

    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
    await expect(resendEmailCodeLogin({
      interactionToken: 'oauth-state-1',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'interaction_expired' });
  });

  it('start 被 Abort 时仍清理 SDK pending 和事务 Map', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      if (init.signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));

    const request = startEmailCodeLogin({ email: 'user@example.com', signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
  });

  it('resend 复用同一 flow/email/csrf，允许返回相同 interactionToken', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 60, masked_destination: 'u***@example.com',
      }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).resolves.toEqual(
      expect.objectContaining({ interactionToken: 'oauth-state-1', resendAfterSeconds: 60 }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:18100/auth/email/headless/send', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'X-CSRF-Token': 'csrf-1',
      },
      body: JSON.stringify({ flow_id: 'flow-1', email: 'user@example.com' }),
      signal,
    });
    expect(prepareAuthorizationMock).toHaveBeenCalledTimes(1);
  });

  it('verify 只发送 flow_id+code，成功校验 state 后调用 SDK completion 并消费事务', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 60, masked_destination: 'u***@example.com',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ code: 'authorization-code', state: 'oauth-state-1', expires_in: 60 }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    await expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1',
      verificationCode: '123456',
      signal,
    })).resolves.toEqual(expect.objectContaining({ status: 'authenticated' }));

    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:18100/auth/email/headless/verify', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'X-CSRF-Token': 'csrf-1',
      },
      body: JSON.stringify({ flow_id: 'flow-1', code: '123456' }),
      signal: expect.any(AbortSignal),
    });
    expect(completeAuthorizationMock).toHaveBeenCalledWith({
      authorizationCode: 'authorization-code',
      state: 'oauth-state-1',
      signal: expect.any(AbortSignal),
    });
    const verifySignal = (fetchMock.mock.calls[2]?.[1] as RequestInit).signal;
    expect(verifySignal).not.toBe(signal);
    expect(completeAuthorizationMock.mock.calls[0]?.[0].signal).toBe(verifySignal);
    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).rejects.toMatchObject({
      code: 'interaction_expired',
    });
  });

  it('invalid_code 和 429 保留事务，429 优先读取 Retry-After', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_code', error_description: 'wrong' }, 400))
      .mockResolvedValueOnce(jsonResponse({
        error: 'rate_limited', error_description: 'slow down', retry_after: 2,
      }, 429, { 'Retry-After': '7' }))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 60, masked_destination: 'u***@example.com',
      }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    await expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1', verificationCode: '000000', signal,
    })).rejects.toMatchObject({ code: 'invalid_code' });
    await expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1', verificationCode: '000001', signal,
    })).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 7 });
    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).resolves.toEqual(
      expect.objectContaining({ interactionToken: 'oauth-state-1' }),
    );
    expect(cancelAuthorizationMock).not.toHaveBeenCalledWith('oauth-state-1');
  });

  it.each(['invalid_interaction', 'interaction_expired', 'interaction_consumed'])(
    '%s 会清理 SDK pending 和事务',
    async (backendError) => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse({
          flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
        }, 201))
        .mockResolvedValueOnce(jsonResponse({
          accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
        }, 202))
        .mockResolvedValueOnce(jsonResponse({ error: backendError, error_description: 'expired' }, 400));
      vi.stubGlobal('fetch', fetchMock);
      const signal = new AbortController().signal;
      await startEmailCodeLogin({ email: 'user@example.com', signal });

      await expect(verifyEmailCodeLogin({
        interactionToken: 'oauth-state-1', verificationCode: '123456', signal,
      })).rejects.toMatchObject({
        code: backendError === 'interaction_consumed' ? 'interaction_consumed' : 'interaction_expired',
      });
      expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
      await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).rejects.toMatchObject({
        code: 'interaction_expired',
      });
    },
  );

  it('verify 返回不同 state 时拒绝 SDK completion 并清理事务', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ code: 'authorization-code', state: 'attacker-state', expires_in: 60 })));
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    await expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1', verificationCode: '123456', signal,
    })).rejects.toMatchObject({ code: 'server_error' });
    expect(completeAuthorizationMock).not.toHaveBeenCalled();
    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
  });

  it('拿到授权码后 SDK completion 失败会归一化为 interaction_consumed，不能停留在旧验证码页重试', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ code: 'authorization-code', state: 'oauth-state-1', expires_in: 60 })));
    completeAuthorizationMock.mockRejectedValueOnce(new Error('token exchange failed'));
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    await expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1', verificationCode: '123456', signal,
    })).rejects.toMatchObject({ code: 'interaction_consumed' });
    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).rejects.toMatchObject({
      code: 'interaction_expired',
    });
  });

  it('verify 的 invalid_client 在 OTP 消费前失败，清理事务并要求重新开始但不误报已使用', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_client', error_description: 'client mismatch' }, 400)));
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    await expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1', verificationCode: '123456', signal,
    })).rejects.toMatchObject({ code: 'interaction_expired' });
    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).rejects.toMatchObject({
      code: 'interaction_expired',
    });
  });

  it('start 的 invalid_client 显示配置/服务错误，不误报验证码已使用', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      error: 'invalid_client',
      error_description: 'client mismatch',
    }, 400)));

    await expect(startEmailCodeLogin({
      email: 'user@example.com',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'server_error' });
    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
  });

  it('headers 到达后 response.json 被 parent signal 中止时保留 AbortError', async () => {
    const controller = new AbortController();
    const jsonMock = vi.fn(() => new Promise((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new DOMException('aborted while parsing json', 'AbortError'));
      });
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      json: jsonMock,
    } as unknown as Response));

    const request = startEmailCodeLogin({ email: 'user@example.com', signal: controller.signal });
    await vi.waitFor(() => expect(jsonMock).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
  });

  it('verify 响应前超过 30 秒会中止网络并返回 network_error，同时保留事务供重试', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockImplementationOnce((_url, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
      }))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 60, masked_destination: 'u***@example.com',
      }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    const verification = expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1', verificationCode: '123456', signal,
    })).rejects.toMatchObject({ code: 'network_error' });
    await vi.advanceTimersByTimeAsync(30_000);
    await verification;

    expect(completeAuthorizationMock).not.toHaveBeenCalled();
    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).resolves.toMatchObject({
      interactionToken: 'oauth-state-1',
    });
  });

  it('Panel AbortSignal 会传导到 verify 有界信号并立即中止，不等待 30 秒超时', async () => {
    let verifySignal: AbortSignal | undefined;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockImplementationOnce((_url, init: RequestInit) => new Promise((_resolve, reject) => {
        verifySignal = init.signal ?? undefined;
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await startEmailCodeLogin({ email: 'user@example.com', signal: controller.signal });

    const verification = verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1',
      verificationCode: '123456',
      signal: controller.signal,
    });
    controller.abort();

    await expect(verification).rejects.toMatchObject({ name: 'AbortError' });
    expect(verifySignal).not.toBe(controller.signal);
    expect(verifySignal?.aborted).toBe(true);
    expect(completeAuthorizationMock).not.toHaveBeenCalled();
  });

  it('verify 已签发授权码后 SDK completion 超过 30 秒会返回 interaction_consumed 并清理事务', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ code: 'authorization-code', state: 'oauth-state-1', expires_in: 60 })));
    completeAuthorizationMock.mockImplementationOnce(({ signal }: { signal: AbortSignal }) => (
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
      })
    ));
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    const verification = expect(verifyEmailCodeLogin({
      interactionToken: 'oauth-state-1', verificationCode: '123456', signal,
    })).rejects.toMatchObject({ code: 'interaction_consumed' });
    await vi.advanceTimersByTimeAsync(30_000);
    await verification;

    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).rejects.toMatchObject({
      code: 'interaction_expired',
    });
  });

  it('严格拒绝格式错误的 2xx JSON，并清理 start 事务', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ flow_id: 123 }, 201)));

    await expect(startEmailCodeLogin({
      email: 'user@example.com', signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'server_error' });
    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
  });

  it('cancel 使用不透明 state 取消 SDK pending 并删除 Map', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        flow_id: 'flow-1', csrf_token: 'csrf-1', expires_in: 600, code_length: 6,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true, next: 'verify', expires_in: 300, resend_after: 0, masked_destination: 'u***@example.com',
      }, 202)));
    const signal = new AbortController().signal;
    await startEmailCodeLogin({ email: 'user@example.com', signal });

    cancelEmailCodeLogin({ interactionToken: 'oauth-state-1' });

    expect(cancelAuthorizationMock).toHaveBeenCalledWith('oauth-state-1');
    await expect(resendEmailCodeLogin({ interactionToken: 'oauth-state-1', signal })).rejects.toMatchObject({
      code: 'interaction_expired',
    });
  });
});
