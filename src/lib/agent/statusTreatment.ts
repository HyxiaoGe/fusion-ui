/**
 * 三层状态视觉映射（contract §8）。
 *
 * 组件不得硬编码 if (status === 'failed') return 'red'，必须查这张表。
 *
 * icon 用 Lucide component reference（同 toolRegistry）。
 */

import { Loader2, CheckCircle2, AlertTriangle, Square, AlertCircle, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AgentRunStatus, AgentStepStatus } from '@/types/agentRun';
import type { SemanticColor } from './toolRegistry';

export interface StatusTreatment {
  color: SemanticColor;
  icon: LucideIcon;
  label: string;
}

export const RUN_STATUS_TREATMENT: Record<AgentRunStatus, StatusTreatment> = {
  running:       { color: 'info',    icon: Loader2,        label: '运行中' },
  completed:     { color: 'success', icon: CheckCircle2,   label: '已完成' },
  // contract §2：limit_reached 视为 "completed 的特殊子类"——成功基底 + warn 警示
  limit_reached: { color: 'warn',    icon: AlertTriangle,  label: '已达上限' },
  incomplete:    { color: 'warn',    icon: AlertTriangle,  label: '部分完成' },
  interrupted:   { color: 'neutral', icon: Square,         label: '已中断' },
  failed:        { color: 'danger',  icon: AlertCircle,    label: '失败' },
};

export const STEP_STATUS_TREATMENT: Record<AgentStepStatus, StatusTreatment> = {
  running:     { color: 'info',    icon: Loader2,       label: '进行中' },
  completed:   { color: 'success', icon: CheckCircle2,  label: '完成' },
  failed:      { color: 'danger',  icon: XCircle,       label: '失败' },
  interrupted: { color: 'neutral', icon: Square,        label: '中断' },
};
