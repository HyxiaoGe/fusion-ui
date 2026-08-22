import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import { getTrajectoryRuns, getTrajectorySnapshot } from '@/lib/api/trajectory';
import { selectStableAuthIdentity } from '@/lib/auth/authIdentity';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import type { AppDispatch, RootState } from '@/redux/store';
import {
  selectTrajectoryConversation,
  getVisibleTrajectoryRuns,
  touchTrajectorySnapshot,
  trajectoryAuthScopeChanged,
  trajectoryRunListCancelled,
  trajectoryRunListFailed,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
  trajectoryRunListUnavailable,
  trajectorySnapshotCancelled,
  trajectorySnapshotFailed,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
  trajectorySnapshotUnavailable,
  type TrajectoryReconciliationState,
  type TrajectorySnapshotCacheEntry,
  type TrajectorySnapshotRequestPurpose,
} from '@/redux/slices/trajectorySlice';
import { ApiError } from '@/types/api';
import type { NormalizedTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import type { TrajectoryRunSummary } from '@/types/trajectory';

let requestSequence = 0;

function nextRequestId(kind: 'runs' | 'snapshot'): string {
  requestSequence += 1;
  return `trajectory-${kind}-${requestSequence}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NOT_FOUND';
}

interface ActiveRequest {
  requestId: string;
  controller: AbortController;
  subscribers: Set<symbol>;
  dispatch: AppDispatch;
}

export type RunListRefreshResult = 'ready' | 'failed' | 'unavailable' | 'cancelled';

interface ActiveRunListRequest extends ActiveRequest {
  completion: Promise<RunListRefreshResult>;
  resolveCompletion: (result: RunListRefreshResult) => void;
}

interface ActiveSnapshotRequest extends ActiveRequest {
  conversationId: string;
  runId: string;
}

interface StoreRequestCoordinator {
  runListRequests: Map<string, ActiveRunListRequest>;
  snapshotRequests: Map<string, ActiveSnapshotRequest>;
}

interface RequestSubscription {
  coordinator: StoreRequestCoordinator;
  key: string;
  requestId: string;
  consumerId: symbol;
  kind: 'runs' | 'snapshot';
}

const ANONYMOUS_AUTH_SCOPE = '__anonymous__';
const requestCoordinators = new WeakMap<object, Map<string, StoreRequestCoordinator>>();
const EMPTY_RUNS: TrajectoryRunSummary[] = [];
const EMPTY_RUN_SUMMARIES: Record<string, TrajectoryRunSummary> = {};
const EMPTY_PROVISIONAL_RUN_IDS: string[] = [];
const EMPTY_SNAPSHOT_MAP: Record<string, TrajectorySnapshotCacheEntry> = {};
const EMPTY_LIVE_EVENT_MAP: Record<string, NormalizedTrajectoryEvent[]> = {};

interface FrameBatchedTrajectoryDetail {
  identity: string;
  snapshot: TrajectorySnapshotCacheEntry | undefined;
  liveEvents: NormalizedTrajectoryEvent[];
}

const EMPTY_BATCHED_DETAIL: FrameBatchedTrajectoryDetail = {
  identity: '',
  snapshot: undefined,
  liveEvents: [],
};

function authScopeKey(state: RootState): string {
  return selectStableAuthIdentity(state) ?? ANONYMOUS_AUTH_SCOPE;
}

function requestCoordinator(
  store: object,
  authScope: string,
): StoreRequestCoordinator {
  let coordinatorsByAuth = requestCoordinators.get(store);
  if (!coordinatorsByAuth) {
    coordinatorsByAuth = new Map();
    requestCoordinators.set(store, coordinatorsByAuth);
  }
  let coordinator = coordinatorsByAuth.get(authScope);
  if (!coordinator) {
    coordinator = { runListRequests: new Map(), snapshotRequests: new Map() };
    coordinatorsByAuth.set(authScope, coordinator);
  }
  return coordinator;
}

function snapshotRequestKey(conversationId: string, runId: string): string {
  return `${conversationId}\u0000${runId}`;
}

function trajectoryDetailIdentity(
  authScope: string,
  conversationId: string,
  runId: string,
): string {
  return `${authScope}\u0000${conversationId}\u0000${runId}`;
}

function readTrajectoryDetail(
  store: { getState: () => RootState },
  conversationId: string,
  runId: string,
  identity: string,
): FrameBatchedTrajectoryDetail {
  const conversation = selectTrajectoryConversation(store.getState(), conversationId);
  return {
    identity,
    snapshot: conversation?.snapshotsByRunId[runId],
    liveEvents: conversation?.liveEventsByRunId[runId] ?? [],
  };
}

function useFrameBatchedTrajectoryDetail(
  store: { getState: () => RootState; subscribe: (listener: () => void) => () => void },
  authScope: string,
  conversationId: string | null,
  runId: string | null,
  enabled: boolean,
): FrameBatchedTrajectoryDetail {
  const identity = enabled && conversationId && runId
    ? trajectoryDetailIdentity(authScope, conversationId, runId)
    : '';
  const [detail, setDetail] = useState<FrameBatchedTrajectoryDetail>(() => (
    identity && conversationId && runId
      ? readTrajectoryDetail(store, conversationId, runId, identity)
      : EMPTY_BATCHED_DETAIL
  ));

  useEffect(() => {
    if (!identity || !conversationId || !runId) {
      setDetail(EMPTY_BATCHED_DETAIL);
      return;
    }
    setDetail(readTrajectoryDetail(store, conversationId, runId, identity));
  }, [conversationId, identity, runId, store]);

  useEffect(() => {
    if (!identity || !conversationId || !runId) return;
    let active = true;
    let current = readTrajectoryDetail(store, conversationId, runId, identity);
    let frameId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (!active) return;
      frameId = null;
      timeoutId = null;
      setDetail(current);
    };
    const unsubscribe = store.subscribe(() => {
      const next = readTrajectoryDetail(store, conversationId, runId, identity);
      if (next.snapshot === current.snapshot && next.liveEvents === current.liveEvents) return;
      const snapshotIdentityChanged = next.snapshot?.snapshotRequestId
        !== current.snapshot?.snapshotRequestId;
      current = next;
      if (snapshotIdentityChanged) {
        if (frameId !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        setDetail(next);
        return;
      }
      if (frameId !== null || timeoutId !== null) return;
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        frameId = window.requestAnimationFrame(flush);
      } else {
        timeoutId = setTimeout(flush, 16);
      }
    });
    return () => {
      active = false;
      unsubscribe();
      if (frameId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [conversationId, identity, runId, store]);

  if (!identity || !conversationId || !runId) return EMPTY_BATCHED_DETAIL;
  return detail.identity === identity
    ? detail
    : readTrajectoryDetail(store, conversationId, runId, identity);
}

function releaseRequestSubscription(subscription: RequestSubscription | null): void {
  if (!subscription) return;
  const requests = subscription.kind === 'runs'
    ? subscription.coordinator.runListRequests
    : subscription.coordinator.snapshotRequests;
  const active = requests.get(subscription.key);
  if (!active || active.requestId !== subscription.requestId) return;
  active.subscribers.delete(subscription.consumerId);
  if (active.subscribers.size > 0) return;
  requests.delete(subscription.key);
  active.controller.abort();
  if (subscription.kind === 'runs') {
    (active as ActiveRunListRequest).resolveCompletion('cancelled');
    active.dispatch(trajectoryRunListCancelled({
      conversationId: subscription.key,
      requestId: active.requestId,
    }));
    return;
  }
  const snapshotRequest = active as ActiveSnapshotRequest;
  active.dispatch(trajectorySnapshotCancelled({
    conversationId: snapshotRequest.conversationId,
    runId: snapshotRequest.runId,
    requestId: active.requestId,
  }));
}

/**
 * 编排会话级轨迹的历史读取：首载 run list，按可见/inspect/终态需要水合单个 run。
 * 网络生命周期只在这里发生，Redux requestId 继续作为迟到响应的最终门禁。
 */
export function useConversationTrajectory(conversationId: string | null) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const authScope = useAppSelector(authScopeKey);
  const trajectoryAuthScope = useAppSelector(state => state.trajectory.authScope);
  const isCurrentAuthScope = trajectoryAuthScope === authScope;
  const serverRuns = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.runs ?? EMPTY_RUNS
      : EMPTY_RUNS
  ));
  const runSummariesById = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.runSummariesById
        ?? EMPTY_RUN_SUMMARIES
      : EMPTY_RUN_SUMMARIES
  ));
  const provisionalRunIds = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.provisionalRunIds
        ?? EMPTY_PROVISIONAL_RUN_IDS
      : EMPTY_PROVISIONAL_RUN_IDS
  ));
  const selectedRunId = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.selectedRunId ?? null
      : null
  ));
  const runs = useMemo(() => (
    getVisibleTrajectoryRuns({
      runs: serverRuns,
      runSummariesById,
      provisionalRunIds,
      selectedRunId,
    })
  ), [provisionalRunIds, runSummariesById, selectedRunId, serverRuns]);
  const runListStatus = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.runListStatus ?? 'idle'
      : 'idle'
  ));
  const runListError = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.runListError ?? null
      : null
  ));
  const activeRunListRequestId = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.activeRunListRequestId ?? null
      : null
  ));
  const runsTruncated = useAppSelector(state => Boolean(
    conversationId
    && isCurrentAuthScope
    && state.trajectory.byConversationId[conversationId]?.runsTruncated
  ));
  const selectedMessageId = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.selectedMessageId ?? null
      : null
  ));
  const selectedSpanId = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.selectedSpanId ?? null
      : null
  ));
  const selectionSource = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.selectionSource ?? 'none'
      : 'none'
  ));
  const activeSurface = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.activeSurface ?? 'chat'
      : 'chat'
  ));
  const scrollMode = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.scrollMode ?? 'follow-live'
      : 'follow-live'
  ));
  const isInspectorOpen = useAppSelector(state => Boolean(
    conversationId
    && isCurrentAuthScope
    && state.trajectory.byConversationId[conversationId]?.isInspectorOpen
  ));
  const inspectRequest = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.inspectRequest ?? null
      : null
  ));
  const reconciliation = useAppSelector<TrajectoryReconciliationState | undefined>(state => (
    conversationId && selectedRunId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.reconciliationByRunId[selectedRunId]
      : undefined
  ));
  const selectedSnapshotExists = useAppSelector(state => Boolean(
    conversationId
    && selectedRunId
    && isCurrentAuthScope
    && state.trajectory.byConversationId[conversationId]?.snapshotsByRunId[selectedRunId]
  ));
  const selectedSnapshotRequestId = useAppSelector(state => (
    conversationId && selectedRunId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]
        ?.snapshotsByRunId[selectedRunId]?.snapshotRequestId ?? null
      : null
  ));
  const snapshotLruTail = useAppSelector(state => (
    conversationId && isCurrentAuthScope
      ? state.trajectory.byConversationId[conversationId]?.snapshotLru.at(-1) ?? null
      : null
  ));
  const detailEnabled = activeSurface === 'trajectory'
    || Boolean(inspectRequest && inspectRequest.runId === selectedRunId);
  const batchedDetail = useFrameBatchedTrajectoryDetail(
    store,
    authScope,
    conversationId,
    selectedRunId,
    detailEnabled,
  );
  const passiveSnapshot = useMemo(() => (
    conversationId && selectedRunId && selectedSnapshotRequestId
      ? selectTrajectoryConversation(store.getState(), conversationId)
        ?.snapshotsByRunId[selectedRunId]
      : undefined
  ), [conversationId, selectedRunId, selectedSnapshotRequestId, store]);
  const snapshot = detailEnabled ? batchedDetail.snapshot : passiveSnapshot;
  const snapshotsByRunId = useMemo(() => (
    selectedRunId && snapshot
      ? { [selectedRunId]: snapshot }
      : EMPTY_SNAPSHOT_MAP
  ), [selectedRunId, snapshot]);
  const liveEventsByRunId = useMemo(() => (
    selectedRunId && detailEnabled
      ? { [selectedRunId]: batchedDetail.liveEvents }
      : EMPTY_LIVE_EVENT_MAP
  ), [batchedDetail.liveEvents, detailEnabled, selectedRunId]);
  const consumerIdRef = useRef(Symbol('trajectory-consumer'));
  const runListSubscriptionRef = useRef<RequestSubscription | null>(null);
  const snapshotSubscriptionRef = useRef<RequestSubscription | null>(null);

  useEffect(() => {
    dispatch(trajectoryAuthScopeChanged({ authScope }));
  }, [authScope, dispatch]);

  const requestRunList = useCallback((targetConversationId: string): Promise<RunListRefreshResult> => {
    const coordinator = requestCoordinator(store, authScope);
    const consumerId = consumerIdRef.current;
    const existing = coordinator.runListRequests.get(targetConversationId);
    if (existing) {
      existing.subscribers.add(consumerId);
      runListSubscriptionRef.current = {
        coordinator,
        key: targetConversationId,
        requestId: existing.requestId,
        consumerId,
        kind: 'runs',
      };
      return existing.completion;
    }
    const requestId = nextRequestId('runs');
    const controller = new AbortController();
    let resolveCompletion!: (result: RunListRefreshResult) => void;
    const completion = new Promise<RunListRefreshResult>((resolve) => {
      resolveCompletion = resolve;
    });
    const activeRequest: ActiveRunListRequest = {
      requestId,
      controller,
      subscribers: new Set([consumerId]),
      dispatch,
      completion,
      resolveCompletion,
    };
    coordinator.runListRequests.set(targetConversationId, activeRequest);
    runListSubscriptionRef.current = {
      coordinator,
      key: targetConversationId,
      requestId,
      consumerId,
      kind: 'runs',
    };
    dispatch(trajectoryRunListRequested({
      conversationId: targetConversationId,
      requestId,
    }));

    void getTrajectoryRuns(targetConversationId, controller.signal)
      .then(response => {
        if (coordinator.runListRequests.get(targetConversationId) !== activeRequest) return;
        coordinator.runListRequests.delete(targetConversationId);
        if (authScopeKey(store.getState()) !== authScope) {
          dispatch(trajectoryRunListCancelled({
            conversationId: targetConversationId,
            requestId,
          }));
          resolveCompletion('cancelled');
          return;
        }
        dispatch(trajectoryRunListReceived({
          conversationId: targetConversationId,
          requestId,
          response,
        }));
        resolveCompletion('ready');
      })
      .catch(error => {
        if (coordinator.runListRequests.get(targetConversationId) !== activeRequest) return;
        coordinator.runListRequests.delete(targetConversationId);
        if (controller.signal.aborted) {
          dispatch(trajectoryRunListCancelled({
            conversationId: targetConversationId,
            requestId,
          }));
          resolveCompletion('cancelled');
          return;
        }
        if (authScopeKey(store.getState()) !== authScope) {
          dispatch(trajectoryRunListCancelled({
            conversationId: targetConversationId,
            requestId,
          }));
          resolveCompletion('cancelled');
          return;
        }
        if (isNotFound(error)) {
          dispatch(trajectoryRunListUnavailable({
            conversationId: targetConversationId,
            requestId,
          }));
          resolveCompletion('unavailable');
          return;
        }
        dispatch(trajectoryRunListFailed({
          conversationId: targetConversationId,
          requestId,
          error: errorMessage(error, '轨迹运行列表加载失败'),
        }));
        resolveCompletion('failed');
      });
    return completion;
  }, [authScope, dispatch, store]);

  const requestSnapshot = useCallback((
    targetConversationId: string,
    runId: string,
    purpose: TrajectorySnapshotRequestPurpose,
  ) => {
    const coordinator = requestCoordinator(store, authScope);
    const requestKey = snapshotRequestKey(targetConversationId, runId);
    const consumerId = consumerIdRef.current;
    const existing = coordinator.snapshotRequests.get(requestKey);
    if (existing) {
      existing.subscribers.add(consumerId);
      snapshotSubscriptionRef.current = {
        coordinator,
        key: requestKey,
        requestId: existing.requestId,
        consumerId,
        kind: 'snapshot',
      };
      return;
    }
    const requestId = nextRequestId('snapshot');
    const controller = new AbortController();
    const activeRequest: ActiveSnapshotRequest = {
      conversationId: targetConversationId,
      runId,
      requestId,
      controller,
      subscribers: new Set([consumerId]),
      dispatch,
    };
    coordinator.snapshotRequests.set(requestKey, activeRequest);
    snapshotSubscriptionRef.current = {
      coordinator,
      key: requestKey,
      requestId,
      consumerId,
      kind: 'snapshot',
    };
    dispatch(trajectorySnapshotRequested({
      conversationId: targetConversationId,
      runId,
      requestId,
      purpose,
    }));

    void getTrajectorySnapshot(targetConversationId, runId, controller.signal)
      .then(snapshot => {
        if (coordinator.snapshotRequests.get(requestKey) !== activeRequest) return;
        coordinator.snapshotRequests.delete(requestKey);
        if (authScopeKey(store.getState()) !== authScope) {
          dispatch(trajectorySnapshotCancelled({
            conversationId: targetConversationId,
            runId,
            requestId,
          }));
          return;
        }
        dispatch(trajectorySnapshotReceived({
          conversationId: targetConversationId,
          requestId,
          snapshot,
        }));
      })
      .catch(error => {
        if (coordinator.snapshotRequests.get(requestKey) !== activeRequest) return;
        coordinator.snapshotRequests.delete(requestKey);
        if (controller.signal.aborted) {
          dispatch(trajectorySnapshotCancelled({
            conversationId: targetConversationId,
            runId,
            requestId,
          }));
          return;
        }
        if (authScopeKey(store.getState()) !== authScope) {
          dispatch(trajectorySnapshotCancelled({
            conversationId: targetConversationId,
            runId,
            requestId,
          }));
          return;
        }
        if (isNotFound(error)) {
          dispatch(trajectorySnapshotUnavailable({
            conversationId: targetConversationId,
            runId,
            requestId,
          }));
          return;
        }
        dispatch(trajectorySnapshotFailed({
          conversationId: targetConversationId,
          runId,
          requestId,
          error: errorMessage(error, '轨迹快照加载失败'),
        }));
      });
  }, [authScope, dispatch, store]);

  useEffect(() => () => {
    releaseRequestSubscription(runListSubscriptionRef.current);
    runListSubscriptionRef.current = null;
  }, [authScope, conversationId, store]);

  useEffect(() => {
    if (!conversationId) return;
    const status = runListStatus;
    const activeRequestId = activeRunListRequestId;
    if (activeRequestId) {
      const active = requestCoordinator(store, authScope)
        .runListRequests.get(conversationId);
      if (active?.requestId === activeRequestId) requestRunList(conversationId);
      return;
    }
    if (status !== 'idle') return;
    requestRunList(conversationId);
  }, [
    authScope,
    activeRunListRequestId,
    conversationId,
    requestRunList,
    runListStatus,
    store,
  ]);

  useEffect(() => () => {
    releaseRequestSubscription(snapshotSubscriptionRef.current);
    snapshotSubscriptionRef.current = null;
  }, [authScope, conversationId, selectedRunId, store]);

  const inspectNeedsSnapshot = Boolean(
    selectedRunId && inspectRequest?.runId === selectedRunId,
  );
  const shouldHydrateSnapshot = Boolean(
    selectedRunId
    && (
      activeSurface === 'trajectory'
      || inspectNeedsSnapshot
      || reconciliation?.status === 'reconciling'
    ),
  );

  useEffect(() => {
    if (!conversationId || !selectedRunId || !shouldHydrateSnapshot) return;
    if (selectedSnapshotExists && reconciliation?.status !== 'reconciling') {
      if (snapshotLruTail !== selectedRunId) {
        dispatch(touchTrajectorySnapshot({ conversationId, runId: selectedRunId }));
      }
      return;
    }
    if (reconciliation?.activeRequestId) {
      const active = requestCoordinator(store, authScope)
        .snapshotRequests.get(snapshotRequestKey(conversationId, selectedRunId));
      if (active?.requestId === reconciliation.activeRequestId) {
        requestSnapshot(
          conversationId,
          selectedRunId,
          reconciliation.activeRequestPurpose ?? 'hydrate',
        );
      }
      return;
    }
    if (reconciliation?.status === 'failed' || reconciliation?.status === 'unavailable') return;
    requestSnapshot(
      conversationId,
      selectedRunId,
      reconciliation?.status === 'reconciling' ? 'reconcile' : 'hydrate',
    );
  }, [
    authScope,
    conversationId,
    dispatch,
    reconciliation?.activeRequestId,
    reconciliation?.activeRequestPurpose,
    reconciliation?.status,
    requestSnapshot,
    selectedRunId,
    shouldHydrateSnapshot,
    selectedSnapshotExists,
    snapshotLruTail,
    store,
  ]);

  const refreshRuns = useCallback((): Promise<RunListRefreshResult> => {
    if (!conversationId) return Promise.resolve('cancelled');
    const activeRequest = requestCoordinator(store, authScope)
      .runListRequests.get(conversationId);
    if (activeRequest) {
      return requestRunList(conversationId).then((result) => {
        if (result !== 'ready' || authScopeKey(store.getState()) !== authScope) {
          return result === 'ready' ? 'cancelled' : result;
        }
        return requestRunList(conversationId);
      });
    }
    return requestRunList(conversationId);
  }, [authScope, conversationId, requestRunList, store]);

  const retrySelectedSnapshot = useCallback(() => {
    if (!conversationId || !selectedRunId || reconciliation?.activeRequestId) return;
    requestSnapshot(conversationId, selectedRunId, 'hydrate');
  }, [
    conversationId,
    reconciliation?.activeRequestId,
    requestSnapshot,
    selectedRunId,
  ]);

  return {
    projectionIdentity: `${authScope}\u0000${conversationId ?? ''}`,
    runs,
    runSummariesById,
    snapshotsByRunId,
    liveEventsByRunId,
    runListStatus,
    runListError,
    runsTruncated,
    selectedMessageId,
    selectedRunId,
    selectedSpanId,
    selectionSource,
    activeSurface,
    scrollMode,
    isInspectorOpen,
    inspectRequest,
    snapshot,
    reconciliation,
    refreshRuns,
    retrySelectedSnapshot,
  };
}
