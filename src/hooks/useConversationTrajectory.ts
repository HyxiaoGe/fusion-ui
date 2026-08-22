import { useCallback, useEffect, useMemo, useRef } from 'react';

import { getTrajectoryRuns, getTrajectorySnapshot } from '@/lib/api/trajectory';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  selectTrajectoryConversation,
  selectTrajectoryRuns,
  touchTrajectorySnapshot,
  trajectoryRunListCancelled,
  trajectoryRunListFailed,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
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
  conversationId: string;
  requestId: string;
  controller: AbortController;
}

interface ActiveSnapshotRequest extends ActiveRequest {
  runId: string;
}

const sharedRunListRequests = new Map<string, ActiveRequest>();
const sharedSnapshotRequests = new Map<string, ActiveSnapshotRequest>();

function snapshotRequestKey(conversationId: string, runId: string): string {
  return `${conversationId}\u0000${runId}`;
}

/**
 * 编排会话级轨迹的历史读取：首载 run list，按可见/inspect/终态需要水合单个 run。
 * 网络生命周期只在这里发生，Redux requestId 继续作为迟到响应的最终门禁。
 */
export function useConversationTrajectory(conversationId: string | null) {
  const dispatch = useAppDispatch();
  const trajectoryState = useAppSelector(state => state.trajectory);
  const conversation = conversationId
    ? selectTrajectoryConversation({ trajectory: trajectoryState }, conversationId)
    : undefined;
  const runs = useMemo(() => (
    conversationId
      ? selectTrajectoryRuns({ trajectory: trajectoryState }, conversationId)
      : []
  ), [conversationId, trajectoryState]);
  const runListRequestRef = useRef<ActiveRequest | null>(null);
  const snapshotRequestRef = useRef<ActiveSnapshotRequest | null>(null);

  const requestRunList = useCallback((targetConversationId: string) => {
    if (sharedRunListRequests.has(targetConversationId)) return;
    const requestId = nextRequestId('runs');
    const controller = new AbortController();
    const activeRequest = { conversationId: targetConversationId, requestId, controller };
    runListRequestRef.current = activeRequest;
    sharedRunListRequests.set(targetConversationId, activeRequest);
    const releaseRequest = () => {
      if (sharedRunListRequests.get(targetConversationId) === activeRequest) {
        sharedRunListRequests.delete(targetConversationId);
      }
      if (runListRequestRef.current === activeRequest) runListRequestRef.current = null;
    };
    dispatch(trajectoryRunListRequested({
      conversationId: targetConversationId,
      requestId,
    }));

    void getTrajectoryRuns(targetConversationId, controller.signal)
      .then(response => {
        releaseRequest();
        dispatch(trajectoryRunListReceived({
          conversationId: targetConversationId,
          requestId,
          response,
        }));
      })
      .catch(error => {
        releaseRequest();
        if (controller.signal.aborted) {
          dispatch(trajectoryRunListCancelled({
            conversationId: targetConversationId,
            requestId,
          }));
          return;
        }
        if (isNotFound(error)) {
          dispatch(trajectoryRunListReceived({
            conversationId: targetConversationId,
            requestId,
            response: { items: [], truncated: false },
          }));
          return;
        }
        dispatch(trajectoryRunListFailed({
          conversationId: targetConversationId,
          requestId,
          error: errorMessage(error, '轨迹运行列表加载失败'),
        }));
      });
  }, [dispatch]);

  const requestSnapshot = useCallback((
    targetConversationId: string,
    runId: string,
    purpose: TrajectorySnapshotRequestPurpose,
  ) => {
    const requestKey = snapshotRequestKey(targetConversationId, runId);
    if (sharedSnapshotRequests.has(requestKey)) return;
    const requestId = nextRequestId('snapshot');
    const controller = new AbortController();
    const activeRequest = {
      conversationId: targetConversationId,
      runId,
      requestId,
      controller,
    };
    snapshotRequestRef.current = activeRequest;
    sharedSnapshotRequests.set(requestKey, activeRequest);
    const releaseRequest = () => {
      if (sharedSnapshotRequests.get(requestKey) === activeRequest) {
        sharedSnapshotRequests.delete(requestKey);
      }
      if (snapshotRequestRef.current === activeRequest) snapshotRequestRef.current = null;
    };
    dispatch(trajectorySnapshotRequested({
      conversationId: targetConversationId,
      runId,
      requestId,
      purpose,
    }));

    void getTrajectorySnapshot(targetConversationId, runId, controller.signal)
      .then(snapshot => {
        releaseRequest();
        dispatch(trajectorySnapshotReceived({
          conversationId: targetConversationId,
          requestId,
          snapshot,
        }));
      })
      .catch(error => {
        releaseRequest();
        if (controller.signal.aborted) {
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
  }, [dispatch]);

  useEffect(() => () => {
    const active = runListRequestRef.current;
    if (!active || active.conversationId !== conversationId) return;
    active.controller.abort();
    if (sharedRunListRequests.get(active.conversationId) === active) {
      sharedRunListRequests.delete(active.conversationId);
    }
    dispatch(trajectoryRunListCancelled({
      conversationId: active.conversationId,
      requestId: active.requestId,
    }));
    runListRequestRef.current = null;
  }, [conversationId, dispatch]);

  useEffect(() => {
    if (!conversationId) return;
    const status = conversation?.runListStatus ?? 'idle';
    if (status !== 'idle' || conversation?.activeRunListRequestId) return;
    requestRunList(conversationId);
  }, [
    conversation?.activeRunListRequestId,
    conversation?.runListStatus,
    conversationId,
    requestRunList,
  ]);

  const selectedRunId = conversation?.selectedRunId ?? null;

  useEffect(() => () => {
    const active = snapshotRequestRef.current;
    if (!active
      || active.conversationId !== conversationId
      || active.runId !== selectedRunId) return;
    active.controller.abort();
    const requestKey = snapshotRequestKey(active.conversationId, active.runId);
    if (sharedSnapshotRequests.get(requestKey) === active) {
      sharedSnapshotRequests.delete(requestKey);
    }
    dispatch(trajectorySnapshotCancelled({
      conversationId: active.conversationId,
      runId: active.runId,
      requestId: active.requestId,
    }));
    snapshotRequestRef.current = null;
  }, [conversationId, dispatch, selectedRunId]);

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
    if (reconciliation?.activeRequestId) return;
    if (reconciliation?.status === 'failed' || reconciliation?.status === 'unavailable') return;
    requestSnapshot(
      conversationId,
      selectedRunId,
      reconciliation?.status === 'reconciling' ? 'reconcile' : 'hydrate',
    );
  }, [
    conversationId,
    dispatch,
    reconciliation?.activeRequestId,
    reconciliation?.status,
    requestSnapshot,
    selectedRunId,
    shouldHydrateSnapshot,
    snapshot,
    snapshotLruTail,
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
