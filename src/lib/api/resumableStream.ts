import {
  isRecoverableStreamError,
  type StreamCallbacks,
} from './chat';

export const DEFAULT_STREAM_RECONNECT_DELAYS_MS = [0, 250, 750] as const;

export type ResumableStreamPhase = 'reconnecting' | 'streaming';

export interface RunResumableStreamOptions {
  callbacks: StreamCallbacks;
  signal: AbortSignal;
  openInitial: (
    callbacks: StreamCallbacks,
    signal: AbortSignal,
  ) => Promise<void>;
  openReconnect: (
    lastEntryId: string,
    callbacks: StreamCallbacks,
    signal: AbortSignal,
  ) => Promise<unknown>;
  retryDelaysMs?: readonly number[];
  onPhaseChange?: (phase: ResumableStreamPhase) => void;
}

function abortError(): Error {
  const error = new Error('流式请求已取消');
  error.name = 'AbortError';
  return error;
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runResumableStream({
  callbacks,
  signal,
  openInitial,
  openReconnect,
  retryDelaysMs = DEFAULT_STREAM_RECONNECT_DELAYS_MS,
  onPhaseChange,
}: RunResumableStreamOptions): Promise<void> {
  let lastEntryId = '0';
  let reconnecting = false;
  const wrappedCallbacks: StreamCallbacks = {
    ...callbacks,
    onEntryId: entryId => {
      lastEntryId = entryId;
      if (reconnecting) {
        reconnecting = false;
        onPhaseChange?.('streaming');
      }
      callbacks.onEntryId?.(entryId);
    },
  };

  let failure: unknown;
  try {
    await openInitial(wrappedCallbacks, signal);
    return;
  } catch (error) {
    failure = error;
  }

  if (signal.aborted) {
    throw abortError();
  }
  if (!isRecoverableStreamError(failure)) {
    throw failure;
  }

  for (const delayMs of retryDelaysMs) {
    await waitForRetry(delayMs, signal);
    reconnecting = true;
    onPhaseChange?.('reconnecting');
    try {
      await openReconnect(lastEntryId, wrappedCallbacks, signal);
      return;
    } catch (error) {
      failure = error;
      if (signal.aborted) {
        throw abortError();
      }
      if (!isRecoverableStreamError(error)) {
        throw error;
      }
    }
  }

  throw failure;
}
