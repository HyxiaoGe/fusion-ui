export type AgentRunStatus =
  | 'running'
  | 'completed'
  | 'limit_reached'
  | 'interrupted'
  | 'failed';

export type AgentStepStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted';

export type ToolCallStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'degraded';

export type LimitReachedReason = 'max_steps' | 'max_tool_calls' | 'timeout';

export interface ToolCallResultSummary {
  kind: string;
  title?: string;
  count?: number;
  favicon?: string;
  truncated: boolean;
}

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  resultSummary?: ToolCallResultSummary;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface AgentStepState {
  stepId: string;
  stepNumber: number;
  status: AgentStepStatus;
  toolCalls: ToolCallState[];
  contentBlockIds: string[];
  startedAt: number;
  completedAt?: number;
}

export interface AgentRunConfig {
  maxSteps: number;
  maxToolCalls: number;
  timeoutS: number;
}

export interface AgentRunState {
  runId: string;
  status: AgentRunStatus;
  config: AgentRunConfig;
  totalSteps: number;
  totalToolCalls: number;
  steps: AgentStepState[];
  limitReachedReason?: LimitReachedReason;
  failure?: { code: string; message: string };
  lastSequence: number;
}

/** SSE 顶层 envelope（与 BE §4.6 一致）. */
export interface SseEnvelope<T = unknown> {
  chunk_type: string;
  data: T;
}

/** agent_event 内层 payload 共享字段. */
export interface AgentEventEnvelope {
  type: string;
  run_id: string;
  parent_run_id: string | null;
  step_id: string | null;
  parent_step_id: string | null;
  tool_call_id: string | null;
  sequence: number;
  trace_id: string;
  ts: number;
}
