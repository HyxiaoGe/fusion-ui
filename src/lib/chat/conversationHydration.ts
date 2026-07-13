import type {
  Conversation, Message, ContentBlock,
  TextBlock, ThinkingBlock, FileBlock, NetworkSourceStatus, SearchBlock,
  SearchSourceSummary, SourceReference, UrlBlock,
} from '@/types/conversation';
import type {
  AgentEvidenceItem,
  AgentPlanItem,
  AgentProgressState,
  AgentRunState,
  AgentRunStatus,
  AgentToolDigest,
  LimitReachedReason,
} from '@/types/agentRun';
import { parseTimestamp } from '@/lib/utils/parseTimestamp';
import { normalizeContextUsage } from '@/lib/chat/contextUsage';

// 服务端返回的原始类型（对齐后端 schema）
interface ServerBlock {
  type: 'text' | 'thinking' | 'file' | 'search' | 'url_read';
  id: string;
  text?: string;
  thinking?: string;
  file_id?: string;
  filename?: string;
  mime_type?: string;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  query?: string;
  tool_call_log_id?: string;
  sources?: SearchSourceSummary[];
  status?: NetworkSourceStatus;
  error_message?: string | null;
  source_count?: number;
  source_refs?: SourceReference[];
  requested_provider?: string | null;
  result_provider?: string | null;
  fallback_used?: boolean;
  provider_chain?: string[];
  url?: string;
  title?: string;
  favicon?: string;
}

interface ServerUsage {
  input_tokens: number;
  output_tokens: number;
  context?: unknown;
}

interface ServerAgentRunSummary {
  run_id: string;
  status: AgentRunStatus | 'error';
  config?: {
    max_steps?: number;
    max_tool_calls?: number;
    timeout_s?: number;
  } | null;
  total_steps?: number | null;
  total_tool_calls?: number | null;
  limit_reason?: LimitReachedReason | null;
  progress?: ServerAgentProgressSnapshot | null;
}

interface ServerAgentProgressSnapshot {
  progress?: {
    phase: AgentProgressState['phase'];
    label: string;
    completed_steps?: number | null;
    total_steps?: number | null;
    completed_tool_calls?: number | null;
    max_tool_calls?: number | null;
  } | null;
  plan?: {
    plan_id: string;
    revision: number;
    items: ServerAgentPlanItem[];
  } | null;
  tool_digests?: ServerAgentToolDigest[] | null;
  evidence?: ServerAgentEvidenceItem[] | null;
}

interface ServerAgentPlanItem {
  id: string;
  title: string;
  status: AgentPlanItem['status'];
  kind: AgentPlanItem['kind'];
  summary?: string | null;
  tool_names?: string[] | null;
  evidence_item_ids?: string[] | null;
}

interface ServerAgentToolDigest {
  tool_call_id: string;
  tool_name: string;
  status: AgentToolDigest['status'];
  title: string;
  summary: string;
  key_findings?: string[] | null;
  source_refs?: string[] | null;
  truncated?: boolean | null;
}

interface ServerAgentEvidenceItem {
  id: string;
  kind: AgentEvidenceItem['kind'];
  status: AgentEvidenceItem['status'];
  title: string;
  url?: string | null;
  domain?: string | null;
  claim: string;
  snippet?: string | null;
  used_by_final_answer?: boolean | null;
}

interface ServerMessage {
  id: string;
  role: 'user' | 'assistant';
  content: ServerBlock[];
  model_id?: string | null;
  usage?: ServerUsage | null;
  created_at?: string | number | null;
  suggested_questions?: string[] | null;
  agent_run?: ServerAgentRunSummary | null;
}

interface ServerConversation {
  id: string;
  title: string;
  model_id: string;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  messages: ServerMessage[];
}

export const parseServerTimestamp = parseTimestamp;

function buildContentBlocks(serverBlocks: ServerBlock[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const b of serverBlocks) {
    if (b.type === 'text' && b.text != null) {
      blocks.push({ type: 'text', id: b.id, text: b.text } satisfies TextBlock);
    } else if (b.type === 'thinking' && b.thinking != null) {
      blocks.push({ type: 'thinking', id: b.id, thinking: b.thinking } satisfies ThinkingBlock);
    } else if (b.type === 'file' && b.file_id) {
      blocks.push({
        type: 'file',
        id: b.id,
        file_id: b.file_id,
        filename: b.filename ?? '',
        mime_type: b.mime_type ?? '',
        ...(b.thumbnail_url != null ? { thumbnail_url: b.thumbnail_url } : {}),
        ...(b.width != null ? { width: b.width } : {}),
        ...(b.height != null ? { height: b.height } : {}),
      } satisfies FileBlock);
    } else if (b.type === 'search' && b.query != null) {
      blocks.push({
        type: 'search',
        id: b.id,
        query: b.query,
        tool_call_log_id: b.tool_call_log_id,
        sources: b.sources ?? [],
        status: b.status,
        error_message: b.error_message,
        source_count: b.source_count,
        source_refs: b.source_refs,
        requested_provider: b.requested_provider,
        result_provider: b.result_provider,
        fallback_used: b.fallback_used,
        provider_chain: b.provider_chain,
      } satisfies SearchBlock);
    } else if (b.type === 'url_read' && b.url) {
      blocks.push({
        type: 'url_read',
        id: b.id,
        url: b.url,
        title: b.title,
        favicon: b.favicon,
        tool_call_log_id: b.tool_call_log_id,
        status: b.status,
        error_message: b.error_message,
        source_count: b.source_count,
        source_refs: b.source_refs,
      } satisfies UrlBlock);
    }
  }
  return blocks;
}

function buildMessage(serverMessage: ServerMessage, conversationId: string): Message {
  const hasThinking = serverMessage.content.some(b => b.type === 'thinking');
  const contextUsage = normalizeContextUsage(serverMessage.usage?.context);
  const usage = serverMessage.usage
    ? {
        input_tokens: serverMessage.usage.input_tokens,
        output_tokens: serverMessage.usage.output_tokens,
        ...(contextUsage ? { context: contextUsage } : {}),
      }
    : null;
  return {
    id: serverMessage.id,
    role: serverMessage.role,
    content: buildContentBlocks(serverMessage.content),
    chatId: conversationId,
    model_id: serverMessage.model_id ?? null,
    usage,
    timestamp: parseServerTimestamp(serverMessage.created_at),
    isReasoningVisible: hasThinking ? false : undefined,
    suggestedQuestions: serverMessage.suggested_questions ?? undefined,
    agent_run: buildAgentRunState(serverMessage.agent_run, serverMessage.id),
  };
}

function buildAgentRunState(
  serverRun: ServerAgentRunSummary | null | undefined,
  messageId: string,
): AgentRunState | null {
  if (!serverRun) return null;
  const config = serverRun.config ?? {};
  const progressPatch = buildAgentProgressPatch(serverRun.progress);
  return {
    runId: serverRun.run_id,
    messageId,
    serverMessageId: messageId,
    status: serverRun.status === 'error' ? 'failed' : serverRun.status,
    config: {
      maxSteps: config.max_steps ?? 0,
      maxToolCalls: config.max_tool_calls ?? 0,
      timeoutS: config.timeout_s ?? 0,
    },
    totalSteps: serverRun.total_steps ?? 0,
    totalToolCalls: serverRun.total_tool_calls ?? 0,
    steps: [],
    limitReachedReason: serverRun.limit_reason ?? undefined,
    lastSequence: Number.MAX_SAFE_INTEGER,
    ...progressPatch,
  };
}

function buildAgentProgressPatch(
  snapshot: ServerAgentProgressSnapshot | null | undefined,
): Partial<AgentRunState> {
  if (!snapshot) return {};

  const patch: Partial<AgentRunState> = { protocolVersion: 2 };
  if (snapshot.progress) {
    patch.progress = {
      phase: snapshot.progress.phase,
      label: snapshot.progress.label,
      completedSteps: snapshot.progress.completed_steps ?? undefined,
      totalSteps: snapshot.progress.total_steps ?? undefined,
      completedToolCalls: snapshot.progress.completed_tool_calls ?? undefined,
      maxToolCalls: snapshot.progress.max_tool_calls ?? undefined,
    };
  }
  if (snapshot.plan) {
    patch.plan = {
      planId: snapshot.plan.plan_id,
      revision: snapshot.plan.revision,
      items: snapshot.plan.items.map(mapPlanItem),
    };
  }
  if (snapshot.tool_digests) {
    patch.toolDigests = snapshot.tool_digests.map(mapToolDigest);
  }
  if (snapshot.evidence) {
    patch.evidence = snapshot.evidence.map(mapEvidenceItem);
  }
  return patch;
}

function mapPlanItem(item: ServerAgentPlanItem): AgentPlanItem {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    kind: item.kind,
    summary: item.summary ?? undefined,
    toolNames: item.tool_names ?? [],
    evidenceItemIds: item.evidence_item_ids ?? [],
  };
}

function mapToolDigest(digest: ServerAgentToolDigest): AgentToolDigest {
  return {
    toolCallId: digest.tool_call_id,
    toolName: digest.tool_name,
    status: digest.status,
    title: digest.title,
    summary: digest.summary,
    keyFindings: digest.key_findings ?? [],
    sourceRefs: digest.source_refs ?? [],
    truncated: digest.truncated ?? false,
  };
}

function mapEvidenceItem(item: ServerAgentEvidenceItem): AgentEvidenceItem {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    title: item.title,
    url: item.url ?? undefined,
    domain: item.domain ?? undefined,
    claim: item.claim,
    snippet: item.snippet ?? undefined,
    usedByFinalAnswer: item.used_by_final_answer ?? false,
  };
}

export function buildChatFromServerConversation(
  serverConversation: ServerConversation
): Conversation {
  const messages = serverConversation.messages
    .map(msg => buildMessage(msg, serverConversation.id))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  return {
    id: serverConversation.id,
    title: serverConversation.title,
    model_id: serverConversation.model_id,
    messages,
    createdAt: parseServerTimestamp(serverConversation.created_at),
    updatedAt: parseServerTimestamp(serverConversation.updated_at),
  };
}

export function shouldHydrateConversation(
  chat: Pick<Conversation, 'messages'> | null | undefined
): boolean {
  return !chat || chat.messages.length === 0;
}

export function getConversationHydrationView(options: {
  chatId?: string | null;
  chat: Pick<Conversation, 'messages'> | null | undefined;
  isLoadingServerChat: boolean;
  serverError?: string | null;
}): 'loading' | 'error' | 'ready' {
  const { chatId, chat, isLoadingServerChat, serverError } = options;
  if (!chatId) return 'ready';
  const needsHydration = shouldHydrateConversation(chat);
  if (!needsHydration) return 'ready';
  if (serverError) return 'error';
  if (isLoadingServerChat || needsHydration) return 'loading';
  return 'ready';
}
