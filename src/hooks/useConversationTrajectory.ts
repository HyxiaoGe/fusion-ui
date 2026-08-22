import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'react-redux';

import { getTrajectoryRuns, getTrajectorySnapshot } from '@/lib/api/trajectory';
import { selectStableAuthIdentity } from '@/lib/auth/authIdentity';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import type { AppDispatch, RootState } from '@/redux/store';
import {
  selectTrajectoryConversation,
  selectTrajectoryRuns,
  touchTrajectorySnapshot,
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
  type TrajectorySnapshotRequestPurpose,
} from '@/redux/slices/trajectorySlice';
import { ApiError } from '@/types/api';

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

interface ActiveSnapshotRequest extends ActiveRequest {
  conversationId: string;
  runId: string;
}

interface StoreRequestCoordinator {
  runListRequests: Map<string, ActiveRequest>;
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
  const trajectoryState = useAppSelector(state => state.trajectory);
  const conversation = conversationId
    ? selectTrajectoryConversation({ trajectory: trajectoryState }, conversationId)
    : undefined;
  const runs = useMemo(() => (
    conversationId
      ? selectTrajectoryRuns({ trajectory: trajectoryState }, conversationId)
      : []
  ), [conversationId, trajectoryState]);
  const consumerIdRef = useRef(Symbol('trajectory-consumer'));
  const runListSubscriptionRef = useRef<RequestSubscription | null>(null);
  const snapshotSubscriptionRef = useRef<RequestSubscription | null>(null);

  const requestRunList = useCallback((targetConversationId: string) => {
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
      return;
    }
    const requestId = nextRequestId('runs');
    const controller = new AbortController();
    const activeRequest: ActiveRequest = {
      requestId,
      controller,
      subscribers: new Set([consumerId]),
      dispatch,
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
          return;
        }
        dispatch(trajectoryRunListReceived({
          conversationId: targetConversationId,
          requestId,
          response,
        }));
      })
      .catch(error => {
        if (coordinator.runListRequests.get(targetConversationId) !== activeRequest) return;
        coordinator.runListRequests.delete(targetConversationId);
        if (controller.signal.aborted) {
          dispatch(trajectoryRunListCancelled({
            conversationId: targetConversationId,
            requestId,
          }));
          return;
        }
        if (authScopeKey(store.getState()) !== authScope) {
          dispatch(trajectoryRunListCancelled({
            conversationId: targetConversationId,
            requestId,
          }));
          return;
        }
        if (isNotFound(error)) {
          dispatch(trajectoryRunListUnavailable({
            conversationId: targetConversationId,
            requestId,
          }));
          return;
        }
        dispatch(trajectoryRunListFailed({
          conversationId: targetConversationId,
          requestId,
          error: errorMessage(error, '轨迹运行列表加载失败'),
        }));
      });
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
    const status = conversation?.runListStatus ?? 'idle';
    const activeRequestId = conversation?.activeRunListRequestId;
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
    conversation?.activeRunListRequestId,
    conversation?.runListStatus,
    conversationId,
    requestRunList,
    store,
  ]);

  const selectedRunId = conversation?.selectedRunId ?? null;

  useEffect(() => () => {
    releaseRequestSubscription(snapshotSubscriptionRef.current);
    snapshotSubscriptionRef.current = null;
  }, [authScope, conversationId, selectedRunId, store]);

  const snapshot = selectedRunId
    ? conversation?.snapshotsByRunId[selectedRunId]
    : undefined;
  const reconciliation = selectedRunId
    ? conversation?.reconciliationByRunId[selectedRunId]
    : undefined;
  const inspectNeedsSnapshot = Boolean(
    selectedRunId && conversation?.inspectRequest?.runId === selectedRunId,
  );
  const shouldHydrateSnapshot = Boolean(
    selectedRunId
    && (
      conversation?.activeSurface === 'trajectory'
      || inspectNeedsSnapshot
      || reconciliation?.status === 'reconciling'
    ),
  );
  const snapshotLruTail = conversation?.snapshotLru.at(-1) ?? null;

  useEffect(() => {
    if (!conversationId || !selectedRunId || !shouldHydrateSnapshot) return;
    if (snapshot && reconciliation?.status !== 'reconciling') {
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
    snapshot,
    snapshotLruTail,
    store,
  ]);

  const refreshRuns = useCallback(() => {
    if (!conversationId || conversation?.activeRunListRequestId) return;
    requestRunList(conversationId);
  }, [conversation?.activeRunListRequestId, conversationId, requestRunList]);

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
    runs,
    runListStatus: conversation?.runListStatus ?? 'idle',
    runListError: conversation?.runListError ?? null,
    runsTruncated: conversation?.runsTruncated ?? false,
    selectedMessageId: conversation?.selectedMessageId ?? null,
    selectedRunId,
    selectedSpanId: conversation?.selectedSpanId ?? null,
    selectionSource: conversation?.selectionSource ?? 'none',
    activeSurface: conversation?.activeSurface ?? 'chat',
    inspectRequest: conversation?.inspectRequest ?? null,
    snapshot,
    reconciliation,
    refreshRuns,
    retrySelectedSnapshot,
  };
}
