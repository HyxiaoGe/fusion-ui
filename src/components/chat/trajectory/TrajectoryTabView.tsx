'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from 'react-redux';
import {
  AlertTriangle,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

import { useConversationTrajectory } from '@/hooks/useConversationTrajectory';
import {
  projectTrajectoryCells,
  type TrajectoryCell,
  type TrajectoryCellProjection,
} from '@/lib/trajectory/TrajectoryCellProjection';
import {
  projectTrajectoryNetworkView,
  resolveTrajectoryCellSpan,
  resolveTrajectoryOverviewSpan,
  resolveTrajectorySelectedCell,
} from '@/lib/trajectory/trajectoryNetworkViewModel';
import {
  projectTrajectoryOverview,
  type OverviewSegment,
  type TrajectoryOverviewMode,
} from '@/lib/trajectory/trajectoryOverviewModel';
import { useAppDispatch } from '@/redux/hooks';
import {
  resolveTrajectoryInspectRequest,
  selectTrajectoryConversation,
  selectTrajectoryRuns,
  selectTrajectoryTarget,
  setTrajectoryScrollMode,
  type TrajectorySnapshotResultIdentity,
} from '@/redux/slices/trajectorySlice';
import type { RootState } from '@/redux/store';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySpan } from '@/types/trajectory';
import type { KnowledgeSelectionStatus } from '@/lib/chat/knowledgeBaseCatalogResource';
import type { TrajectoryRunActionTarget } from '@/lib/trajectory/trajectoryActionPolicy';
import { Button } from '@/components/ui/button';
import { TrajectoryIntegrityBanner } from './TrajectoryIntegrityBanner';
import { TrajectoryNodeDetailPanel } from './TrajectoryNodeDetailPanel';
import {
  TrajectoryOverview,
  type TrajectoryOverviewRange,
} from './TrajectoryOverview';
import {
  TrajectoryRunActions,
  type TrajectoryRunActionLifecycle,
} from './TrajectoryRunActions';
import {
  TrajectoryTable,
  type TrajectoryInspectTarget,
  type TrajectoryViewportState,
} from './TrajectoryTable';

export interface TrajectoryRunActionContext {
  enabled: boolean;
  hasActiveStream: boolean;
  modelAvailable: boolean;
  knowledgeBaseStatus: KnowledgeSelectionStatus;
  knowledgeBaseIds: readonly string[];
  onRetry?: (
    target: TrajectoryRunActionTarget,
    lifecycle: TrajectoryRunActionLifecycle,
  ) => void | Promise<void>;
  onContinue?: (
    target: TrajectoryRunActionTarget,
    lifecycle: TrajectoryRunActionLifecycle,
  ) => void | Promise<void>;
}

export interface TrajectoryTabViewProps {
  conversationId: string;
  messages: Message[];
  visible?: boolean;
  onRevealInChat?: (messageId: string) => void;
  runActions?: TrajectoryRunActionContext;
}

const EMPTY_PROJECTION: TrajectoryCellProjection = {
  cells: [],
  unassociatedCells: [],
  joins: [],
};

interface InspectResolution {
  target: TrajectoryInspectTarget;
  runId: string;
  resultIdentity: TrajectorySnapshotResultIdentity;
  fallback: boolean;
}

interface InspectFeedback {
  requestId: string;
  notice: string | null;
  highlight: TrajectoryInspectTarget;
}

interface CommittedTrajectoryProjection {
  identity: string;
  projection: TrajectoryCellProjection;
}

interface LocalCellSelection {
  cellKey: string;
  domain: string;
}

function runCell(
  cells: readonly TrajectoryCell[],
  runId: string | null,
): Extract<TrajectoryCell, { type: 'run' }> | null {
  if (!runId) return null;
  return cells.find((cell): cell is Extract<TrajectoryCell, { type: 'run' }> => (
    cell.type === 'run' && cell.runId === runId
  )) ?? null;
}

function selectionDomain(
  runId: string | null,
  messageId: string | null,
): string {
  return runId ? `run:${runId}` : `message:${messageId ?? ''}`;
}

function selectionDomainForCell(cell: TrajectoryCell): string {
  return selectionDomain(
    cell.runId,
    cell.assistantMessageId ?? cell.userMessageId,
  );
}

function LoadingState() {
  return (
    <div role="status" className="flex min-h-64 flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-3">
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          正在加载轨迹运行
        </p>
        {[0, 1, 2].map(index => (
          <span
            key={index}
            aria-hidden="true"
            className="block h-14 animate-pulse rounded-lg border border-border/50 bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

export function TrajectoryTabView({
  conversationId,
  messages,
  visible = true,
  onRevealInChat,
  runActions,
}: TrajectoryTabViewProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const trajectory = useConversationTrajectory(conversationId);
  const runActionsRef = useRef(runActions);
  runActionsRef.current = runActions;
  const [inspectFeedback, setInspectFeedback] = useState<InspectFeedback | null>(null);
  const [localSelection, setLocalSelection] = useState<LocalCellSelection | null>(null);
  const [localFocusTarget, setLocalFocusTarget] = useState<TrajectoryInspectTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [overviewMode, setOverviewMode] = useState<TrajectoryOverviewMode>('sequence');
  const [overviewRange, setOverviewRange] = useState<TrajectoryOverviewRange | null>(null);
  const [followTailRequest, setFollowTailRequest] = useState(0);
  const committedProjectionRef = useRef<CommittedTrajectoryProjection | null>(null);
  const localFocusRequestSequenceRef = useRef(0);
  const selectionDomainRef = useRef('');
  const previousVisibleRef = useRef(visible);
  const tableScrollTopRef = useRef(0);
  const liveTailIdentityRef = useRef<{ identity: string; visible: boolean } | null>(null);
  const visibleProjection = useMemo(() => (
    visible
      ? projectTrajectoryCells({
          messages,
          runs: trajectory.runs,
          runSummariesById: trajectory.runSummariesById,
          snapshotsByRunId: trajectory.snapshotsByRunId,
          liveEventsByRunId: trajectory.liveEventsByRunId,
          selectedRunId: trajectory.selectedRunId,
          runsTruncated: trajectory.runsTruncated,
        })
      : null
  ), [
    messages,
    trajectory.liveEventsByRunId,
    trajectory.runSummariesById,
    trajectory.runs,
    trajectory.runsTruncated,
    trajectory.selectedRunId,
    trajectory.snapshotsByRunId,
    visible,
  ]);
  useLayoutEffect(() => {
    if (!visible || !visibleProjection) return;
    committedProjectionRef.current = {
      identity: trajectory.projectionIdentity,
      projection: visibleProjection,
    };
  }, [trajectory.projectionIdentity, visible, visibleProjection]);
  const committedProjection = committedProjectionRef.current;
  const projection = visible
    ? visibleProjection ?? EMPTY_PROJECTION
    : committedProjection && committedProjection.identity === trajectory.projectionIdentity
      ? committedProjection.projection
      : EMPTY_PROJECTION;
  const cells = useMemo(
    () => [...projection.cells, ...projection.unassociatedCells],
    [projection.cells, projection.unassociatedCells],
  );
  const selectedSpan = trajectory.snapshot?.spans.find(
    span => span.span_id === trajectory.selectedSpanId,
  ) ?? null;
  const inspectRequestId = trajectory.inspectRequest?.requestId ?? null;
  const inspectRequestActive = inspectRequestId !== null;
  const currentSelectionDomain = selectionDomain(
    trajectory.selectedRunId,
    trajectory.selectedMessageId,
  );
  if (selectionDomainRef.current === '') selectionDomainRef.current = currentSelectionDomain;
  const selectedCell = resolveTrajectorySelectedCell({
    cells,
    localSelectedCellKey: !inspectRequestActive
      && localSelection?.domain === currentSelectionDomain
      ? localSelection.cellKey
      : null,
    selectedMessageId: trajectory.selectedMessageId,
    selectedRunId: trajectory.selectedRunId,
    selectedSpan,
  });
  const selectedRunCell = runCell(cells, trajectory.selectedRunId);
  const focusedRunEvents = useMemo(() => (
    selectedRunCell
      ? [...selectedRunCell.records, ...selectedRunCell.liveTail]
      : []
  ), [selectedRunCell]);
  const overviewProjection = useMemo(() => projectTrajectoryOverview({
    runs: trajectory.runs,
    focusedRunId: trajectory.selectedRunId,
    focusedRunEvents,
    cells,
    mode: overviewMode,
  }), [cells, focusedRunEvents, overviewMode, trajectory.runs, trajectory.selectedRunId]);
  const inspectOverridesFilters = inspectRequestActive;
  const effectiveSearchQuery = inspectOverridesFilters || searchQuery === ''
    ? ''
    : deferredSearchQuery;
  const effectiveOverviewRange = inspectOverridesFilters ? null : overviewRange;
  const networkView = useMemo(() => projectTrajectoryNetworkView({
    cells,
    overview: overviewProjection,
    searchQuery: effectiveSearchQuery,
    range: effectiveOverviewRange,
  }), [cells, effectiveOverviewRange, effectiveSearchQuery, overviewProjection]);
  const hasActiveFilters = Boolean(searchQuery.trim()) || overviewRange !== null;
  const resumedThisRender = visible && !previousVisibleRef.current;

  useLayoutEffect(() => {
    previousVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (selectionDomainRef.current === currentSelectionDomain) return;
    selectionDomainRef.current = currentSelectionDomain;
    setLocalSelection(null);
    setLocalFocusTarget(null);
  }, [currentSelectionDomain]);

  useLayoutEffect(() => {
    if (!inspectRequestId) return;
    setSearchQuery('');
    setOverviewRange(null);
    setLocalSelection(null);
    setLocalFocusTarget(null);
  }, [inspectRequestId]);

  useEffect(() => {
    if (!hasActiveFilters || trajectory.scrollMode === 'manual') return;
    dispatch(setTrajectoryScrollMode({ conversationId, mode: 'manual' }));
  }, [conversationId, dispatch, hasActiveFilters, trajectory.scrollMode]);

  const liveTailIdentity = useMemo(() => {
    const lastRow = networkView.rows.at(-1);
    const lastEvent = focusedRunEvents.at(-1);
    return [
      trajectory.selectedRunId ?? '',
      networkView.rows.length,
      lastRow?.key ?? '',
      lastEvent?.sequence ?? '',
    ].join(':');
  }, [focusedRunEvents, networkView.rows, trajectory.selectedRunId]);

  useEffect(() => {
    const previous = liveTailIdentityRef.current;
    liveTailIdentityRef.current = { identity: liveTailIdentity, visible };
    if (
      !visible
      || !previous?.visible
      || previous.identity === liveTailIdentity
      || trajectory.scrollMode !== 'follow-live'
      || hasActiveFilters
    ) return;
    setFollowTailRequest(current => current + 1);
  }, [hasActiveFilters, liveTailIdentity, trajectory.scrollMode, visible]);

  const getLatestPolicyInput = useCallback(() => {
    const state = store.getState();
    const current = selectTrajectoryConversation(state, conversationId);
    const selectedRunId = current?.selectedRunId ?? null;
    const selectedSnapshot = selectedRunId
      ? current?.snapshotsByRunId[selectedRunId]
      : undefined;
    const selectedReconciliation = selectedRunId
      ? current?.reconciliationByRunId[selectedRunId]
      : undefined;
    const actionContext = runActionsRef.current;
    return {
      runs: selectTrajectoryRuns(state, conversationId),
      messages: state.conversation.byId[conversationId]?.messages ?? [],
      selectedRunId,
      runListStatus: current?.runListStatus ?? 'idle',
      selectedRunHydrated: selectedSnapshot?.run.run_id === selectedRunId,
      selectedTrajectoryStatus: selectedSnapshot?.completeness.status ?? null,
      selectedRunTruncated: Boolean(
        selectedSnapshot?.truncated || selectedReconciliation?.eventsTruncated
      ),
      reconciliationStatus: selectedReconciliation?.status ?? null,
      hasActiveStream: state.stream.isStreaming,
      modelAvailable: actionContext?.modelAvailable ?? false,
      knowledgeBaseStatus: actionContext?.knowledgeBaseStatus ?? 'unavailable',
      knowledgeBaseIds: actionContext?.knowledgeBaseIds ?? [],
    };
  }, [conversationId, store]);

  useEffect(() => {
    setInspectFeedback(null);
    setLocalSelection(null);
    setLocalFocusTarget(null);
    setSearchQuery('');
    setOverviewMode('sequence');
    setOverviewRange(null);
    tableScrollTopRef.current = 0;
    setFollowTailRequest(current => current + 1);
  }, [conversationId]);

  const visibleInspectFeedback = trajectory.inspectRequest
    && trajectory.inspectRequest.requestId !== inspectFeedback?.requestId
    ? null
    : inspectFeedback;

  const inspectResolution = useMemo<InspectResolution | null>(() => {
    const request = trajectory.inspectRequest;
    if (!request) return null;
    if (
      trajectory.selectionSource !== 'inspect'
      || trajectory.selectedRunId !== request.runId
    ) return null;
    const fallbackRun = runCell(cells, request.runId);
    if (!fallbackRun) return null;

    if (trajectory.snapshot && trajectory.snapshot.run.run_id !== request.runId) return null;

    if (!trajectory.snapshot) {
      const terminalHydrationState = trajectory.reconciliation?.status === 'failed'
        || trajectory.reconciliation?.status === 'unavailable';
      const terminalResultRequestId = trajectory.reconciliation?.terminalResultRequestId;
      if (!terminalHydrationState || !terminalResultRequestId) return null;
      return {
        target: { requestId: request.requestId, cellKey: fallbackRun.key },
        runId: request.runId,
        resultIdentity: { kind: 'terminal', requestId: terminalResultRequestId },
        fallback: true,
      };
    }

    if (!request.spanId) {
      return {
        target: { requestId: request.requestId, cellKey: fallbackRun.key },
        runId: request.runId,
        resultIdentity: {
          kind: 'snapshot',
          requestId: trajectory.snapshot.snapshotRequestId,
        },
        fallback: false,
      };
    }

    const span = trajectory.snapshot.spans.find(item => item.span_id === request.spanId) ?? null;
    const targetCell = span
      ? cells.find(cell => (
        cell.runId === request.runId
        && resolveTrajectoryCellSpan(cell, [span]) === span
      )) ?? null
      : null;
    return {
      target: { requestId: request.requestId, cellKey: targetCell?.key ?? fallbackRun.key },
      runId: request.runId,
      resultIdentity: {
        kind: 'snapshot',
        requestId: trajectory.snapshot.snapshotRequestId,
      },
      fallback: span === null,
    };
  }, [
    cells,
    trajectory.inspectRequest,
    trajectory.reconciliation?.status,
    trajectory.reconciliation?.terminalResultRequestId,
    trajectory.selectedRunId,
    trajectory.selectionSource,
    trajectory.snapshot,
  ]);

  const clearInspectFeedback = useCallback(() => {
    setInspectFeedback(null);
  }, []);

  const commitCellSelection = useCallback((
    cell: TrajectoryCell,
    span: TrajectorySpan | null,
  ) => {
    const domain = selectionDomainForCell(cell);
    selectionDomainRef.current = domain;
    setLocalSelection({ cellKey: cell.key, domain });
    setLocalFocusTarget(null);
    clearInspectFeedback();
    dispatch(selectTrajectoryTarget({
      conversationId,
      messageId: cell.assistantMessageId ?? cell.userMessageId,
      runId: cell.runId,
      spanId: span?.span_id ?? null,
    }));
  }, [clearInspectFeedback, conversationId, dispatch]);

  const handleSelectCell = useCallback((cell: TrajectoryCell) => {
    const span = resolveTrajectoryCellSpan(cell, trajectory.snapshot?.spans ?? []);
    commitCellSelection(cell, span);
  }, [commitCellSelection, trajectory.snapshot?.spans]);

  const handleSelectRun = useCallback((run: TrajectoryRunSummary) => {
    const domain = selectionDomain(run.run_id, run.message_id);
    selectionDomainRef.current = domain;
    setLocalSelection(null);
    setLocalFocusTarget(null);
    clearInspectFeedback();
    dispatch(selectTrajectoryTarget({
      conversationId,
      messageId: run.message_id,
      runId: run.run_id,
      spanId: null,
    }));
  }, [clearInspectFeedback, conversationId, dispatch]);

  const handleSelectRunById = useCallback((runId: string) => {
    const current = selectTrajectoryConversation(store.getState(), conversationId);
    if (current?.selectedRunId === runId && current.selectionSource === 'manual') return;
    const run = trajectory.runSummariesById[runId];
    if (run) handleSelectRun(run);
  }, [
    conversationId,
    handleSelectRun,
    store,
    trajectory.runSummariesById,
  ]);

  const handleSelectOverviewSegment = useCallback((segment: OverviewSegment) => {
    const cell = cells.find(item => item.key === segment.targetCellKey);
    if (!cell) return;
    const span = resolveTrajectoryOverviewSpan(segment, trajectory.snapshot?.spans ?? []);
    commitCellSelection(cell, span);
    localFocusRequestSequenceRef.current += 1;
    setLocalFocusTarget({
      requestId: `overview-${localFocusRequestSequenceRef.current}`,
      cellKey: cell.key,
    });
  }, [cells, commitCellSelection, trajectory.snapshot?.spans]);

  const handleInspectResolved = useCallback((
    target: TrajectoryInspectTarget,
    _visibleIndex: number,
    cell: TrajectoryCell,
  ) => {
    if (
      localFocusTarget
      && target.requestId === localFocusTarget.requestId
      && target.cellKey === localFocusTarget.cellKey
    ) {
      setLocalFocusTarget(null);
      return;
    }
    const resolution = inspectResolution;
    if (!resolution) return;
    if (
      target.requestId !== resolution.target.requestId
      || target.cellKey !== resolution.target.cellKey
    ) return;

    const current = selectTrajectoryConversation(store.getState(), conversationId);
    const request = current?.inspectRequest;
    if (
      request?.requestId !== target.requestId
      || request.runId !== resolution.runId
      || current?.selectionSource !== 'inspect'
      || current.selectedRunId !== resolution.runId
    ) return;
    const currentSnapshot = current.snapshotsByRunId[resolution.runId];
    if (resolution.resultIdentity.kind === 'snapshot') {
      if (currentSnapshot?.snapshotRequestId !== resolution.resultIdentity.requestId) return;
    } else {
      const reconciliation = current.reconciliationByRunId[resolution.runId];
      if (
        currentSnapshot
        || reconciliation?.terminalResultRequestId !== resolution.resultIdentity.requestId
        || (reconciliation?.status !== 'failed' && reconciliation?.status !== 'unavailable')
      ) return;
    }

    dispatch(resolveTrajectoryInspectRequest({
      conversationId,
      requestId: target.requestId,
      runId: resolution.runId,
      resultIdentity: resolution.resultIdentity,
      fallback: resolution.fallback,
    }));
    const resolved = selectTrajectoryConversation(store.getState(), conversationId);
    if (
      resolved?.inspectRequest !== null
      || resolved?.selectedRunId !== resolution.runId
      || resolved.selectionSource !== 'inspect'
    ) return;
    const domain = selectionDomainForCell(cell);
    selectionDomainRef.current = domain;
    setLocalSelection({ cellKey: cell.key, domain });
    setInspectFeedback({
      requestId: target.requestId,
      notice: resolution.fallback ? '该节点不在当前有界快照中' : null,
      highlight: resolution.target,
    });
  }, [
    conversationId,
    dispatch,
    inspectResolution,
    localFocusTarget,
    store,
  ]);

  const handleInspectUnavailable = useCallback((target: TrajectoryInspectTarget) => {
    if (target.requestId === localFocusTarget?.requestId) setLocalFocusTarget(null);
  }, [localFocusTarget?.requestId]);

  const handleViewportStateChange = useCallback((state: TrajectoryViewportState) => {
    tableScrollTopRef.current = state.scrollTop;
    if (!state.userInitiated) return;
    if (state.atTail && !hasActiveFilters) {
      if (trajectory.scrollMode !== 'follow-live') {
        dispatch(setTrajectoryScrollMode({ conversationId, mode: 'follow-live' }));
      }
      return;
    }
    if (!state.atTail && trajectory.scrollMode !== 'manual') {
      dispatch(setTrajectoryScrollMode({ conversationId, mode: 'manual' }));
    }
  }, [conversationId, dispatch, hasActiveFilters, trajectory.scrollMode]);

  const resumeFollowing = useCallback(() => {
    if (hasActiveFilters) return;
    dispatch(setTrajectoryScrollMode({ conversationId, mode: 'follow-live' }));
    setFollowTailRequest(current => current + 1);
  }, [conversationId, dispatch, hasActiveFilters]);

  const revealMessageId = selectedCell?.assistantMessageId
    ?? selectedCell?.userMessageId
    ?? selectedRunCell?.assistantMessageId
    ?? selectedRunCell?.userMessageId
    ?? trajectory.selectedMessageId;

  const trajectoryBody = (() => {
    if ((trajectory.runListStatus === 'idle' || trajectory.runListStatus === 'loading')
      && trajectory.runs.length === 0) {
      return <LoadingState />;
    }
    if (trajectory.runListStatus === 'failed' && trajectory.runs.length === 0) {
      return (
        <div role="alert" className="flex min-h-64 flex-1 items-center justify-center p-8 text-center">
          <div className="space-y-3">
            <AlertTriangle className="mx-auto h-6 w-6 text-danger" aria-hidden="true" />
            <p className="text-sm text-foreground">{trajectory.runListError ?? '轨迹加载失败'}</p>
            <Button type="button" variant="outline" onClick={trajectory.refreshRuns}>
              重试加载轨迹
            </Button>
          </div>
        </div>
      );
    }
    if (trajectory.runListStatus === 'unavailable') {
      return (
        <div className="flex min-h-64 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          当前会话没有可用轨迹
        </div>
      );
    }
    if (trajectory.runListStatus === 'ready' && trajectory.runs.length === 0) {
      return (
        <div className="flex min-h-64 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          当前会话暂无轨迹运行
        </div>
      );
    }

    const reconciliationStatus = trajectory.reconciliation?.status ?? null;
    const snapshotLoading = Boolean(
      trajectory.selectedRunId
      && !trajectory.snapshot
      && (reconciliationStatus === 'loading' || reconciliationStatus === 'reconciling'),
    );
    const snapshotFailed = reconciliationStatus === 'failed';
    const snapshotUnavailable = reconciliationStatus === 'unavailable';
    const trajectoryStatus = trajectory.snapshot?.completeness.status
      ?? selectedRunCell?.trajectoryBadge.status
      ?? null;
    const selectedRun = trajectory.selectedRunId
      ? trajectory.runSummariesById[trajectory.selectedRunId] ?? null
      : null;

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TrajectoryIntegrityBanner
          truncated={Boolean(trajectory.snapshot?.truncated || trajectory.reconciliation?.eventsTruncated)}
          runsTruncated={trajectory.runsTruncated}
          trajectoryStatus={trajectoryStatus}
          reconciliationStatus={reconciliationStatus}
          conflictCount={trajectory.reconciliation?.conflicts.length ?? 0}
        />

        {runActions && selectedRun ? (
          <TrajectoryRunActions
            enabled={runActions.enabled}
            runs={trajectory.runs}
            messages={messages}
            selectedRunId={trajectory.selectedRunId}
            runListStatus={trajectory.runListStatus}
            selectedRunHydrated={trajectory.snapshot?.run.run_id === trajectory.selectedRunId}
            selectedTrajectoryStatus={trajectoryStatus}
            selectedRunTruncated={Boolean(
              trajectory.snapshot?.truncated || trajectory.reconciliation?.eventsTruncated
            )}
            reconciliationStatus={reconciliationStatus}
            hasActiveStream={runActions.hasActiveStream}
            modelAvailable={runActions.modelAvailable}
            knowledgeBaseStatus={runActions.knowledgeBaseStatus}
            knowledgeBaseIds={runActions.knowledgeBaseIds}
            refreshRuns={trajectory.refreshRuns}
            getLatestPolicyInput={getLatestPolicyInput}
            onRetry={runActions.onRetry}
            onContinue={runActions.onContinue}
          />
        ) : null}

        {trajectory.runListStatus === 'failed' && trajectory.runs.length > 0 ? (
          <div
            role="alert"
            className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-danger/25 bg-danger/5 px-4 py-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-medium text-danger">轨迹列表刷新失败</span>
                <span className="ml-1 text-muted-foreground">
                  {trajectory.runListError ?? '暂时无法获取最新轨迹'}；当前数据可能不是最新
                </span>
              </span>
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={trajectory.refreshRuns}>
              重试刷新
            </Button>
          </div>
        ) : null}

        {(visibleInspectFeedback?.notice || snapshotLoading || snapshotFailed || snapshotUnavailable) ? (
          <div role="status" className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
            <span>
              {visibleInspectFeedback?.notice
                ?? (snapshotLoading
                  ? '正在加载所选运行的轨迹详情'
                  : snapshotFailed
                    ? (trajectory.reconciliation?.error ?? '所选运行轨迹加载失败')
                    : '所选运行没有可用轨迹详情')}
            </span>
            {snapshotFailed ? (
              <Button type="button" size="sm" variant="ghost" onClick={trajectory.retrySelectedSnapshot}>
                重试详情
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 xl:overflow-hidden">
          <TrajectoryOverview
            runs={trajectory.runs}
            focusedRunId={trajectory.selectedRunId}
            focusedRunEvents={focusedRunEvents}
            cells={cells}
            selectedCellKey={selectedCell?.key ?? null}
            searchMatchedCellKeys={networkView.searchMatchedCellKeys}
            range={overviewRange}
            mode={overviewMode}
            projection={overviewProjection}
            onModeChange={setOverviewMode}
            onSelectSegment={handleSelectOverviewSegment}
            onSelectRun={handleSelectRunById}
            onRequestRunFocus={handleSelectRunById}
            onRangeChange={setOverviewRange}
            className="w-full shrink-0"
          />

          {networkView.hasPendingRangeMatch ? (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              范围包含待水合运行，正在聚焦后补充匹配记录
            </p>
          ) : null}

          <div className="mt-3 grid min-h-[24rem] flex-1 gap-3 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_clamp(22rem,28vw,28rem)]">
            <div className="min-h-80 xl:min-h-0">
              <TrajectoryTable
                cells={cells}
                selectedCellKey={selectedCell?.key ?? null}
                inspectTarget={visible
                  ? inspectResolution?.target
                    ?? visibleInspectFeedback?.highlight
                    ?? localFocusTarget
                    ?? null
                  : null}
                searchQuery={effectiveSearchQuery}
                focusedCellKeys={networkView.rangeFocusedCellKeys}
                projectedRows={networkView.rows}
                initialScrollTop={tableScrollTopRef.current}
                restoreKey={conversationId}
                followTailRequest={visible
                  && trajectory.scrollMode === 'follow-live'
                  && !hasActiveFilters
                  ? followTailRequest
                  : null}
                revealSelectedCell={!resumedThisRender}
                onSelectCell={handleSelectCell}
                onInspectTargetResolved={handleInspectResolved}
                onInspectTargetUnavailable={handleInspectUnavailable}
                onViewportStateChange={handleViewportStateChange}
                className="h-full"
              />
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              <TrajectoryNodeDetailPanel
                conversationId={conversationId}
                cell={selectedCell}
                span={selectedSpan}
                relatedCells={cells}
              />
            </div>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <section
      aria-label="会话轨迹"
      data-conversation-id={conversationId}
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">会话轨迹（有界）</h1>
          <p className="truncate text-xs text-muted-foreground">最近运行与所选运行的有限事件快照</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <label className="flex min-w-56 max-w-md flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">搜索</span>
            <span className="flex min-w-0 flex-1 items-center rounded-md border border-border/60 bg-background px-2 focus-within:ring-2 focus-within:ring-ring">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                aria-label="搜索轨迹记录"
                placeholder="搜索类型、名称、状态或消息正文"
                value={searchQuery}
                onChange={event => setSearchQuery(event.currentTarget.value)}
                className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="清除搜索"
                  onClick={() => setSearchQuery('')}
                  className="rounded p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </label>
          {trajectory.scrollMode === 'manual' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={hasActiveFilters}
              title={hasActiveFilters ? '清除搜索与范围后可继续跟随' : undefined}
              onClick={resumeFollowing}
            >
              继续跟随
            </Button>
          ) : null}
          {revealMessageId && onRevealInChat ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => onRevealInChat(revealMessageId)}
            >
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              在聊天中查看
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="刷新轨迹运行"
            disabled={trajectory.runListStatus === 'loading'}
            onClick={trajectory.refreshRuns}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>
      {trajectoryBody}
    </section>
  );
}

export default TrajectoryTabView;
