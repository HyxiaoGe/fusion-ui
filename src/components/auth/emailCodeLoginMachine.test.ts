import { describe, expect, it } from 'vitest';

import {
  createInitialEmailCodeLoginState,
  emailCodeLoginReducer,
  normalizeEmailCodeFailure,
  remainingSeconds,
  type EmailCodeChallenge,
} from './emailCodeLoginMachine';

const challenge: EmailCodeChallenge = {
  interactionToken: 'interaction-1',
  maskedDestination: 'u***@example.com',
  expiresInSeconds: 300,
  resendAfterSeconds: 60,
  codeLength: 6,
};

describe('emailCodeLoginMachine', () => {
  it('从登录方式列表进入邮箱输入，并能完整推进到验证码状态', () => {
    let state = createInitialEmailCodeLoginState();
    state = emailCodeLoginReducer(state, { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, { type: 'SET_EMAIL', email: ' user@example.com ' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED',
      operation: 'start',
      requestId: 1,
      submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'CHALLENGE_RECEIVED',
      operation: 'start',
      requestId: 1,
      challenge,
      now: 1_000,
    });

    expect(state).toMatchObject({
      phase: 'code-entry',
      emailDraft: 'user@example.com',
      interactionToken: 'interaction-1',
      maskedDestination: 'u***@example.com',
      codeLength: 6,
      codeExpiresAt: 301_000,
      resendAvailableAt: 61_000,
    });
  });

  it('请求结果必须匹配 active request，关闭后的迟到响应不能复活流程', () => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED',
      operation: 'start',
      requestId: 7,
      submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, { type: 'RESET' });
    state = emailCodeLoginReducer(state, {
      type: 'CHALLENGE_RECEIVED',
      operation: 'start',
      requestId: 7,
      challenge,
      now: 1_000,
    });

    expect(state).toEqual(createInitialEmailCodeLoginState());
  });

  it('更换邮箱会保留邮箱草稿，但清掉 interaction、验证码和倒计时', () => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, { type: 'SET_EMAIL', email: 'user@example.com' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'CHALLENGE_RECEIVED', operation: 'start', requestId: 1, challenge, now: 1_000,
    });
    state = emailCodeLoginReducer(state, { type: 'SET_CODE', code: '123456' });
    state = emailCodeLoginReducer(state, { type: 'CHANGE_EMAIL' });

    expect(state).toMatchObject({
      phase: 'email-entry',
      emailDraft: 'user@example.com',
      interactionToken: null,
      verificationCode: '',
      codeExpiresAt: null,
      resendAvailableAt: null,
    });
  });

  it('重发成功会轮换 interaction、清空旧验证码并刷新服务端倒计时', () => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'CHALLENGE_RECEIVED', operation: 'start', requestId: 1, challenge, now: 1_000,
    });
    state = emailCodeLoginReducer(state, { type: 'SET_CODE', code: '123456' });
    state = emailCodeLoginReducer(state, { type: 'REQUEST_STARTED', operation: 'resend', requestId: 2 });
    state = emailCodeLoginReducer(state, {
      type: 'CHALLENGE_RECEIVED',
      operation: 'resend',
      requestId: 2,
      challenge: { ...challenge, interactionToken: 'interaction-2', resendAfterSeconds: 30 },
      now: 5_000,
    });

    expect(state).toMatchObject({
      phase: 'code-entry',
      interactionToken: 'interaction-2',
      verificationCode: '',
      resendAvailableAt: 35_000,
      notice: 'code_resent',
    });
  });

  it('invalid_code 留在验证码页并清空验证码，invalid_email 回邮箱字段', () => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'CHALLENGE_RECEIVED', operation: 'start', requestId: 1, challenge, now: 1_000,
    });
    state = emailCodeLoginReducer(state, { type: 'SET_CODE', code: '123456' });
    state = emailCodeLoginReducer(state, { type: 'REQUEST_STARTED', operation: 'verify', requestId: 2 });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_FAILED',
      operation: 'verify',
      requestId: 2,
      failure: { code: 'invalid_code' },
      now: 2_000,
    });

    expect(state).toMatchObject({ phase: 'code-entry', verificationCode: '', error: { code: 'invalid_code' } });

    state = emailCodeLoginReducer(state, {
      type: 'CLIENT_ERROR',
      failure: { code: 'invalid_email' },
    });
    expect(state).toMatchObject({ phase: 'email-entry', error: { code: 'invalid_email' } });
  });

  it.each(['too_many_attempts', 'interaction_expired', 'interaction_consumed'] as const)(
    '%s 会使 interaction 作废并返回邮箱输入页',
    (code) => {
      let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
      state = emailCodeLoginReducer(state, {
        type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
      });
      state = emailCodeLoginReducer(state, {
        type: 'CHALLENGE_RECEIVED', operation: 'start', requestId: 1, challenge, now: 1_000,
      });
      state = emailCodeLoginReducer(state, { type: 'REQUEST_STARTED', operation: 'verify', requestId: 2 });
      state = emailCodeLoginReducer(state, {
        type: 'REQUEST_FAILED', operation: 'verify', requestId: 2, failure: { code }, now: 2_000,
      });

      expect(state).toMatchObject({
        phase: 'email-entry',
        emailDraft: 'user@example.com',
        interactionToken: null,
        verificationCode: '',
        error: { code },
      });
    },
  );

  it('rate_limited 使用服务端 retry_after，且保留当前稳定页面', () => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_FAILED',
      operation: 'start',
      requestId: 1,
      failure: { code: 'rate_limited', retryAfterSeconds: 45 },
      now: 10_000,
    });

    expect(state).toMatchObject({
      phase: 'email-entry',
      retryAvailableAt: 55_000,
      retryOperation: 'start',
      error: { code: 'rate_limited', retryAfterSeconds: 45 },
    });

    state = emailCodeLoginReducer(state, { type: 'TICK', now: 55_000 });
    expect(state).toMatchObject({
      phase: 'email-entry',
      retryAvailableAt: null,
      retryOperation: null,
      error: null,
    });
  });

  it.each([undefined, 0])('rate_limited retry_after=%s 时采用 1 秒最小冷却且不会永久残留', (retryAfterSeconds) => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_FAILED',
      operation: 'start',
      requestId: 1,
      failure: retryAfterSeconds === undefined
        ? { code: 'rate_limited' }
        : { code: 'rate_limited', retryAfterSeconds },
      now: 10_000,
    });

    expect(state).toMatchObject({
      retryAvailableAt: 11_000,
      retryOperation: 'start',
      error: { code: 'rate_limited' },
    });
    state = emailCodeLoginReducer(state, { type: 'TICK', now: 11_000 });
    expect(state).toMatchObject({ retryAvailableAt: null, retryOperation: null, error: null });
  });

  it('被中止的请求回到对应稳定页面且不展示错误', () => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_FAILED',
      operation: 'start',
      requestId: 1,
      failure: { code: 'aborted' },
      now: 10_000,
    });

    expect(state).toMatchObject({
      phase: 'email-entry',
      activeRequestId: null,
      activeOperation: null,
      error: null,
    });
  });

  it('客户端时钟到期后标记验证码过期并禁止继续使用旧验证码', () => {
    let state = emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: 'SELECT_EMAIL' });
    state = emailCodeLoginReducer(state, {
      type: 'REQUEST_STARTED', operation: 'start', requestId: 1, submittedEmail: 'user@example.com',
    });
    state = emailCodeLoginReducer(state, {
      type: 'CHALLENGE_RECEIVED',
      operation: 'start',
      requestId: 1,
      challenge: { ...challenge, expiresInSeconds: 5 },
      now: 1_000,
    });
    state = emailCodeLoginReducer(state, { type: 'SET_CODE', code: '123456' });
    state = emailCodeLoginReducer(state, { type: 'TICK', now: 6_000 });

    expect(state).toMatchObject({
      phase: 'code-entry',
      verificationCode: '',
      error: { code: 'code_expired' },
    });
  });

  it('统一归一化 Abort、网络、结构化错误和未知错误', () => {
    expect(normalizeEmailCodeFailure(new DOMException('aborted', 'AbortError'))).toEqual({ code: 'aborted' });
    expect(normalizeEmailCodeFailure(new TypeError('Failed to fetch'))).toEqual({ code: 'network_error' });
    expect(normalizeEmailCodeFailure({ code: 'rate_limited', retryAfterSeconds: 12 })).toEqual({
      code: 'rate_limited', retryAfterSeconds: 12,
    });
    expect(normalizeEmailCodeFailure(new Error('oops'))).toEqual({ code: 'server_error' });
  });

  it('倒计时向上取整并且不会出现负数', () => {
    expect(remainingSeconds(2_001, 1_000)).toBe(2);
    expect(remainingSeconds(1_000, 1_000)).toBe(0);
    expect(remainingSeconds(500, 1_000)).toBe(0);
    expect(remainingSeconds(null, 1_000)).toBe(0);
  });
});
