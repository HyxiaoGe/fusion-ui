'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useTrajectoryToolNodeDetail } from '@/hooks/useTrajectoryToolNodeDetail';
import {
  buildTrajectoryNodeDetailModel,
  type TrajectoryNodeDetailModel,
} from '@/lib/trajectory/trajectoryNodeDetailModel';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import type { TrajectoryNodeDetailResponse, TrajectorySpan } from '@/types/trajectory';
import { cn } from '@/lib/utils';

export interface TrajectoryNodeDetailPanelProps {
  conversationId: string | null;
  cell: TrajectoryCell | null;
  span: TrajectorySpan | null;
}

type DetailSection = 'summary' | 'payload' | 'result' | 'timing';

interface PendingWindow {
  deadline: number;
  requestCount: number;
}

const TOOL_SECTIONS: readonly DetailSection[] = ['summary', 'payload', 'result', 'timing'];
const LOCAL_SECTIONS: readonly DetailSection[] = ['summary', 'timing'];
const REMOTE_SECTIONS = new Set<DetailSection>(['payload', 'result']);
const SECTION_LABELS: Record<DetailSection, string> = {
  summary: '摘要',
  payload: '载荷',
  result: '结果',
  timing: '计时',
};
const PENDING_RETRY_INTERVAL_MS = 1_000;
const PENDING_RETRY_DEADLINE_MS = 7_000;
const PENDING_MAX_REQUESTS = 7;

export function TrajectoryNodeDetailPanel({
  conversationId,
  cell,
  span,
}: TrajectoryNodeDetailPanelProps) {
  return (
    <aside
      aria-label="轨迹节点详情"
      className="min-h-48 rounded-lg border border-border/60 bg-background p-4"
    >
      {cell ? (
        <TrajectoryNodeDetailContent
          key={`${conversationId ?? 'no-conversation'}:${cell.key}`}
          conversationId={conversationId}
          cell={cell}
          span={span}
        />
      ) : (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          选择一条记录查看详情
        </div>
      )}
    </aside>
  );
}

function TrajectoryNodeDetailContent({
  conversationId,
  cell,
  span,
}: {
  conversationId: string | null;
  cell: TrajectoryCell;
  span: TrajectorySpan | null;
}) {
  const isTool = cell.type === 'tool';
  const sections = isTool ? TOOL_SECTIONS : LOCAL_SECTIONS;
  const model = useMemo(() => buildTrajectoryNodeDetailModel(cell, span), [cell, span]);
  const tabsId = useId();
  const tabRefs = useRef<Partial<Record<DetailSection, HTMLButtonElement | null>>>({});
  const [activeSection, setActiveSection] = useState<DetailSection>('summary');
  const [detailRequested, setDetailRequested] = useState(false);
  const [pendingWindow, setPendingWindow] = useState<PendingWindow | null>(null);
  const {
    status: requestStatus,
    response,
    error,
    retry,
  } = useTrajectoryToolNodeDetail(
    isTool
      ? {
        conversationId,
        runId: cell.runId,
        nodeType: 'tool',
        toolCallId: cell.toolCallId,
      }
      : null,
    isTool && detailRequested,
  );
  const isRemoteSection = REMOTE_SECTIONS.has(activeSection);
  const pendingStopped = isRemoteSection
    && requestStatus === 'ready'
    && response?.status === 'pending'
    && (
      pendingWindow === null
      || pendingWindow.requestCount >= PENDING_MAX_REQUESTS
    );

  useEffect(() => {
    if (
      !isRemoteSection
      || requestStatus !== 'ready'
      || response?.status !== 'pending'
      || !pendingWindow
      || pendingWindow.requestCount >= PENDING_MAX_REQUESTS
    ) return;

    const remaining = pendingWindow.deadline - performance.now();
    if (remaining <= 0) {
      const expiredTimer = window.setTimeout(() => setPendingWindow(null), 0);
      return () => window.clearTimeout(expiredTimer);
    }
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden' || performance.now() >= pendingWindow.deadline) {
        setPendingWindow(null);
        return;
      }
      setPendingWindow(current => current
        ? { ...current, requestCount: current.requestCount + 1 }
        : null);
      retry();
    }, Math.min(PENDING_RETRY_INTERVAL_MS, remaining));

    return () => window.clearTimeout(timer);
  }, [isRemoteSection, pendingWindow, requestStatus, response?.status, retry]);

  useEffect(() => {
    if (!isRemoteSection || response?.status !== 'pending') return;
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') setPendingWindow(null);
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => document.removeEventListener('visibilitychange', stopWhenHidden);
  }, [isRemoteSection, response?.status]);

  function beginPendingWindow(requestCount: number) {
    setPendingWindow({
      deadline: performance.now() + PENDING_RETRY_DEADLINE_MS,
      requestCount,
    });
  }

  function selectSection(section: DetailSection, moveFocus = false) {
    setActiveSection(section);
    if (REMOTE_SECTIONS.has(section)) {
      if (!detailRequested) {
        beginPendingWindow(1);
        setDetailRequested(true);
      } else if (response?.status === 'pending' && !pendingWindow) {
        beginPendingWindow(0);
      }
    } else {
      setPendingWindow(null);
    }
    if (moveFocus) tabRefs.current[section]?.focus();
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = sections.indexOf(activeSection);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % sections.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + sections.length) % sections.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = sections.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectSection(sections[nextIndex], true);
  }

  function retryDetail() {
    beginPendingWindow(1);
    retry();
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{model.nodeType}</p>
        <h2 className="truncate text-base font-semibold text-foreground">{model.title}</h2>
      </div>

      <div
        role="tablist"
        aria-label="节点详情栏目"
        className="flex gap-1 overflow-x-auto border-b border-border/60"
      >
        {sections.map(section => (
          <button
            key={section}
            ref={node => { tabRefs.current[section] = node; }}
            id={`${tabsId}-${section}-tab`}
            type="button"
            role="tab"
            aria-selected={activeSection === section}
            aria-controls={`${tabsId}-${section}-panel`}
            tabIndex={activeSection === section ? 0 : -1}
            onClick={() => selectSection(section)}
            onKeyDown={handleTabKeyDown}
            className={cn(
              'cursor-pointer border-b-2 px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              activeSection === section
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {SECTION_LABELS[section]}
          </button>
        ))}
      </div>

      <section
        id={`${tabsId}-${activeSection}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${activeSection}-tab`}
        className="min-w-0 pt-4"
      >
        {activeSection === 'summary' && <SummarySection model={model} />}
        {activeSection === 'timing' && <TimingSection model={model} />}
        {isRemoteSection && (
          <RemoteDetailSection
            section={activeSection as 'payload' | 'result'}
            requestStatus={requestStatus}
            response={response}
            error={error}
            pendingStopped={pendingStopped}
            onRetry={retryDetail}
          />
        )}
      </section>

      {model.diagnostics.length > 0 && (
        <details
          role="group"
          aria-label="诊断信息"
          className="mt-4 rounded-md border border-border/50 bg-muted/10 p-3 text-xs"
        >
          <summary className="cursor-pointer font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            诊断信息
          </summary>
          <dl className="mt-3 space-y-2">
            {model.diagnostics.map(item => (
              <div key={`${item.label}:${item.value}`}>
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="break-all font-mono text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

function SummarySection({ model }: { model: TrajectoryNodeDetailModel }) {
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2">
        <DetailField label="状态" value={model.status} />
        <DetailField label="摘要" value={model.summary} />
        {model.attemptCount !== null && (
          <DetailField label="尝试" value={`第 ${model.attemptCount} 次`} />
        )}
      </dl>
      {model.errorSummary && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-foreground">
          <p className="mb-1 text-xs font-medium text-danger">异常摘要</p>
          <p>{model.errorSummary}</p>
        </div>
      )}
    </div>
  );
}

function TimingSection({ model }: { model: TrajectoryNodeDetailModel }) {
  const fields = [
    ['耗时', model.duration],
    ['首次输出', model.ttft],
    ['开始时间', model.startedAt],
    ['结束时间', model.endedAt],
  ].filter((entry): entry is [string, string] => entry[1] !== null);

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无可用时间信息</p>;
  }
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {fields.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}
    </dl>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

function RemoteDetailSection({
  section,
  requestStatus,
  response,
  error,
  pendingStopped,
  onRetry,
}: {
  section: 'payload' | 'result';
  requestStatus: ReturnType<typeof useTrajectoryToolNodeDetail>['status'];
  response: TrajectoryNodeDetailResponse | null;
  error: string | null;
  pendingStopped: boolean;
  onRetry: () => void;
}) {
  if (requestStatus === 'idle' || requestStatus === 'loading') {
    return <p role="status" className="text-sm text-muted-foreground">正在加载详情</p>;
  }
  if (requestStatus === 'failed') {
    return (
      <div className="space-y-3 text-sm text-danger">
        <p role="alert">{error ?? '加载工具详情失败，请稍后重试'}</p>
        <RetryButton label="重试" onClick={onRetry} />
      </div>
    );
  }
  if (!response) return <p role="alert" className="text-sm text-danger">工具详情不可用</p>;

  if (response.status === 'pending') {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <div role="status">
          <p>详情仍在落账</p>
          {pendingStopped && <p>自动检查已停止</p>}
        </div>
        <RetryButton label="重新检查" onClick={onRetry} />
      </div>
    );
  }
  if (response.status === 'not_recorded') {
    return <p className="text-sm text-muted-foreground">该运行生成时尚未记录 Payload/Result</p>;
  }
  if (response.status === 'degraded') {
    return <p className="text-sm text-warn">运行已结束，但工具详情未能精确关联</p>;
  }

  const value = response.available_sections.includes(section)
    ? response.detail?.[section] ?? null
    : null;
  return (
    <div className="space-y-3">
      {value === null ? (
        <p className="text-sm text-muted-foreground">该部分未提供</p>
      ) : (
        <pre className="max-h-96 overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-foreground">
          <code>{JSON.stringify(value, null, 2)}</code>
        </pre>
      )}
      {response.redacted_fields.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm text-foreground">
          <p className="font-medium text-warn">部分字段已脱敏</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {response.redacted_fields.map(field => <li key={field}>{field}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function RetryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}
