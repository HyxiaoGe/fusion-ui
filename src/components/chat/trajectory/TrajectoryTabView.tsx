'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MessageSquareText, RefreshCw } from 'lucide-react';

import { useConversationTrajectory } from '@/hooks/useConversationTrajectory';
import {
  projectTrajectoryCells,
  type TrajectoryCell,
} from '@/lib/trajectory/TrajectoryCellProjection';
import { useAppDispatch } from '@/redux/hooks';
import {
  consumeTrajectoryInspectRequest,
  selectTrajectoryTarget,
  setTrajectoryInspectorOpen,
  setTrajectoryScrollMode,
} from '@/redux/slices/trajectorySlice';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySpan } from '@/types/trajectory';
import { Button } from '@/components/ui/button';
import { TrajectoryIntegrityBanner } from './TrajectoryIntegrityBanner';
import { TrajectoryInspector } from './TrajectoryInspector';
import { TrajectoryLedger, type TrajectoryInspectTarget } from './TrajectoryLedger';
import { TrajectoryTimeline } from './TrajectoryTimeline';

export interface TrajectoryTabViewProps {
  conversationId: string;
  messages: Message[];
  onRevealInChat?: (messageId: string) => void;
}

interface InspectResolution {
  target: TrajectoryInspectTarget;
  fallback: boolean;
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

function cellForSpan(
  cells: readonly TrajectoryCell[],
  span: TrajectorySpan | null,
  runId: string | null,
): TrajectoryCell | null {
  if (!span || !runId) return null;
  const sequences = new Set(span.record_sequences);
  return cells.find(cell => (
    cell.type !== 'run'
    && cell.runId === runId
    && cell.sourceSequences.some(sequence => sequences.has(sequence))
  )) ?? null;
}

function spanForCell(
  cell: TrajectoryCell,
  spans: readonly TrajectorySpan[],
): TrajectorySpan | null {
  if (cell.type === 'run' || cell.runId === null || cell.sourceSequences.length === 0) return null;
  const sequences = new Set(cell.sourceSequences);
  return spans.find(span => span.record_sequences.some(sequence => sequences.has(sequence))) ?? null;
}

function messageCellKey(messageId: string): string[] {
  return [`message:user:${messageId}`, `message:assistant:${messageId}`];
}

function selectedCellFromState(
  cells: readonly TrajectoryCell[],
  selectedMessageId: string | null,
  selectedRunId: string | null,
  selectedSpan: TrajectorySpan | null,
): TrajectoryCell | null {
  const spanCell = cellForSpan(cells, selectedSpan, selectedRunId);
  if (spanCell) return spanCell;
  const selectedRunCell = runCell(cells, selectedRunId);
  if (selectedRunCell) return selectedRunCell;
  if (!selectedMessageId) return null;
  const keys = new Set(messageCellKey(selectedMessageId));
  return cells.find(cell => keys.has(cell.key)) ?? null;
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
  onRevealInChat,
}: TrajectoryTabViewProps) {
  const dispatch = useAppDispatch();
  const trajectory = useConversationTrajectory(conversationId);
  const [inspectNotice, setInspectNotice] = useState<string | null>(null);
  const [resolvedHighlight, setResolvedHighlight] = useState<TrajectoryInspectTarget | null>(null);
  const projection = useMemo(() => projectTrajectoryCells({
    messages,
    runs: trajectory.runs,
    runSummariesById: trajectory.runSummariesById,
    snapshotsByRunId: trajectory.snapshotsByRunId,
    liveEventsByRunId: trajectory.liveEventsByRunId,
    selectedRunId: trajectory.selectedRunId,
    runsTruncated: trajectory.runsTruncated,
  }), [
    messages,
    trajectory.liveEventsByRunId,
    trajectory.runSummariesById,
    trajectory.runs,
    trajectory.runsTruncated,
    trajectory.selectedRunId,
    trajectory.snapshotsByRunId,
  ]);
  const cells = useMemo(
    () => [...projection.cells, ...projection.unassociatedCells],
    [projection.cells, projection.unassociatedCells],
  );
  const selectedSpan = trajectory.snapshot?.spans.find(
    span => span.span_id === trajectory.selectedSpanId,
  ) ?? null;
  const selectedCell = selectedCellFromState(
    cells,
    trajectory.selectedMessageId,
    trajectory.selectedRunId,
    selectedSpan,
  );
  const selectedRunCell = runCell(cells, trajectory.selectedRunId);

  useEffect(() => {
    setInspectNotice(null);
    setResolvedHighlight(null);
  }, [conversationId]);

  const inspectResolution = useMemo<InspectResolution | null>(() => {
    const request = trajectory.inspectRequest;
    if (!request) return null;
    const fallbackRun = runCell(cells, request.runId);
    if (!fallbackRun) return null;

    if (!trajectory.snapshot) {
      const terminalHydrationState = trajectory.reconciliation?.status === 'failed'
        || trajectory.reconciliation?.status === 'unavailable';
      if (!terminalHydrationState) return null;
      return {
        target: { requestId: request.requestId, cellKey: fallbackRun.key },
        fallback: true,
      };
    }

    if (!request.spanId) {
      return {
        target: { requestId: request.requestId, cellKey: fallbackRun.key },
        fallback: false,
      };
    }

    const span = trajectory.snapshot.spans.find(item => item.span_id === request.spanId) ?? null;
    const targetCell = cellForSpan(cells, span, request.runId);
    return {
      target: { requestId: request.requestId, cellKey: targetCell?.key ?? fallbackRun.key },
      fallback: targetCell === null,
    };
  }, [cells, trajectory.inspectRequest, trajectory.reconciliation?.status, trajectory.snapshot]);

  const handleSelectCell = useCallback((cell: TrajectoryCell) => {
    const span = spanForCell(cell, trajectory.snapshot?.spans ?? []);
    setInspectNotice(null);
    setResolvedHighlight(null);
    dispatch(selectTrajectoryTarget({
      conversationId,
      messageId: cell.assistantMessageId ?? cell.userMessageId,
      runId: cell.runId,
      spanId: span?.span_id ?? null,
    }));
    dispatch(setTrajectoryInspectorOpen({ conversationId, isOpen: true }));
  }, [conversationId, dispatch, trajectory.snapshot?.spans]);

  const handleSelectRun = useCallback((run: TrajectoryRunSummary) => {
    setInspectNotice(null);
    setResolvedHighlight(null);
    dispatch(selectTrajectoryTarget({
      conversationId,
      messageId: run.message_id,
      runId: run.run_id,
      spanId: null,
    }));
  }, [conversationId, dispatch]);

  const handleSelectSpan = useCallback((span: TrajectorySpan) => {
    const run = trajectory.selectedRunId
      ? trajectory.runSummariesById[trajectory.selectedRunId]
      : undefined;
    setInspectNotice(null);
    setResolvedHighlight(null);
    dispatch(selectTrajectoryTarget({
      conversationId,
      messageId: run?.message_id ?? trajectory.selectedMessageId,
      runId: trajectory.selectedRunId,
      spanId: span.span_id,
    }));
    dispatch(setTrajectoryInspectorOpen({ conversationId, isOpen: true }));
  }, [
    conversationId,
    dispatch,
    trajectory.runSummariesById,
    trajectory.selectedMessageId,
    trajectory.selectedRunId,
  ]);

  const handleInspectResolved = useCallback(() => {
    const request = trajectory.inspectRequest;
    if (!request || !inspectResolution) return;
    setResolvedHighlight(inspectResolution.target);
    if (inspectResolution.fallback) {
      setInspectNotice('该节点不在当前有界快照中');
      dispatch(selectTrajectoryTarget({
        conversationId,
        messageId: request.messageId,
        runId: request.runId,
        spanId: null,
      }));
    }
    dispatch(consumeTrajectoryInspectRequest({
      conversationId,
      requestId: request.requestId,
    }));
  }, [conversationId, dispatch, inspectResolution, trajectory.inspectRequest]);

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

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TrajectoryIntegrityBanner
          truncated={Boolean(trajectory.snapshot?.truncated || trajectory.reconciliation?.eventsTruncated)}
          runsTruncated={trajectory.runsTruncated}
          trajectoryStatus={trajectoryStatus}
          reconciliationStatus={reconciliationStatus}
          conflictCount={trajectory.reconciliation?.conflicts.length ?? 0}
        />

        {(inspectNotice || snapshotLoading || snapshotFailed || snapshotUnavailable) ? (
          <div role="status" className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
            <span>
              {inspectNotice
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

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-4 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
          <div className="min-h-0">
            <TrajectoryLedger
              cells={cells}
              selectedCellKey={selectedCell?.key ?? null}
              inspectTarget={inspectResolution?.target ?? resolvedHighlight}
              initialScrollTop={0}
              restoreKey={conversationId}
              onSelectCell={handleSelectCell}
              onInspectTargetResolved={handleInspectResolved}
              onScrollTopChange={() => {
                if (trajectory.scrollMode !== 'manual') {
                  dispatch(setTrajectoryScrollMode({ conversationId, mode: 'manual' }));
                }
              }}
              className="h-full"
            />
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <TrajectoryTimeline
              runs={trajectory.runs}
              selectedRunId={trajectory.selectedRunId}
              selectedSpanId={trajectory.selectedSpanId}
              spans={trajectory.snapshot?.spans ?? []}
              onSelectRun={handleSelectRun}
              onSelectSpan={handleSelectSpan}
            />
            {trajectory.isInspectorOpen ? (
              <TrajectoryInspector
                cell={selectedCell}
                span={selectedSpan}
                onClose={() => dispatch(setTrajectoryInspectorOpen({
                  conversationId,
                  isOpen: false,
                }))}
              />
            ) : null}
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
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">会话轨迹（有界）</h1>
          <p className="truncate text-xs text-muted-foreground">最近运行与所选运行的有限事件快照</p>
        </div>
        <div className="flex items-center gap-2">
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
