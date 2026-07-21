export type AuthSessionTransitionState = 'stable' | 'synchronizing' | 'blocked';

type TransitionListener = (state: AuthSessionTransitionState) => void;

let transitionState: AuthSessionTransitionState = 'stable';
let transitionEpoch = 0;
const activeRequests = new Set<AbortController>();
const listeners = new Set<TransitionListener>();

export class AuthSessionTransitionError extends Error {
  readonly code = 'AUTH_SESSION_TRANSITION';

  constructor(message: string = '账户正在同步，请稍后重试') {
    super(message);
    this.name = 'AuthSessionTransitionError';
  }
}

export function isAuthSessionTransitionError(
  error: unknown,
): error is AuthSessionTransitionError {
  return error instanceof AuthSessionTransitionError || (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'AUTH_SESSION_TRANSITION'
  );
}

function publish(next: AuthSessionTransitionState): void {
  transitionState = next;
  transitionEpoch += 1;
  listeners.forEach((listener) => listener(next));
}

function abortActiveRequests(): void {
  const reason = new AuthSessionTransitionError();
  activeRequests.forEach((controller) => controller.abort(reason));
  activeRequests.clear();
}

export function beginAuthSessionTransition(): void {
  if (transitionState === 'synchronizing') return;
  abortActiveRequests();
  publish('synchronizing');
}

export function blockAuthSessionTransition(): void {
  abortActiveRequests();
  if (transitionState !== 'blocked') publish('blocked');
}

export function completeAuthSessionTransition(): void {
  if (transitionState !== 'stable') publish('stable');
}

export function getAuthSessionTransitionState(): AuthSessionTransitionState {
  return transitionState;
}

export function getAuthSessionTransitionEpoch(): number {
  return transitionEpoch;
}

export function captureAuthSessionEpoch(): number {
  assertAuthSessionStable();
  return transitionEpoch;
}

export function assertAuthSessionStable(expectedEpoch?: number): void {
  if (
    transitionState !== 'stable'
    || (expectedEpoch !== undefined && expectedEpoch !== transitionEpoch)
  ) {
    throw new AuthSessionTransitionError();
  }
}

export interface AuthBoundRequest {
  signal: AbortSignal;
  epoch: number;
  release: () => void;
}

export function registerAuthBoundRequest(
  externalSignal?: AbortSignal | null,
  expectedEpoch?: number,
): AuthBoundRequest {
  assertAuthSessionStable(expectedEpoch);
  const controller = new AbortController();
  const epoch = transitionEpoch;

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }

  activeRequests.add(controller);
  let released = false;
  return {
    signal: controller.signal,
    epoch,
    release: () => {
      if (released) return;
      released = true;
      activeRequests.delete(controller);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

export function bindResponseToAuthSession(
  response: Response,
  request: AuthBoundRequest,
): Response {
  assertAuthSessionStable(request.epoch);
  if (response.body === null) {
    request.release();
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        assertAuthSessionStable(request.epoch);
        const chunk = await reader.read();
        assertAuthSessionStable(request.epoch);
        if (chunk.done) {
          request.release();
          controller.close();
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        request.release();
        controller.error(error);
      }
    },
    async cancel(reason) {
      request.release();
      await reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function subscribeAuthSessionTransition(listener: TransitionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function waitForAuthSessionStable(signal?: AbortSignal): Promise<void> {
  if (transitionState === 'stable') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;

    const cleanup = () => {
      unsubscribe();
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal?.reason instanceof Error
        ? signal.reason
        : new DOMException('等待认证会话稳定已取消', 'AbortError'));
    };

    unsubscribe = subscribeAuthSessionTransition((state) => {
      if (state === 'stable') finish();
    });
    signal?.addEventListener('abort', onAbort, { once: true });

    // 订阅建立前后的状态可能恰好完成切换；二次读取避免错过 stable 通知。
    if (signal?.aborted) {
      onAbort();
    } else if (transitionState === 'stable') {
      finish();
    }
  });
}

export function resetAuthSessionTransitionForTests(): void {
  activeRequests.clear();
  listeners.clear();
  transitionState = 'stable';
  transitionEpoch = 0;
}
