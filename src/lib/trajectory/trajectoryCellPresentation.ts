import i18n from '@/lib/i18n';
import { getToolMeta } from '@/lib/agent/toolRegistry';
import { extractTextFromBlocks } from '@/types/conversation';
import type { TrajectoryCell } from './TrajectoryCellProjection';

export interface TrajectoryCellPresentation {
  kindLabel: string;
  summary: string;
  statusLabel: string | null;
  durationMs: number | null;
  tone: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
  trajectoryStatusLabel?: string | null;
  trajectoryTone?: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
  isSkeleton?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  recording: '记录中',
  completed: '已完成',
  complete: '已完成',
  success: '完成',
  failed: '失败',
  timeout: '超时',
  degraded: '部分可用',
  interrupted: '已中断',
  cancelled: '已取消',
  limit_reached: '已达上限',
  incomplete: '部分完成',
  legacy: '历史未记录',
  unknown: '状态未知',
};

const MAX_CELL_SUMMARY_LENGTH = 160;

export function formatTrajectoryStatus(status: string): string {
  return STATUS_LABELS[status] ?? '状态未知';
}

export function formatTrajectoryDuration(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1000) return `${Math.round(durationMs)} 毫秒`;
  const seconds = (durationMs / 1000).toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
  return `${seconds} 秒`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedSummary(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.length > MAX_CELL_SUMMARY_LENGTH
    ? `${normalized.slice(0, MAX_CELL_SUMMARY_LENGTH - 1)}…`
    : normalized;
}

function latestDuration(cell: Extract<TrajectoryCell, { type: 'tool' | 'subtool' }>): number | null {
  for (let index = cell.events.length - 1; index >= 0; index -= 1) {
    const duration = finiteNumber(cell.events[index].payload.duration_ms);
    if (duration !== null) return duration;
  }
  return null;
}

function runDuration(cell: Extract<TrajectoryCell, { type: 'run' }>): number | null {
  if (!cell.startedAt || !cell.endedAt) return null;
  const duration = Date.parse(cell.endedAt) - Date.parse(cell.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function trajectoryBadgeLabel(
  status: Extract<TrajectoryCell, { type: 'run' }>['trajectoryBadge']['status'],
): string {
  switch (status) {
    case 'recording': return '轨迹记录中';
    case 'complete': return '轨迹完整';
    case 'degraded': return '轨迹降级';
    case 'truncated': return '轨迹已截断';
    case 'legacy': return '历史未记录轨迹';
    case 'summary-only': return '仅运行摘要';
    case 'unknown': return '轨迹状态未知';
  }
}

function trajectoryBadgeTone(
  status: Extract<TrajectoryCell, { type: 'run' }>['trajectoryBadge']['status'],
): TrajectoryCellPresentation['tone'] {
  if (status === 'complete') return 'success';
  if (status === 'recording') return 'info';
  if (status === 'degraded' || status === 'truncated') return 'warn';
  return 'neutral';
}

function contextSummary(cell: Extract<TrajectoryCell, { type: 'context' }>): string {
  if (cell.eventType === 'system_prompt_prepared') {
    return i18n.t(`trajectory.systemPrompt.${cell.payload.status === 'failed' ? 'failed' : 'ready'}`);
  }
  if (cell.eventType === 'skills_resolved') {
    const status = stringValue(cell.payload.status);
    if (status === 'loaded') {
      const count = Array.isArray(cell.payload.skills) ? cell.payload.skills.length : 0;
      return i18n.t('trajectory.skills.loaded', { count });
    }
    if (status === 'load_failed') return i18n.t('trajectory.skills.loadFailedStatus');
    return i18n.t('trajectory.skills.notSelected');
  }
  if (cell.eventType === 'context_required') {
    return boundedSummary(stringValue(cell.payload.purpose) ?? '等待补充信息');
  }
  if (cell.eventType === 'context_result') {
    return formatTrajectoryStatus(stringValue(cell.payload.status) ?? 'complete');
  }
  if (cell.eventType === 'context_status_updated') {
    const status = stringValue(cell.payload.status);
    const statusLabel = contextStatusLabel(status);
    const actualTokens = finiteNumber(cell.payload.actual_prompt_tokens);
    const windowTokens = finiteNumber(cell.payload.window_tokens);
    if (stringValue(cell.payload.phase) === 'final' && actualTokens !== null) {
      const actualLabel = actualTokens.toLocaleString('en-US');
      const windowLabel = windowTokens === null ? null : windowTokens.toLocaleString('en-US');
      return `${statusLabel} · 实际 ${actualLabel}${windowLabel ? ` / ${windowLabel}` : ''} Token`;
    }
    return statusLabel;
  }
  return boundedSummary(stringValue(cell.payload.phase)
    ?? stringValue(cell.payload.status)
    ?? '上下文已更新');
}

function contextStatusLabel(status: string | null): string {
  switch (status) {
    case 'no_op_fast_path':
    case 'no_op':
      return '上下文充足';
    case 'trimmed':
    case 'trimmed_required_above_target':
      return '上下文已压缩';
    case 'required_context_over_budget':
      return '上下文超出预算';
    case 'estimator_unavailable':
      return '上下文用量不可用';
    case 'bypass_unknown_window':
      return '上下文窗口未知';
    default:
      return '上下文已更新';
  }
}

export function getTrajectoryCellPresentation(cell: TrajectoryCell): TrajectoryCellPresentation {
  switch (cell.type) {
    case 'user':
      return {
        kindLabel: '用户提问',
        summary: boundedSummary(extractTextFromBlocks(cell.message.content)) || '无文字内容',
        statusLabel: null,
        durationMs: null,
        tone: 'neutral',
      };
    case 'message':
      return {
        kindLabel: '回答',
        summary: boundedSummary(extractTextFromBlocks(cell.message.content)) || '回答内容待生成',
        statusLabel: cell.message.status === 'failed' ? '失败' : null,
        durationMs: null,
        tone: cell.message.status === 'failed' ? 'danger' : 'neutral',
      };
    case 'assistant_request':
      return {
        kindLabel: cell.requestIndex === null
          ? '模型请求'
          : `Request #${cell.requestIndex}`,
        summary: boundedSummary(
          cell.reasoningPreview
          ?? cell.outputPreview
          ?? [cell.provider, cell.model].filter(Boolean).join(' · '),
        ) || '模型请求正文待生成',
        statusLabel: formatTrajectoryStatus(cell.status),
        durationMs: cell.durationMs,
        tone: statusTone(cell.status),
      };
    case 'run':
      return {
        kindLabel: cell.attemptIndex === null ? '执行' : `第 ${cell.attemptIndex} 次执行`,
        summary: cell.isHydrated
          ? `${cell.totalSteps} 步 · ${cell.totalToolCalls} 次工具`
          : '轨迹详情待加载',
        statusLabel: formatTrajectoryStatus(cell.runStatus),
        durationMs: runDuration(cell),
        tone: statusTone(cell.runStatus),
        trajectoryStatusLabel: trajectoryBadgeLabel(cell.trajectoryBadge.status),
        trajectoryTone: trajectoryBadgeTone(cell.trajectoryBadge.status),
        isSkeleton: !cell.isHydrated,
      };
    case 'plan': {
      const items = Array.isArray(cell.payload.items) ? cell.payload.items.length : 0;
      return {
        kindLabel: '计划',
        summary: items > 0 ? `${items} 个步骤` : '计划已更新',
        statusLabel: cell.revision === null ? null : `第 ${cell.revision} 版`,
        durationMs: null,
        tone: 'info',
      };
    }
    case 'context':
      return {
        kindLabel: cell.eventType === 'skills_resolved' ? 'Skills' : '上下文',
        summary: contextSummary(cell),
        statusLabel: null,
        durationMs: cell.eventType === 'system_prompt_prepared' || cell.eventType === 'skills_resolved'
          ? finiteNumber(cell.payload.duration_ms)
          : null,
        tone: cell.eventType === 'system_prompt_prepared'
          ? (cell.payload.status === 'failed' ? 'danger' : 'success')
          : cell.eventType === 'skills_resolved'
            ? (cell.payload.status === 'load_failed' ? 'danger' : cell.payload.status === 'loaded' ? 'success' : 'neutral')
            : 'info',
      };
    case 'tool': {
      const meta = getToolMeta(cell.toolName ?? '');
      return {
        kindLabel: meta.label,
        summary: '工具调用',
        statusLabel: formatTrajectoryStatus(cell.status),
        durationMs: latestDuration(cell),
        tone: statusTone(cell.status),
      };
    }
    case 'subtool': {
      const meta = getToolMeta(cell.toolName ?? '');
      return {
        kindLabel: '工具尝试',
        summary: `${meta.label}${cell.attemptIndex === null ? '' : ` · 第 ${cell.attemptIndex} 次`}`,
        statusLabel: formatTrajectoryStatus(cell.status),
        durationMs: latestDuration(cell),
        tone: statusTone(cell.status),
      };
    }
    case 'compacted':
      return {
        kindLabel: '上下文压缩',
        summary: `移除 ${cell.removedTurns} 轮 · ${cell.removedMessages} 条消息 · ${cell.removedToolTransactions} 次工具`,
        statusLabel: '已完成',
        durationMs: null,
        tone: 'neutral',
      };
  }
}

function statusTone(status: string): TrajectoryCellPresentation['tone'] {
  if (status === 'failed' || status === 'timeout') return 'danger';
  if (status === 'degraded' || status === 'limit_reached' || status === 'incomplete') return 'warn';
  if (status === 'running' || status === 'recording') return 'info';
  if (status === 'completed' || status === 'complete' || status === 'success') return 'success';
  return 'neutral';
}
