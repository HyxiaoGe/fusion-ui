import {
  cancelAuthorization,
  completeAuthorization,
  prepareAuthorization,
  type AuthenticatedResult,
  type PreparedAuthorization,
} from 'auth-client-web';

import { AUTH_SERVICE_CONFIG } from '../config';
import { configureAuth } from './auth-sdk';
import { clearSsoReturn } from './sso-probe';

export type EmailCodeAuthErrorCode =
  | 'invalid_client'
  | 'invalid_email'
  | 'invalid_code'
  | 'code_expired'
  | 'rate_limited'
  | 'too_many_attempts'
  | 'interaction_expired'
  | 'interaction_consumed'
  | 'delivery_unavailable'
  | 'network_error'
  | 'server_error';

export class EmailCodeAuthError extends Error {
  readonly code: EmailCodeAuthErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: EmailCodeAuthErrorCode, retryAfterSeconds?: number) {
    super(`email code authentication failed: ${code}`);
    this.name = 'EmailCodeAuthError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface StartEmailCodeLoginInput {
  email: string;
  signal: AbortSignal;
}

export interface ContinueEmailCodeLoginInput {
  interactionToken: string;
  signal: AbortSignal;
}

export interface VerifyEmailCodeLoginInput extends ContinueEmailCodeLoginInput {
  verificationCode: string;
}

export interface CancelEmailCodeLoginInput {
  interactionToken: string | null;
}

export interface EmailCodeLoginChallenge {
  interactionToken: string;
  maskedDestination: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  codeLength: number;
}

interface EmailCodeTransaction {
  authorization: PreparedAuthorization;
  flowId: string;
  csrfToken: string;
  email: string;
  codeLength: number;
}

interface StartResponse {
  flowId: string;
  csrfToken: string;
  expiresInSeconds: number;
  codeLength: number;
}

interface SendResponse {
  maskedDestination: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

interface VerifyResponse {
  authorizationCode: string;
  state: string;
  expiresInSeconds: number;
}

const transactions = new Map<string, EmailCodeTransaction>();
const VERIFY_TIMEOUT_MS = 30_000;

interface BoundedSignal {
  signal: AbortSignal;
  didTimeout: () => boolean;
  dispose: () => void;
}

function createBoundedSignal(parent: AbortSignal, timeoutMs: number): BoundedSignal {
  const controller = new AbortController();
  let timedOut = false;
  const forwardParentAbort = () => controller.abort(parent.reason);

  if (parent.aborted) {
    forwardParentAbort();
  } else {
    parent.addEventListener('abort', forwardParentAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('email code verification timed out', 'TimeoutError'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timeoutId);
      parent.removeEventListener('abort', forwardParentAbort);
    },
  };
}

function authBaseUrl(): string {
  return AUTH_SERVICE_CONFIG.HEADLESS_BASE_URL.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseRetryAfter(response: Response, body: unknown): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header !== null && /^\d+$/.test(header.trim())) {
    return Math.max(0, Number.parseInt(header, 10));
  }
  if (isRecord(body)) {
    const retryAfter = nonNegativeInteger(body.retry_after);
    if (retryAfter !== null) return retryAfter;
  }
  return undefined;
}

function mapBackendError(response: Response, body: unknown): EmailCodeAuthError {
  const backendCode = isRecord(body) ? nonEmptyString(body.error) : null;
  const retryAfter = parseRetryAfter(response, body);

  if (response.status === 429 || backendCode === 'rate_limited') {
    return new EmailCodeAuthError('rate_limited', retryAfter);
  }

  switch (backendCode) {
    case 'invalid_email':
      return new EmailCodeAuthError('invalid_email');
    case 'invalid_code':
      return new EmailCodeAuthError('invalid_code');
    case 'expired_code':
    case 'code_expired':
      return new EmailCodeAuthError('code_expired');
    case 'too_many_attempts':
      return new EmailCodeAuthError('too_many_attempts', retryAfter);
    case 'invalid_interaction':
    case 'interaction_expired':
    case 'flow_expired':
      return new EmailCodeAuthError('interaction_expired');
    case 'interaction_consumed':
      return new EmailCodeAuthError('interaction_consumed');
    case 'invalid_client':
      return new EmailCodeAuthError('invalid_client');
    case 'delivery_unavailable':
    case 'delivery_failed':
      return new EmailCodeAuthError('delivery_unavailable');
    default:
      return new EmailCodeAuthError('server_error');
  }
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new EmailCodeAuthError('network_error');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    // fetch 已返回 headers 后，body 读取仍可能被调用方 Abort；这与畸形 JSON 不同，
    // 必须保留 AbortError 让 Panel 按取消处理，而不是误报服务异常。
    if (isAbortError(error)) throw error;
    if (!response.ok) throw mapBackendError(response, null);
    throw new EmailCodeAuthError('server_error');
  }

  if (!response.ok) throw mapBackendError(response, body);
  return body;
}

function parseStartResponse(body: unknown): StartResponse {
  if (!isRecord(body)) throw new EmailCodeAuthError('server_error');
  const flowId = nonEmptyString(body.flow_id);
  const csrfToken = nonEmptyString(body.csrf_token);
  const expiresInSeconds = positiveInteger(body.expires_in);
  const codeLength = positiveInteger(body.code_length);
  if (
    flowId === null
    || csrfToken === null
    || expiresInSeconds === null
    || codeLength === null
    || codeLength < 4
    || codeLength > 12
  ) {
    throw new EmailCodeAuthError('server_error');
  }
  return { flowId, csrfToken, expiresInSeconds, codeLength };
}

function parseSendResponse(body: unknown): SendResponse {
  if (!isRecord(body) || body.accepted !== true || body.next !== 'verify') {
    throw new EmailCodeAuthError('server_error');
  }
  const maskedDestination = nonEmptyString(body.masked_destination);
  const expiresInSeconds = positiveInteger(body.expires_in);
  const resendAfterSeconds = nonNegativeInteger(body.resend_after);
  if (maskedDestination === null || expiresInSeconds === null || resendAfterSeconds === null) {
    throw new EmailCodeAuthError('server_error');
  }
  return { maskedDestination, expiresInSeconds, resendAfterSeconds };
}

function parseVerifyResponse(body: unknown): VerifyResponse {
  if (!isRecord(body)) throw new EmailCodeAuthError('server_error');
  const authorizationCode = nonEmptyString(body.code);
  const state = nonEmptyString(body.state);
  const expiresInSeconds = positiveInteger(body.expires_in);
  if (authorizationCode === null || state === null || expiresInSeconds === null) {
    throw new EmailCodeAuthError('server_error');
  }
  return { authorizationCode, state, expiresInSeconds };
}

function cleanupTransaction(state: string): void {
  transactions.delete(state);
  cancelAuthorization(state);
}

function transactionFor(interactionToken: string): EmailCodeTransaction {
  const transaction = transactions.get(interactionToken);
  if (transaction === undefined) throw new EmailCodeAuthError('interaction_expired');
  return transaction;
}

function shouldInvalidateTransaction(error: unknown): boolean {
  if (!(error instanceof EmailCodeAuthError)) return false;
  return (
    error.code === 'too_many_attempts'
    || error.code === 'interaction_expired'
    || error.code === 'interaction_consumed'
    || error.code === 'invalid_client'
  );
}

function isInvalidClientError(error: unknown): boolean {
  return error instanceof EmailCodeAuthError && error.code === 'invalid_client';
}

async function sendCode(
  transaction: EmailCodeTransaction,
  signal: AbortSignal,
): Promise<EmailCodeLoginChallenge> {
  const response = parseSendResponse(await requestJson(
    `${authBaseUrl()}/auth/email/headless/send`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'X-CSRF-Token': transaction.csrfToken,
      },
      body: JSON.stringify({ flow_id: transaction.flowId, email: transaction.email }),
      signal,
    },
  ));

  return {
    interactionToken: transaction.authorization.state,
    maskedDestination: response.maskedDestination,
    expiresInSeconds: response.expiresInSeconds,
    resendAfterSeconds: response.resendAfterSeconds,
    codeLength: transaction.codeLength,
  };
}

export async function startEmailCodeLogin(
  input: StartEmailCodeLoginInput,
): Promise<EmailCodeLoginChallenge> {
  configureAuth();
  clearSsoReturn();
  const authorization = await prepareAuthorization();

  try {
    const start = parseStartResponse(await requestJson(
      `${authBaseUrl()}/auth/email/headless/start`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: authorization.clientId,
          redirect_uri: authorization.redirectUri,
          response_type: authorization.responseType,
          state: authorization.state,
          code_challenge: authorization.codeChallenge,
          code_challenge_method: authorization.codeChallengeMethod,
        }),
        signal: input.signal,
      },
    ));

    const transaction: EmailCodeTransaction = {
      authorization,
      flowId: start.flowId,
      csrfToken: start.csrfToken,
      email: input.email,
      codeLength: start.codeLength,
    };
    transactions.set(authorization.state, transaction);
    return await sendCode(transaction, input.signal);
  } catch (error) {
    cleanupTransaction(authorization.state);
    if (isInvalidClientError(error)) throw new EmailCodeAuthError('server_error');
    throw error;
  }
}

export async function resendEmailCodeLogin(
  input: ContinueEmailCodeLoginInput,
): Promise<EmailCodeLoginChallenge> {
  const transaction = transactionFor(input.interactionToken);
  try {
    return await sendCode(transaction, input.signal);
  } catch (error) {
    if (shouldInvalidateTransaction(error)) cleanupTransaction(input.interactionToken);
    if (isInvalidClientError(error)) throw new EmailCodeAuthError('server_error');
    throw error;
  }
}

export async function verifyEmailCodeLogin(
  input: VerifyEmailCodeLoginInput,
): Promise<AuthenticatedResult> {
  const transaction = transactionFor(input.interactionToken);
  const boundedSignal = createBoundedSignal(input.signal, VERIFY_TIMEOUT_MS);
  try {
    let response: VerifyResponse;
    try {
      response = parseVerifyResponse(await requestJson(
        `${authBaseUrl()}/auth/email/headless/verify`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            'X-CSRF-Token': transaction.csrfToken,
          },
          body: JSON.stringify({ flow_id: transaction.flowId, code: input.verificationCode }),
          signal: boundedSignal.signal,
        },
      ));
    } catch (error) {
      if (boundedSignal.didTimeout()) throw new EmailCodeAuthError('network_error');
      if (shouldInvalidateTransaction(error)) cleanupTransaction(input.interactionToken);
      if (isInvalidClientError(error)) throw new EmailCodeAuthError('interaction_expired');
      throw error;
    }

    if (response.state !== transaction.authorization.state) {
      cleanupTransaction(input.interactionToken);
      throw new EmailCodeAuthError('server_error');
    }

    try {
      return await completeAuthorization({
        authorizationCode: response.authorizationCode,
        state: response.state,
        signal: boundedSignal.signal,
      });
    } catch {
      // auth-service 已消费 OTP 并签发一次性授权码；此后无论换码、userinfo、超时还是 Abort
      // 失败，都不能让 UI 留在旧验证码页重试同一事务。
      throw new EmailCodeAuthError('interaction_consumed');
    } finally {
      // SDK 在首次网络等待前已经消费 pending；无论 token exchange 或 userinfo 是否抖动，
      // 这次 authorization code 都不能重放，应用侧事务也必须同步释放。
      transactions.delete(input.interactionToken);
    }
  } finally {
    boundedSignal.dispose();
  }
}

export function cancelEmailCodeLogin(input: CancelEmailCodeLoginInput): void {
  if (input.interactionToken === null) return;
  cleanupTransaction(input.interactionToken);
}
