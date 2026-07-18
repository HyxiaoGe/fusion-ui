export type EmailCodePhase =
  | 'methods'
  | 'email-entry'
  | 'sending'
  | 'code-entry'
  | 'resending'
  | 'verifying';

export type EmailCodeOperation = 'start' | 'resend' | 'verify';

export type EmailCodeErrorCode =
  | 'invalid_email'
  | 'invalid_code'
  | 'code_expired'
  | 'rate_limited'
  | 'too_many_attempts'
  | 'interaction_expired'
  | 'interaction_consumed'
  | 'delivery_unavailable'
  | 'network_error'
  | 'server_error'
  | 'aborted';

export type EmailCodeNotice = 'code_resent';

export interface EmailCodeFailure {
  code: EmailCodeErrorCode;
  retryAfterSeconds?: number;
}

export interface EmailCodeChallenge {
  interactionToken: string;
  maskedDestination: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  codeLength?: number;
}

export interface EmailCodeLoginState {
  phase: EmailCodePhase;
  emailDraft: string;
  interactionToken: string | null;
  maskedDestination: string | null;
  verificationCode: string;
  codeLength: number;
  codeExpiresAt: number | null;
  resendAvailableAt: number | null;
  retryAvailableAt: number | null;
  retryOperation: EmailCodeOperation | null;
  error: EmailCodeFailure | null;
  notice: EmailCodeNotice | null;
  activeRequestId: number | null;
  activeOperation: EmailCodeOperation | null;
}

export type EmailCodeLoginEvent =
  | { type: 'SELECT_EMAIL' }
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_CODE'; code: string }
  | { type: 'BACK_TO_METHODS' }
  | { type: 'CHANGE_EMAIL' }
  | { type: 'RESET' }
  | {
      type: 'REQUEST_STARTED';
      operation: EmailCodeOperation;
      requestId: number;
      submittedEmail?: string;
    }
  | {
      type: 'CHALLENGE_RECEIVED';
      operation: 'start' | 'resend';
      requestId: number;
      challenge: EmailCodeChallenge;
      now: number;
    }
  | { type: 'VERIFY_SUCCEEDED'; requestId: number }
  | {
      type: 'REQUEST_FAILED';
      operation: EmailCodeOperation;
      requestId: number;
      failure: EmailCodeFailure;
      now: number;
    }
  | { type: 'CLIENT_ERROR'; failure: EmailCodeFailure }
  | { type: 'TICK'; now: number };

const DEFAULT_CODE_LENGTH = 6;

const KNOWN_ERROR_CODES = new Set<EmailCodeErrorCode>([
  'invalid_email',
  'invalid_code',
  'code_expired',
  'rate_limited',
  'too_many_attempts',
  'interaction_expired',
  'interaction_consumed',
  'delivery_unavailable',
  'network_error',
  'server_error',
  'aborted',
]);

export function createInitialEmailCodeLoginState(): EmailCodeLoginState {
  return {
    phase: 'methods',
    emailDraft: '',
    interactionToken: null,
    maskedDestination: null,
    verificationCode: '',
    codeLength: DEFAULT_CODE_LENGTH,
    codeExpiresAt: null,
    resendAvailableAt: null,
    retryAvailableAt: null,
    retryOperation: null,
    error: null,
    notice: null,
    activeRequestId: null,
    activeOperation: null,
  };
}

function createEmailEntryState(
  state: EmailCodeLoginState,
  error: EmailCodeFailure | null = null,
): EmailCodeLoginState {
  return {
    ...createInitialEmailCodeLoginState(),
    phase: 'email-entry',
    emailDraft: state.emailDraft,
    error,
  };
}

function isActiveRequest(
  state: EmailCodeLoginState,
  operation: EmailCodeOperation,
  requestId: number,
): boolean {
  return state.activeRequestId === requestId && state.activeOperation === operation;
}

function stablePhaseFor(operation: EmailCodeOperation): 'email-entry' | 'code-entry' {
  return operation === 'start' ? 'email-entry' : 'code-entry';
}

function requestPhaseFor(operation: EmailCodeOperation): EmailCodePhase {
  if (operation === 'start') return 'sending';
  if (operation === 'resend') return 'resending';
  return 'verifying';
}

function canStartOperation(state: EmailCodeLoginState, operation: EmailCodeOperation): boolean {
  if (operation === 'start') return state.phase === 'email-entry';
  return state.phase === 'code-entry' && state.interactionToken !== null;
}

function normalizedDurationSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizedCodeLength(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) < 4 || (value ?? 0) > 12) {
    return DEFAULT_CODE_LENGTH;
  }
  return value as number;
}

export function emailCodeLoginReducer(
  state: EmailCodeLoginState,
  event: EmailCodeLoginEvent,
): EmailCodeLoginState {
  switch (event.type) {
    case 'SELECT_EMAIL':
      if (state.phase !== 'methods') return state;
      return { ...state, phase: 'email-entry', error: null, notice: null };

    case 'SET_EMAIL':
      if (state.phase !== 'email-entry') return state;
      return { ...state, emailDraft: event.email, error: null, notice: null };

    case 'SET_CODE': {
      if (state.phase !== 'code-entry') return state;
      const code = event.code.replace(/\D/g, '').slice(0, state.codeLength);
      return { ...state, verificationCode: code, error: null, notice: null };
    }

    case 'BACK_TO_METHODS':
    case 'RESET':
      return createInitialEmailCodeLoginState();

    case 'CHANGE_EMAIL':
      return createEmailEntryState(state);

    case 'REQUEST_STARTED':
      if (!canStartOperation(state, event.operation)) return state;
      return {
        ...state,
        phase: requestPhaseFor(event.operation),
        emailDraft: event.submittedEmail ?? state.emailDraft,
        activeRequestId: event.requestId,
        activeOperation: event.operation,
        retryAvailableAt: null,
        retryOperation: null,
        error: null,
        notice: null,
      };

    case 'CHALLENGE_RECEIVED': {
      if (!isActiveRequest(state, event.operation, event.requestId)) return state;
      const expiresIn = normalizedDurationSeconds(event.challenge.expiresInSeconds);
      const resendAfter = normalizedDurationSeconds(event.challenge.resendAfterSeconds);
      return {
        ...state,
        phase: 'code-entry',
        interactionToken: event.challenge.interactionToken,
        maskedDestination: event.challenge.maskedDestination,
        verificationCode: '',
        codeLength: normalizedCodeLength(event.challenge.codeLength),
        codeExpiresAt: event.now + expiresIn * 1_000,
        resendAvailableAt: event.now + resendAfter * 1_000,
        retryAvailableAt: null,
        retryOperation: null,
        error: null,
        notice: event.operation === 'resend' ? 'code_resent' : null,
        activeRequestId: null,
        activeOperation: null,
      };
    }

    case 'VERIFY_SUCCEEDED':
      if (!isActiveRequest(state, 'verify', event.requestId)) return state;
      return createInitialEmailCodeLoginState();

    case 'REQUEST_FAILED': {
      if (!isActiveRequest(state, event.operation, event.requestId)) return state;
      if (event.failure.code === 'aborted') {
        return {
          ...state,
          phase: stablePhaseFor(event.operation),
          error: null,
          notice: null,
          activeRequestId: null,
          activeOperation: null,
        };
      }

      if (
        event.failure.code === 'invalid_email'
        || event.failure.code === 'too_many_attempts'
        || event.failure.code === 'interaction_expired'
        || event.failure.code === 'interaction_consumed'
      ) {
        return createEmailEntryState(state, event.failure);
      }

      const retryAfter = event.failure.code === 'rate_limited'
        ? Math.max(1, normalizedDurationSeconds(event.failure.retryAfterSeconds ?? 0))
        : 0;
      return {
        ...state,
        phase: stablePhaseFor(event.operation),
        verificationCode:
          event.failure.code === 'invalid_code' || event.failure.code === 'code_expired'
            ? ''
            : state.verificationCode,
        retryAvailableAt:
          event.failure.code === 'rate_limited' && retryAfter > 0
            ? event.now + retryAfter * 1_000
            : null,
        retryOperation: event.failure.code === 'rate_limited' ? event.operation : null,
        error: event.failure,
        notice: null,
        activeRequestId: null,
        activeOperation: null,
      };
    }

    case 'CLIENT_ERROR':
      if (event.failure.code === 'invalid_email') {
        return createEmailEntryState(state, event.failure);
      }
      return { ...state, error: event.failure, notice: null };

    case 'TICK': {
      let nextState = state;
      if (state.retryAvailableAt !== null && state.retryAvailableAt <= event.now) {
        nextState = {
          ...nextState,
          retryAvailableAt: null,
          retryOperation: null,
          error: nextState.error?.code === 'rate_limited' ? null : nextState.error,
        };
      }
      if (
        nextState.phase === 'code-entry'
        && nextState.codeExpiresAt !== null
        && nextState.codeExpiresAt <= event.now
        && nextState.error?.code !== 'code_expired'
      ) {
        return {
          ...nextState,
          verificationCode: '',
          error: { code: 'code_expired' },
          notice: null,
        };
      }
      return nextState;
    }
  }
}

export function normalizeEmailCodeFailure(error: unknown): EmailCodeFailure {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; code?: unknown; retryAfterSeconds?: unknown };
    if (candidate.name === 'AbortError') return { code: 'aborted' };
    if (typeof candidate.code === 'string' && KNOWN_ERROR_CODES.has(candidate.code as EmailCodeErrorCode)) {
      const retryAfterSeconds =
        typeof candidate.retryAfterSeconds === 'number' && Number.isFinite(candidate.retryAfterSeconds)
          ? Math.max(0, Math.floor(candidate.retryAfterSeconds))
          : undefined;
      return retryAfterSeconds === undefined
        ? { code: candidate.code as EmailCodeErrorCode }
        : { code: candidate.code as EmailCodeErrorCode, retryAfterSeconds };
    }
  }

  if (error instanceof TypeError) return { code: 'network_error' };
  return { code: 'server_error' };
}

export function remainingSeconds(deadline: number | null, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}
