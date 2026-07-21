import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthSessionTransitionError,
  assertAuthSessionStable,
  bindResponseToAuthSession,
  beginAuthSessionTransition,
  blockAuthSessionTransition,
  completeAuthSessionTransition,
  getAuthSessionTransitionEpoch,
  getAuthSessionTransitionState,
  registerAuthBoundRequest,
  resetAuthSessionTransitionForTests,
  subscribeAuthSessionTransition,
  waitForAuthSessionStable,
} from './sessionTransition';

afterEach(() => {
  resetAuthSessionTransitionForTests();
});

describe('认证会话切换栅栏', () => {
  it('确认切换时先中断旧请求，并阻止新请求进入', () => {
    const request = registerAuthBoundRequest();

    beginAuthSessionTransition();

    expect(request.signal.aborted).toBe(true);
    expect(() => registerAuthBoundRequest()).toThrow(AuthSessionTransitionError);
    expect(getAuthSessionTransitionState()).toBe('synchronizing');
  });

  it('换票完成后开放新 epoch，但拒绝旧响应继续写入', () => {
    const oldEpoch = getAuthSessionTransitionEpoch();
    beginAuthSessionTransition();
    completeAuthSessionTransition();

    expect(getAuthSessionTransitionState()).toBe('stable');
    expect(() => assertAuthSessionStable(oldEpoch)).toThrow(AuthSessionTransitionError);
    expect(registerAuthBoundRequest().epoch).toBe(getAuthSessionTransitionEpoch());
  });

  it('阻塞失败保持封锁，并向订阅方发布状态', () => {
    const listener = vi.fn();
    subscribeAuthSessionTransition(listener);

    beginAuthSessionTransition();
    blockAuthSessionTransition();

    expect(listener).toHaveBeenNthCalledWith(1, 'synchronizing');
    expect(listener).toHaveBeenNthCalledWith(2, 'blocked');
    expect(() => assertAuthSessionStable()).toThrow(AuthSessionTransitionError);
  });

  it('只在会话重新稳定后唤醒等待方', async () => {
    beginAuthSessionTransition();
    let resolved = false;
    const pending = waitForAuthSessionStable().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    completeAuthSessionTransition();
    await pending;
    expect(resolved).toBe(true);
  });

  it('旧身份响应即使已经返回，也不能在切换后继续读取', async () => {
    const request = registerAuthBoundRequest();
    const response = bindResponseToAuthSession(new Response('old-user-data'), request);

    beginAuthSessionTransition();

    await expect(response.text()).rejects.toThrow(AuthSessionTransitionError);
  });
});
