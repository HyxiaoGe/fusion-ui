'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AdminSafeMarkdown from '@/components/admin/AdminSafeMarkdown';
import { useTrajectoryLlmNodeDetail } from '@/hooks/useTrajectoryLlmNodeDetail';
import { useTrajectorySystemPromptNodeDetail } from '@/hooks/useTrajectorySystemPromptNodeDetail';
import { useTrajectoryToolNodeDetail } from '@/hooks/useTrajectoryToolNodeDetail';
import {
  buildTrajectoryNodeDetailModel,
  type TrajectoryNodeDetailModel,
} from '@/lib/trajectory/trajectoryNodeDetailModel';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import { extractTextFromBlocks, type ContentBlock } from '@/types/conversation';
import type { TrajectoryNodeDetailResponse, TrajectorySpan } from '@/types/trajectory';
import { cn } from '@/lib/utils';

export interface TrajectoryNodeDetailPanelProps {
  conversationId: string | null;
  cell: TrajectoryCell | null;
  span: TrajectorySpan | null;
  relatedCells?: readonly TrajectoryCell[];
}

type DetailSection =
  | 'summary'
  | 'preview'
  | 'raw'
  | 'source'
  | 'payload'
  | 'result'
  | 'prompt'
  | 'timing';
type RemoteDetailSectionName = 'payload' | 'result' | 'preview' | 'raw' | 'prompt';
type DetailRequestStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface PendingWindow {
  deadline: number;
  requestCount: number;
}

const TOOL_SECTIONS: readonly DetailSection[] = ['summary', 'payload', 'result', 'timing'];
const LLM_SECTIONS: readonly DetailSection[] = ['summary', 'preview', 'raw'];
const MESSAGE_SECTIONS: readonly DetailSection[] = ['summary', 'preview', 'raw', 'source'];
const SYSTEM_PROMPT_SECTIONS: readonly DetailSection[] = ['prompt', 'summary', 'timing'];
const LOCAL_SECTIONS: readonly DetailSection[] = ['summary', 'timing'];
const SUMMARY_ONLY_SECTIONS: readonly DetailSection[] = ['summary'];
const SECTION_LABELS: Record<Exclude<DetailSection, 'prompt'>, string> = {
  summary: '摘要',
  preview: '预览',
  raw: '原始',
  source: '来源',
  payload: '载荷',
  result: '结果',
  timing: '计时',
};
const PENDING_RETRY_INTERVAL_MS = 1_000;
const PENDING_RETRY_DEADLINE_MS = 7_000;
const PENDING_MAX_REQUESTS = 7;
const EMPTY_RELATED_CELLS: readonly TrajectoryCell[] = [];

export function TrajectoryNodeDetailPanel({
  conversationId,
  cell,
  span,
  relatedCells = EMPTY_RELATED_CELLS,
}: TrajectoryNodeDetailPanelProps) {
  return (
    <aside
      aria-label="轨迹节点详情"
      className="min-h-full bg-background p-3"
    >
      {cell ? (
        <TrajectoryNodeDetailContent
          key={`${conversationId ?? 'no-conversation'}:${cell.runId ?? 'no-run'}:${cell.key}`}
          conversationId={conversationId}
          cell={cell}
          span={span}
          relatedCells={relatedCells}
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
  relatedCells,
}: {
  conversationId: string | null;
  cell: TrajectoryCell;
  span: TrajectorySpan | null;
  relatedCells: readonly TrajectoryCell[];
}) {
  const { t } = useTranslation();
  const isUser = cell.type === 'user';
  const isMessage = cell.type === 'message';
  const isTool = cell.type === 'tool';
  const isLlm = cell.type === 'assistant_request';
  const isSystemPrompt = cell.type === 'context' && cell.eventType === 'system_prompt_prepared';
  const sections = isSystemPrompt
    ? SYSTEM_PROMPT_SECTIONS
    : isUser || isMessage
      ? MESSAGE_SECTIONS
      : isTool
        ? TOOL_SECTIONS
        : isLlm
          ? (cell.detailAvailable ? LLM_SECTIONS : SUMMARY_ONLY_SECTIONS)
          : LOCAL_SECTIONS;
  const model = useMemo(
    () => buildTrajectoryNodeDetailModel(cell, span, relatedCells, t),
    [cell, relatedCells, span, t],
  );
  const tabsId = useId();
  const tabRefs = useRef<Partial<Record<DetailSection, HTMLButtonElement | null>>>({});
  const [activeSection, setActiveSection] = useState<DetailSection>(isSystemPrompt ? 'prompt' : 'summary');
  const [detailRequested, setDetailRequested] = useState(isSystemPrompt);
  const [pendingWindow, setPendingWindow] = useState<PendingWindow | null>(() => (
    isSystemPrompt
      ? { deadline: performance.now() + PENDING_RETRY_DEADLINE_MS, requestCount: 1 }
      : null
  ));
  const toolDetail = useTrajectoryToolNodeDetail(
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
  const llmDetail = useTrajectoryLlmNodeDetail(
    isLlm
      ? {
        conversationId,
        runId: cell.runId,
        llmRoundId: cell.llmRoundId,
      }
      : null,
    isLlm && cell.detailAvailable && detailRequested,
  );
  const systemPromptDetail = useTrajectorySystemPromptNodeDetail(
    isSystemPrompt ? { conversationId, runId: cell.runId } : null,
    isSystemPrompt && detailRequested,
  );
  const {
    status: requestStatus,
    response,
    error,
    retry,
  } = isSystemPrompt ? systemPromptDetail : isLlm ? llmDetail : toolDetail;
  const isRemoteSection = needsRemoteDetail(cell, activeSection);
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
    if (needsRemoteDetail(cell, section)) {
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
        <h2 className="truncate text-base font-semibold text-foreground">
          {isSystemPrompt ? t('trajectory.systemPrompt.title') : model.title}
        </h2>
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
            {section === 'prompt' ? t('trajectory.systemPrompt.body') : SECTION_LABELS[section]}
          </button>
        ))}
      </div>

      <section
        id={`${tabsId}-${activeSection}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${activeSection}-tab`}
        className="min-w-0 pt-4"
      >
        {activeSection === 'summary' && (
          <SummarySection cell={cell} model={model} onSelectSection={selectSection} />
        )}
        {activeSection === 'preview' && (cell.type === 'user' || cell.type === 'message') && (
          <MessagePreviewSection cell={cell} />
        )}
        {activeSection === 'raw' && (cell.type === 'user' || cell.type === 'message') && (
          <MessageRawSection cell={cell} />
        )}
        {activeSection === 'source' && (cell.type === 'user' || cell.type === 'message') && (
          <MessageSourceSection cell={cell} model={model} />
        )}
        {activeSection === 'timing' && <TimingSection model={model} />}
        {isRemoteSection && (
          <RemoteDetailSection
            section={activeSection as RemoteDetailSectionName}
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

function needsRemoteDetail(cell: TrajectoryCell, section: DetailSection): boolean {
  if (cell.type === 'context' && cell.eventType === 'system_prompt_prepared') return section === 'prompt';
  if (cell.type === 'tool') return section === 'payload' || section === 'result';
  if (cell.type === 'assistant_request') return section === 'preview' || section === 'raw';
  return false;
}

function MessagePreviewSection({
  cell,
}: {
  cell: Extract<TrajectoryCell, { type: 'user' | 'message' }>;
}) {
  const text = extractTextFromBlocks(cell.message.content);
  const files = cell.message.content.filter(
    (block): block is Extract<ContentBlock, { type: 'file' }> => block.type === 'file',
  );

  return (
    <div className="space-y-4">
      {text.trim() ? (
        <AdminSafeMarkdown content={text} className="text-sm" />
      ) : (
        <p className="text-sm text-muted-foreground">无文字内容</p>
      )}
      {files.length > 0 && (
        <div
          className="space-y-2"
          aria-label={cell.type === 'user' ? '用户附件' : '回答附件'}
        >
          {files.map(file => (
            <div
              key={file.id}
              className="rounded-md border border-border/60 bg-muted/15 px-3 py-2"
            >
              <p className="break-words text-sm font-medium text-foreground">{file.filename}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{file.mime_type}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRawSection({
  cell,
}: {
  cell: Extract<TrajectoryCell, { type: 'user' | 'message' }>;
}) {
  const blocks = cell.message.content.filter(block => (
    block.type !== 'thinking'
    && (
      cell.type !== 'message'
      || !FINAL_MESSAGE_EVIDENCE_BLOCK_TYPES.has(block.type)
    )
  ));
  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">没有可展示的原始内容块</p>;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <section key={block.id} className="min-w-0 space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Block #{index + 1} · {block.type}
          </h3>
          <pre className="max-h-96 whitespace-pre-wrap break-words overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-foreground">
            <code>{formatMessageRawBlock(block)}</code>
          </pre>
        </section>
      ))}
    </div>
  );
}

const FINAL_MESSAGE_EVIDENCE_BLOCK_TYPES = new Set<ContentBlock['type']>([
  'search',
  'url_read',
  'knowledge_evidence',
]);

function MessageSourceSection({
  cell,
  model,
}: {
  cell: Extract<TrajectoryCell, { type: 'user' | 'message' }>;
  model: TrajectoryNodeDetailModel;
}) {
  const source = {
    kind: cell.type === 'user' ? 'user' : 'assistant',
    source: 'messages',
    messageId: cell.message.id,
    sequence: cell.message.sequence ?? null,
    timestamp: model.startedAt,
    ...(cell.type === 'message' ? { modelId: cell.message.model_id ?? null } : {}),
  };

  return (
    <pre className="max-h-96 whitespace-pre-wrap break-words overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-foreground">
      <code>{JSON.stringify(source, null, 2)}</code>
    </pre>
  );
}

function formatMessageRawBlock(block: ContentBlock): string {
  if (block.type === 'text') return block.text;
  return JSON.stringify(sanitizeRawValue(block), null, 2);
}

const PRIVATE_RAW_KEYS = new Set(['id', 'file_id', 'thumbnail_url', 'tool_call_log_id']);

function sanitizeRawValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeRawValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_RAW_KEYS.has(key))
      .map(([key, entry]) => [key, sanitizeRawValue(entry)]),
  );
}

function SummarySection({
  cell,
  model,
  onSelectSection,
}: {
  cell: TrajectoryCell;
  model: TrajectoryNodeDetailModel;
  onSelectSection: (section: DetailSection) => void;
}) {
  const sourceFields = model.summaryFields.filter(field => field.label === '来源');
  const otherFields = model.summaryFields.filter(field => field.label !== '来源');
  const fields = [
    ...sourceFields,
    { label: '状态', value: model.status },
    ...otherFields,
    ...(model.attemptCount !== null && model.attemptMode
      ? [{
        label: model.attemptMode === 'count' ? '尝试次数' : '尝试',
        value: model.attemptMode === 'count'
          ? `${model.attemptCount} 次`
          : `第 ${model.attemptCount} 次`,
      }]
      : []),
    ...(!['user', 'message', 'assistant_request', 'tool'].includes(cell.type)
      ? [{ label: '概览', value: model.summary }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <dl className="divide-y divide-border/45 border-y border-border/45">
        {fields.map(field => (
          <SummaryFieldRow key={field.label} label={field.label} value={field.value} />
        ))}
      </dl>
      {model.errorSummary && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-foreground">
          <p className="mb-1 text-xs font-medium text-danger">异常摘要</p>
          <p>{model.errorSummary}</p>
        </div>
      )}
      {cell.type === 'tool' && (
        <ToolSummaryLinks
          onOpenPayload={() => onSelectSection('payload')}
          onOpenResult={() => onSelectSection('result')}
        />
      )}
      {cell.type === 'assistant_request' && <RequestTimingSummary model={model} />}
    </div>
  );
}

function SummaryFieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );
}

function ToolSummaryLinks({
  onOpenPayload,
  onOpenResult,
}: {
  onOpenPayload: () => void;
  onOpenResult: () => void;
}) {
  return (
    <div className="divide-y divide-border/45 border-y border-border/45">
      <SummaryLinkRow
        label="载荷"
        description="按需读取本次工具调用参数"
        actionLabel="查看完整载荷"
        onClick={onOpenPayload}
      />
      <SummaryLinkRow
        label="结果"
        description="按需读取本次工具调用结果"
        actionLabel="查看完整结果"
        onClick={onOpenResult}
      />
    </div>
  );
}

function SummaryLinkRow({
  label,
  description,
  actionLabel,
  onClick,
}: {
  label: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <SummarySectionLink label={actionLabel} onClick={onClick} />
      </div>
    </div>
  );
}

function SummarySectionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

function RequestTimingSummary({ model }: { model: TrajectoryNodeDetailModel }) {
  const fields = [
    ['总耗时', model.duration],
    ['首次输出', model.ttft],
    ['开始时间', model.startedAt],
    ['结束时间', model.endedAt],
  ].filter((entry): entry is [string, string] => entry[1] !== null);

  if (fields.length === 0) return null;
  return (
    <details open className="border-b border-border/45 pb-2">
      <summary className="cursor-pointer py-1 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        请求计时
      </summary>
      <dl className="mt-1 divide-y divide-border/35">
        {fields.map(([label, value]) => (
          <SummaryFieldRow key={label} label={label} value={value} />
        ))}
      </dl>
    </details>
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
  section: RemoteDetailSectionName;
  requestStatus: DetailRequestStatus;
  response: TrajectoryNodeDetailResponse | null;
  error: string | null;
  pendingStopped: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const isSystemPrompt = section === 'prompt';
  if (requestStatus === 'idle' || requestStatus === 'loading') {
    return <p role="status" className="text-sm text-muted-foreground">正在加载详情</p>;
  }
  if (requestStatus === 'failed') {
    return (
      <div className="space-y-3 text-sm text-danger">
        <p role="alert">{error ?? '加载节点详情失败，请稍后重试'}</p>
        <RetryButton label="重试" onClick={onRetry} />
      </div>
    );
  }
  if (!response) return <p role="alert" className="text-sm text-danger">节点详情不可用</p>;

  if (response.status === 'pending') {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <div role="status">
          <p>{isSystemPrompt ? t('trajectory.systemPrompt.pending') : '详情仍在落账'}</p>
          {pendingStopped && <p>自动检查已停止</p>}
        </div>
        <RetryButton label="重新检查" onClick={onRetry} />
      </div>
    );
  }
  if (response.status === 'not_recorded') {
    return (
      <p className="text-sm text-muted-foreground">
        {isSystemPrompt ? t('trajectory.systemPrompt.notRecorded') : '该运行生成时尚未记录 Payload/Result'}
      </p>
    );
  }
  if (response.status === 'degraded') {
    if (isSystemPrompt) {
      const messageKey = response.reason === 'system_prompt_assembly_failed'
        ? 'assemblyFailed'
        : response.reason === 'system_prompt_detail_invalid'
          ? 'bodyInvalid'
          : 'bodyMissing';
      return <p className="text-sm text-warn">{t(`trajectory.systemPrompt.${messageKey}`)}</p>;
    }
    return (
      <p className="text-sm text-warn">
        {response.node_type === 'llm'
          ? '运行已结束，但模型正文未能完成记录'
          : '运行已结束，但工具详情未能精确关联'}
      </p>
    );
  }

  if (isSystemPrompt) return <SystemPromptAvailableDetailSection response={response} />;

  const redactedFields = response.redacted_fields ?? [];
  const truncatedFields = response.truncated_fields ?? [];
  if (response.node_type === 'llm') {
    return (
      <LlmAvailableDetailSection
        section={section}
        response={response}
        redactedFields={redactedFields}
        truncatedFields={truncatedFields}
      />
    );
  }

  const toolSection = section === 'payload' || section === 'result' ? section : null;
  const value = toolSection && response.available_sections.includes(toolSection)
    ? remoteSectionValue(response, toolSection)
    : null;
  return (
    <div className="space-y-3">
      {value === null ? (
        <p className="text-sm text-muted-foreground">该部分未提供</p>
      ) : (
        <pre className="max-h-96 whitespace-pre-wrap overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-foreground">
          <code>{JSON.stringify(value, null, 2)}</code>
        </pre>
      )}
      <DetailWarnings redactedFields={redactedFields} truncatedFields={truncatedFields} />
    </div>
  );
}

function SystemPromptAvailableDetailSection({ response }: { response: TrajectoryNodeDetailResponse }) {
  const { t } = useTranslation();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const detail = response.node_type === 'system_prompt'
    && response.available_sections.includes('prompt')
    && response.detail && 'sections' in response.detail
    ? response.detail
    : null;

  if (
    !detail
    || !Array.isArray(detail.sections)
    || detail.sections.length === 0
    || !detail.sections.every(section => (
      section && typeof section.section_id === 'string' && typeof section.content === 'string'
    ))
  ) {
    return <p className="text-sm text-warn">{t('trajectory.systemPrompt.bodyInvalid')}</p>;
  }

  const fullPrompt = detail.sections.map(section => section.content).join('\n\n');

  async function copyFullPrompt() {
    try {
      await navigator.clipboard.writeText(fullPrompt);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('trajectory.systemPrompt.scopeNote')}
      </p>
      <button
        type="button"
        onClick={copyFullPrompt}
        className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t(`trajectory.systemPrompt.${copyStatus === 'copied' ? 'copiedFull' : 'copyFull'}`)}
      </button>
      {copyStatus === 'failed' && (
        <p role="alert" className="text-sm text-danger">{t('trajectory.systemPrompt.copyFailed')}</p>
      )}
      {detail.sections.map((section, index) => (
        <section key={`${index}:${section.section_id}`} className="min-w-0 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">{section.section_id}</h3>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-foreground">
            {section.content}
          </pre>
        </section>
      ))}
    </div>
  );
}

function LlmAvailableDetailSection({
  section,
  response,
  redactedFields,
  truncatedFields,
}: {
  section: RemoteDetailSectionName;
  response: TrajectoryNodeDetailResponse;
  redactedFields: readonly string[];
  truncatedFields: readonly string[];
}) {
  const detail = response.detail && 'llm_round_id' in response.detail
    ? response.detail
    : null;
  if (!detail || (section !== 'preview' && section !== 'raw')) {
    return <p className="text-sm text-muted-foreground">该部分未提供</p>;
  }

  const hasReasoning = response.available_sections.includes('thinking')
    && Boolean(detail.reasoning_text?.trim());
  const hasOutput = response.available_sections.includes('output')
    && Boolean(detail.output_text?.trim());

  return (
    <div className="space-y-4">
      {section === 'preview' ? (
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">思考过程</h3>
            {hasReasoning ? (
              <AdminSafeMarkdown content={detail.reasoning_text ?? ''} className="text-sm" />
            ) : (
              <p className="text-sm text-muted-foreground">该轮未记录可见思考过程</p>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">模型输出</h3>
            {hasOutput ? (
              <AdminSafeMarkdown content={detail.output_text ?? ''} className="text-sm" />
            ) : (
              <p className="text-sm text-muted-foreground">
                该轮未生成可见正文，可能仅产生了工具调用
              </p>
            )}
          </section>
        </div>
      ) : (
        <pre className="max-h-96 whitespace-pre-wrap break-words overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-foreground">
          <code>{JSON.stringify({
            llm_round_id: detail.llm_round_id,
            reasoning_text: hasReasoning ? detail.reasoning_text : null,
            output_text: hasOutput ? detail.output_text : null,
          }, null, 2)}</code>
        </pre>
      )}
      <DetailWarnings redactedFields={redactedFields} truncatedFields={truncatedFields} />
    </div>
  );
}

function DetailWarnings({
  redactedFields,
  truncatedFields,
}: {
  redactedFields: readonly string[];
  truncatedFields: readonly string[];
}) {
  return (
    <>
      {redactedFields.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm text-foreground">
          <p className="font-medium text-warn">部分字段已脱敏</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {redactedFields.map(field => <li key={field}>{field}</li>)}
          </ul>
        </div>
      )}
      {truncatedFields.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm text-foreground">
          <p className="font-medium text-warn">部分正文已截断</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {truncatedFields.map(field => <li key={field}>{field}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

function remoteSectionValue(
  response: TrajectoryNodeDetailResponse,
  section: RemoteDetailSectionName,
): Record<string, unknown> | null {
  if (!response.detail) return null;
  if (response.node_type === 'tool' && 'tool_call_id' in response.detail) {
    if (section === 'payload') return response.detail.payload;
    if (section === 'result') return response.detail.result;
    return null;
  }
  return null;
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
