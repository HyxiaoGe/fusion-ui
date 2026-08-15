import { getRunStatusFromFinishReason } from '@/lib/agent/finishReason';
import type { StreamCallbacks } from '@/lib/api/chat';
import {
  applyPlanSnapshot,
  discardContentBlock,
  finalizeRun,
  finalizeStep,
  finalizeToolCall,
  initRun,
  markLimitReached,
  mergeToolCallDelta,
  pushStep,
  pushToolCall,
  updatePlanStep,
  updateRunProgress,
  upsertEvidenceItem,
  upsertStaticContentBlock,
  upsertToolDigest,
  updateContextUsage,
  receiveContextRequired,
  receiveContextResult,
} from '@/redux/slices/streamSlice';
import type {
  AgentEvidenceItem,
  FinalizeToolCallStatus,
  LimitReachedReason,
  ToolCallResultSummary,
} from '@/types/agentRun';
import type { ContentBlock, KnowledgeEvidenceBlock } from '@/types/conversation';
import { normalizeContentBlock } from '@/lib/chat/contentBlockRegistry';
import { isStructuredToolResultBlock } from '@/lib/chat/structuredToolResults';
import {
  mapWireAgentPlan,
  mapWireAgentPlanItem,
  normalizeAgentPlanMetadata,
} from '@/lib/agent/planState';
import { normalizeAgentRunConfig } from '@/lib/agent/runConfig';

type DispatchLike = (action: unknown) => unknown;
type RunStartedEvent = Parameters<NonNullable<StreamCallbacks['onRunStarted']>>[0];

interface AgentStreamEventHandlerOptions {
  dispatch: DispatchLike;
  isActive: () => boolean;
  resolveMessageId: (ev: RunStartedEvent) => string;
  setServerMessageId?: (messageId: string) => void;
  resolveConversationId: () => string | null;
}

export function createAgentStreamEventHandlers({
  dispatch,
  isActive,
  resolveMessageId,
  setServerMessageId,
  resolveConversationId,
}: AgentStreamEventHandlerOptions): Partial<StreamCallbacks> {
  return {
    onRunStarted: ev => {
      if (!isActive()) return;
      setServerMessageId?.(ev.message_id);
      dispatch(initRun({
        runId: ev.run_id,
        messageId: resolveMessageId(ev),
        serverMessageId: ev.message_id,
        config: normalizeAgentRunConfig(ev.config),
        sequence: ev.sequence,
      }));
    },
    onStepStarted: ev => {
      if (!isActive() || !ev.step_id) return;
      dispatch(pushStep({
        runId: ev.run_id,
        stepId: ev.step_id,
        stepNumber: ev.step_number,
        sequence: ev.sequence,
      }));
    },
    onToolCallStarted: ev => {
      if (!isActive() || !ev.step_id || !ev.tool_call_id) return;
      dispatch(pushToolCall({
        runId: ev.run_id,
        stepId: ev.step_id,
        toolCallId: ev.tool_call_id,
        planItemId: ev.plan_item_id ?? undefined,
        toolName: ev.tool_name,
        arguments: ev.arguments,
        sequence: ev.sequence,
      }));
    },
    onToolCallDelta: ev => {
      if (!isActive() || !ev.tool_call_id) return;
      dispatch(mergeToolCallDelta({
        runId: ev.run_id,
        toolCallId: ev.tool_call_id,
        delta: ev.delta,
        sequence: ev.sequence,
      }));
    },
    onToolCallCompleted: ev => {
      if (!isActive() || !ev.tool_call_id) return;
      dispatch(finalizeToolCall({
        runId: ev.run_id,
        toolCallId: ev.tool_call_id,
        planItemId: ev.plan_item_id ?? undefined,
        status: ev.status as FinalizeToolCallStatus,
        durationMs: ev.duration_ms,
        resultSummary: ev.result_summary as unknown as ToolCallResultSummary | undefined,
        error: ev.error ?? null,
        sequence: ev.sequence,
      }));
    },
    onStepCompleted: ev => {
      if (!isActive() || !ev.step_id) return;
      dispatch(finalizeStep({
        runId: ev.run_id,
        stepId: ev.step_id,
        toolCallCount: ev.tool_call_count,
        sequence: ev.sequence,
      }));
    },
    onRunLimitReached: ev => {
      if (!isActive()) return;
      dispatch(markLimitReached({
        runId: ev.run_id,
        reason: ev.reason as LimitReachedReason,
        sequence: ev.sequence,
      }));
    },
    onRunInterrupted: ev => {
      if (!isActive()) return;
      dispatch(finalizeRun({
        runId: ev.run_id,
        status: 'interrupted',
        reason: ev.reason,
        sequence: ev.sequence,
      }));
    },
    onRunFailed: ev => {
      if (!isActive()) return;
      dispatch(finalizeRun({
        runId: ev.run_id,
        status: 'failed',
        failure: { code: ev.error_code, message: ev.message },
        sequence: ev.sequence,
      }));
    },
    onRunCompleted: ev => {
      if (!isActive()) return;
      dispatch(finalizeRun({
        runId: ev.run_id,
        status: getRunStatusFromFinishReason(ev.finish_reason),
        sequence: ev.sequence,
      }));
    },
    onRunProgressUpdated: ev => {
      if (!isActive()) return;
      dispatch(updateRunProgress({
        runId: ev.run_id,
        sequence: ev.sequence,
        progress: {
          phase: ev.phase,
          label: ev.label,
          completedSteps: ev.completed_steps,
          totalSteps: ev.total_steps,
          completedToolCalls: ev.completed_tool_calls,
          maxToolCalls: ev.max_tool_calls,
        },
      }));
    },
    onPlanSnapshot: ev => {
      if (!isActive()) return;
      dispatch(applyPlanSnapshot({
        runId: ev.run_id,
        sequence: ev.sequence,
        plan: mapWireAgentPlan(ev),
      }));
    },
    onPlanStepUpdated: ev => {
      if (!isActive()) return;
      dispatch(updatePlanStep({
        runId: ev.run_id,
        sequence: ev.sequence,
        planId: ev.plan_id,
        revision: ev.revision,
        ...normalizeAgentPlanMetadata(ev),
        item: mapWireAgentPlanItem(ev.item),
      }));
    },
    onToolResultDigest: ev => {
      if (!isActive() || !ev.tool_call_id) return;
      dispatch(upsertToolDigest({
        runId: ev.run_id,
        sequence: ev.sequence,
        digest: {
          toolCallId: ev.tool_call_id,
          planItemId: ev.plan_item_id ?? undefined,
          toolName: ev.tool_name,
          status: ev.status,
          title: ev.title,
          summary: ev.summary,
          keyFindings: ev.key_findings ?? [],
          sourceRefs: ev.source_refs ?? [],
          truncated: ev.truncated,
          repairState: ev.repair_state,
          repairId: ev.repair_id,
        },
      }));
    },
    onEvidenceItemUpserted: ev => {
      if (!isActive()) return;
      dispatch(upsertEvidenceItem({
        runId: ev.run_id,
        sequence: ev.sequence,
        evidence: mapEvidenceItem(ev.evidence),
      }));
    },
    onContentBlockUpserted: ev => {
      if (!isActive()) return;
      const block = normalizeContentBlock(ev.content_block ?? ev.block);
      if (!block) return;
      if (!isStructuredToolResultBlock(block) && !isKnowledgeEvidenceBlock(block)) return;
      dispatch(upsertStaticContentBlock({
        runId: ev.run_id,
        sequence: ev.sequence,
        block,
      }));
    },
    onContentBlockDiscarded: ev => {
      if (!isActive() || !ev.block_id) return;
      dispatch(discardContentBlock({
        runId: ev.run_id,
        sequence: ev.sequence,
        blockId: ev.block_id,
      }));
    },
    onContextRequired: ev => {
      if (!isActive()) return;
      const conversationId = resolveConversationId();
      if (!conversationId) return;
      dispatch(receiveContextRequired({
        conversationId,
        runId: ev.run_id,
        requestId: ev.request_id,
        contextType: ev.context_type,
        purpose: ev.purpose,
        reason: ev.reason,
        expiresAt: ev.expires_at,
        sequence: ev.sequence,
      }));
    },
    onContextResult: ev => {
      if (!isActive()) return;
      dispatch(receiveContextResult({
        runId: ev.run_id,
        requestId: ev.request_id,
        contextType: ev.context_type,
        status: ev.status,
        sequence: ev.sequence,
      }));
    },
    onContextStatusUpdated: ev => {
      if (!isActive()) return;
      const conversationId = resolveConversationId();
      if (!conversationId) return;
      dispatch(updateContextUsage({
        conversationId,
        usage: {
          status: ev.status,
          window_tokens: ev.window_tokens,
          estimated_tokens_before: ev.estimated_tokens_before,
          estimated_tokens_after: ev.estimated_tokens_after,
          actual_prompt_tokens: ev.actual_prompt_tokens,
          removed_turns: ev.removed_turns,
          removed_messages: ev.removed_messages,
          removed_tool_transactions: ev.removed_tool_transactions,
          round_index: ev.round_index,
        },
        runId: ev.run_id,
        messageId: ev.message_id,
        sequence: ev.sequence,
        phase: ev.phase,
      }));
    },
  };
}

function isKnowledgeEvidenceBlock(block: ContentBlock): block is KnowledgeEvidenceBlock {
  return block.type === 'knowledge_evidence';
}

function mapEvidenceItem(item: {
  id: string;
  kind: AgentEvidenceItem['kind'];
  status: AgentEvidenceItem['status'];
  title: string;
  url?: string;
  domain?: string;
  citation_index?: number;
  claim: string;
  snippet?: string;
  used_by_final_answer?: boolean;
}): AgentEvidenceItem {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    title: item.title,
    url: item.url,
    domain: item.domain,
    citationIndex: normalizeCitationIndex(item.citation_index),
    claim: item.claim,
    snippet: item.snippet,
    usedByFinalAnswer: item.used_by_final_answer ?? false,
  };
}

function normalizeCitationIndex(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}
