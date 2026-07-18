import { useCallback, useEffect, useRef } from 'react';
import { submitAgentContextResult } from '@/lib/api/chat';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setContextRequestPhase } from '@/redux/slices/streamSlice';
import type {
  AgentContextLocation,
  PendingAgentContextRequest,
  SubmitAgentContextResultInput,
} from '@/types/agentRun';

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
};

const GEOLOCATION_RETRY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 25_000,
  maximumAge: 0,
};

type ContextSubmission = Omit<SubmitAgentContextResultInput, 'conversationId' | 'runId' | 'requestId'>;

function requestKey(request: PendingAgentContextRequest | null): string | null {
  return request ? `${request.conversationId}:${request.runId}:${request.requestId}` : null;
}

function unavailableResult(reason: string): ContextSubmission {
  return { status: 'unavailable', reason };
}

function mapPositionError(error: GeolocationPositionError): ContextSubmission {
  if (error.code === 1) {
    return { status: 'denied', reason: 'permission_denied' };
  }
  if (error.code === 3) {
    return { status: 'timeout', reason: 'geolocation_timeout' };
  }
  return unavailableResult('position_unavailable');
}

function mapPosition(position: GeolocationPosition): ContextSubmission {
  const { latitude, longitude, accuracy } = position.coords;
  if (
    !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
    || !Number.isFinite(accuracy)
    || accuracy > 50_000
  ) {
    return unavailableResult('position_unavailable');
  }

  const location: AgentContextLocation = {
    latitude,
    longitude,
    accuracyM: Math.max(0, accuracy),
    acquiredAt: Math.floor(
      (Number.isFinite(position.timestamp) && position.timestamp > 0
        ? position.timestamp
        : Date.now()) / 1000,
    ),
  };
  return { status: 'provided', location };
}

function requestBrowserLocation(options: PositionOptions): Promise<ContextSubmission> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(unavailableResult('browser_unsupported'));
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve(mapPosition(position)),
      error => resolve(mapPositionError(error)),
      options,
    );
  });
}

async function getBrowserLocation(): Promise<ContextSubmission> {
  const initial = await requestBrowserLocation(GEOLOCATION_OPTIONS);
  if (initial.status !== 'timeout' && initial.reason !== 'position_unavailable') {
    return initial;
  }
  return requestBrowserLocation(GEOLOCATION_RETRY_OPTIONS);
}

export function useLocationContextHandshake(conversationId: string | null) {
  const dispatch = useAppDispatch();
  const request = useAppSelector((state) => {
    const pending = state.stream.pendingContextRequest;
    return pending && pending.conversationId === conversationId ? pending : null;
  });
  const requestRef = useRef(request);
  const cachedSubmissionRef = useRef<ContextSubmission | null>(null);
  const previousRequestKeyRef = useRef<string | null>(null);
  const locatingRef = useRef(false);
  const submittingRef = useRef(false);
  requestRef.current = request;

  const currentRequestKey = requestKey(request);
  useEffect(() => {
    if (previousRequestKeyRef.current !== currentRequestKey) {
      previousRequestKeyRef.current = currentRequestKey;
      cachedSubmissionRef.current = null;
      locatingRef.current = false;
      submittingRef.current = false;
    }
  }, [currentRequestKey]);

  const setPhase = useCallback((
    target: PendingAgentContextRequest,
    phase: PendingAgentContextRequest['phase'],
  ) => {
    dispatch(setContextRequestPhase({
      runId: target.runId,
      requestId: target.requestId,
      phase,
    }));
  }, [dispatch]);

  const submit = useCallback(async (
    target: PendingAgentContextRequest,
    submission: ContextSubmission,
  ) => {
    if (submittingRef.current) return;
    const targetKey = requestKey(target);
    if (!targetKey || requestKey(requestRef.current) !== targetKey) return;

    submittingRef.current = true;
    cachedSubmissionRef.current = submission;
    setPhase(target, 'submitting');
    try {
      await submitAgentContextResult({
        conversationId: target.conversationId,
        runId: target.runId,
        requestId: target.requestId,
        ...submission,
      } as SubmitAgentContextResultInput);
    } catch {
      if (requestKey(requestRef.current) === targetKey) {
        setPhase(target, 'submit_failed');
      }
    } finally {
      submittingRef.current = false;
    }
  }, [setPhase]);

  const allowLocation = useCallback(async () => {
    const target = requestRef.current;
    if (!target || locatingRef.current || submittingRef.current) return;
    const targetKey = requestKey(target);
    locatingRef.current = true;
    setPhase(target, 'locating');
    try {
      const submission = await getBrowserLocation();
      if (requestKey(requestRef.current) !== targetKey) return;
      await submit(target, submission);
    } finally {
      locatingRef.current = false;
    }
  }, [setPhase, submit]);

  const declineLocation = useCallback(async () => {
    const target = requestRef.current;
    if (!target || locatingRef.current || submittingRef.current) return;
    await submit(target, { status: 'denied', reason: 'user_declined' });
  }, [submit]);

  const retrySubmission = useCallback(async () => {
    const target = requestRef.current;
    const cachedSubmission = cachedSubmissionRef.current;
    if (!target || !cachedSubmission || locatingRef.current || submittingRef.current) return;
    await submit(target, cachedSubmission);
  }, [submit]);

  return {
    request,
    allowLocation,
    declineLocation,
    retrySubmission,
  };
}
