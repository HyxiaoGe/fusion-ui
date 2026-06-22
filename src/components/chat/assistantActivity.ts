import type { AgentRunState, ToolCallState } from '@/types/agentRun';
import type { ContentBlock, SearchBlock, UrlBlock } from '@/types/conversation';

export type AssistantActivityKind =
  | 'waiting'
  | 'reasoning'
  | 'tool_running'
  | 'answering'
  | 'completed'
  | 'failed'
  | 'interrupted';

export type AssistantSuggestionState = 'idle' | 'loading' | 'ready';

export type AssistantToolKind = 'web_search' | 'url_read' | 'other';

type TerminalToolStatus = 'success' | 'failed' | 'degraded' | 'interrupted';
type ToolIssueStatus = 'failed' | 'degraded';
type ToolIssueCall = ToolCallState & { status: ToolIssueStatus };

export interface AssistantToolActivity {
  kind: AssistantToolKind;
  toolName: string;
  label: string;
  target: string;
  call: ToolCallState;
}

export interface AssistantToolIssue {
  kind: 'failed' | 'degraded' | 'empty';
  toolKind: AssistantToolKind;
  toolName: string;
  title: string;
  detail: string;
  call: ToolCallState;
}

export interface AssistantActivity {
  kind: AssistantActivityKind;
  tool: AssistantToolActivity | null;
  issue: AssistantToolIssue | null;
  searchBlock: SearchBlock | null;
  urlBlocks: UrlBlock[];
  hasText: boolean;
  hasThinking: boolean;
  shouldSuppressReasoning: boolean;
  shouldShowSources: boolean;
  suggestionState: AssistantSuggestionState;
}

export interface DeriveAssistantActivityInput {
  isStreaming: boolean;
  isCurrentlyStreaming: boolean;
  contentBlocks: ContentBlock[];
  currentRun: AgentRunState | null;
  messageStatus?: 'pending' | 'failed' | null;
  isLoadingSuggestedQuestions: boolean;
  suggestedQuestionsCount: number;
}

export function deriveAssistantActivity(input: DeriveAssistantActivityInput): AssistantActivity {
  const searchBlock = findSearchBlock(input.contentBlocks);
  const urlBlocks = input.contentBlocks.filter((block): block is UrlBlock => block.type === 'url_read');
  const hasText = input.contentBlocks.some(block => block.type === 'text' && block.text.length > 0);
  const hasThinking = input.contentBlocks.some(block => block.type === 'thinking' && block.thinking.length > 0);
  const runningTool = findLatestToolCall(input.currentRun, call => call.status === 'running');
  const runningToolActivity = runningTool ? toToolActivity(runningTool) : null;
  const issue = deriveIssue(input.currentRun, searchBlock);
  const suggestionState = deriveSuggestionState(input);
  const kind = deriveKind(input, { hasText, hasThinking, hasRunningTool: runningToolActivity !== null });
  const tool = kind === 'tool_running' ? runningToolActivity : null;

  return {
    kind,
    tool,
    issue,
    searchBlock,
    urlBlocks,
    hasText,
    hasThinking,
    shouldSuppressReasoning: kind === 'tool_running' || kind === 'answering',
    shouldShowSources: Boolean(searchBlock && searchBlock.sources.length > 0),
    suggestionState,
  };
}

function deriveKind(
  input: DeriveAssistantActivityInput,
  facts: { hasText: boolean; hasThinking: boolean; hasRunningTool: boolean },
): AssistantActivityKind {
  if (input.messageStatus === 'failed' || input.currentRun?.status === 'failed') {
    return 'failed';
  }

  if (input.currentRun?.status === 'interrupted') {
    return 'interrupted';
  }

  if (facts.hasRunningTool) {
    return 'tool_running';
  }

  const isActiveStreaming = input.isStreaming || input.isCurrentlyStreaming;
  if (isActiveStreaming && facts.hasText) {
    return 'answering';
  }

  if (isActiveStreaming && facts.hasThinking) {
    return 'reasoning';
  }

  if (isActiveStreaming || input.messageStatus === 'pending' || input.currentRun?.status === 'running') {
    return 'waiting';
  }

  return 'completed';
}

function deriveSuggestionState(input: DeriveAssistantActivityInput): AssistantSuggestionState {
  if (input.isLoadingSuggestedQuestions) {
    return 'loading';
  }

  return input.suggestedQuestionsCount > 0 ? 'ready' : 'idle';
}

function deriveIssue(currentRun: AgentRunState | null, searchBlock: SearchBlock | null): AssistantToolIssue | null {
  if (searchBlock) {
    const searchIssueCall = findSearchBlockIssueCall(currentRun, searchBlock);

    if (searchIssueCall) {
      return toToolIssue(searchIssueCall.status, searchIssueCall);
    }

    const nonSearchToolIssueCall = findLatestOpenToolIssueCall(
      currentRun,
      call => getToolKind(call.toolName) !== 'web_search',
    );

    if (nonSearchToolIssueCall?.status === 'failed' || nonSearchToolIssueCall?.status === 'degraded') {
      return toToolIssue(nonSearchToolIssueCall.status, nonSearchToolIssueCall);
    }

    if (searchBlock.sources.length === 0) {
      const call = findSearchCall(currentRun, searchBlock) ?? makeEmptySearchCall(searchBlock);

      return {
        kind: 'empty',
        toolKind: 'web_search',
        toolName: 'web_search',
        title: '未找到可用搜索结果',
        detail: '已基于现有信息回答',
        call,
      };
    }

    return null;
  }

  const toolIssueCall = findLatestOpenToolIssueCall(currentRun);

  if (toolIssueCall?.status === 'failed' || toolIssueCall?.status === 'degraded') {
    return toToolIssue(toolIssueCall.status, toolIssueCall);
  }

  return null;
}

function findSearchBlockIssueCall(currentRun: AgentRunState | null, searchBlock: SearchBlock): ToolIssueCall | null {
  const call = searchBlock.tool_call_log_id
    ? findLatestToolCall(currentRun, candidate => candidate.toolCallId === searchBlock.tool_call_log_id)
    : findLatestToolCall(
      currentRun,
      candidate => getToolKind(candidate.toolName) === 'web_search'
        && getToolTarget('web_search', candidate) === searchBlock.query
        && isTerminalToolStatus(candidate.status),
    );

  return isToolIssueCall(call) ? call : null;
}

function findLatestOpenToolIssueCall(
  currentRun: AgentRunState | null,
  shouldInclude: (call: ToolCallState) => boolean = () => true,
): ToolCallState | null {
  const latestTerminalKeys = new Set<string>();

  for (const call of getToolCallsNewestFirst(currentRun)) {
    if (!shouldInclude(call)) {
      continue;
    }

    if (!isTerminalToolStatus(call.status)) {
      continue;
    }

    const key = getToolSignature(call);
    if (latestTerminalKeys.has(key)) {
      continue;
    }

    latestTerminalKeys.add(key);

    if (call.status === 'failed' || call.status === 'degraded') {
      return call;
    }
  }

  return null;
}

function toToolIssue(status: ToolIssueStatus, call: ToolCallState): AssistantToolIssue {
  const toolKind = getToolKind(call.toolName);
  const copy = getIssueCopy(status, toolKind);

  return {
    kind: status,
    toolKind,
    toolName: call.toolName,
    title: copy.title,
    detail: copy.detail,
    call,
  };
}

function getIssueCopy(status: ToolIssueStatus, toolKind: AssistantToolKind): { title: string; detail: string } {
  if (toolKind === 'web_search' && status === 'degraded') {
    return { title: '搜索暂不可用', detail: '已基于现有信息回答' };
  }

  if (toolKind === 'web_search' && status === 'failed') {
    return { title: '搜索失败', detail: '本轮回答未使用搜索结果' };
  }

  if (toolKind === 'url_read' && status === 'degraded') {
    return { title: '网页暂时未返回内容', detail: '已跳过该页面' };
  }

  if (toolKind === 'url_read' && status === 'failed') {
    return { title: '网页读取失败', detail: '未使用该页面内容' };
  }

  if (status === 'degraded') {
    return { title: '工具暂不可用', detail: '已基于现有信息继续回答' };
  }

  return { title: '工具调用失败', detail: '本轮回答未使用该工具结果' };
}

function toToolActivity(call: ToolCallState): AssistantToolActivity {
  const kind = getToolKind(call.toolName);

  return {
    kind,
    toolName: call.toolName,
    label: getToolLabel(kind),
    target: getToolTarget(kind, call),
    call,
  };
}

function getToolKind(toolName: string): AssistantToolKind {
  if (toolName === 'web_search') {
    return 'web_search';
  }

  if (toolName === 'url_read') {
    return 'url_read';
  }

  return 'other';
}

function getToolLabel(kind: AssistantToolKind): string {
  if (kind === 'web_search') {
    return '正在搜索';
  }

  if (kind === 'url_read') {
    return '正在读取网页';
  }

  return '正在调用工具';
}

function getToolTarget(kind: AssistantToolKind, call: ToolCallState): string {
  if (kind === 'web_search') {
    return getStringArgument(call, 'query');
  }

  if (kind === 'url_read') {
    const url = getStringArgument(call, 'url');

    return getHostname(url);
  }

  return '';
}

function getToolSignature(call: ToolCallState): string {
  const kind = getToolKind(call.toolName);

  return `${call.toolName}\u0000${getToolTarget(kind, call)}`;
}

function isTerminalToolStatus(status: ToolCallState['status']): status is TerminalToolStatus {
  return status === 'success'
    || status === 'failed'
    || status === 'degraded'
    || status === 'interrupted';
}

function isToolIssueCall(call: ToolCallState | null): call is ToolIssueCall {
  return call?.status === 'failed' || call?.status === 'degraded';
}

function getStringArgument(call: ToolCallState, key: string): string {
  const value = call.arguments[key];

  return typeof value === 'string' ? value : '';
}

function getHostname(value: string): string {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function findSearchBlock(contentBlocks: ContentBlock[]): SearchBlock | null {
  for (let index = contentBlocks.length - 1; index >= 0; index -= 1) {
    const block = contentBlocks[index];

    if (block.type === 'search') {
      return block;
    }
  }

  return null;
}

function findLatestToolCall(
  currentRun: AgentRunState | null,
  predicate: (call: ToolCallState) => boolean,
): ToolCallState | null {
  if (!currentRun) {
    return null;
  }

  for (let stepIndex = currentRun.steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = currentRun.steps[stepIndex];

    for (let callIndex = step.toolCalls.length - 1; callIndex >= 0; callIndex -= 1) {
      const call = step.toolCalls[callIndex];

      if (predicate(call)) {
        return call;
      }
    }
  }

  return null;
}

function findSearchCall(currentRun: AgentRunState | null, searchBlock: SearchBlock): ToolCallState | null {
  if (searchBlock.tool_call_log_id) {
    return findLatestToolCall(currentRun, call => call.toolCallId === searchBlock.tool_call_log_id);
  }

  return findLatestToolCall(
    currentRun,
    call => getToolKind(call.toolName) === 'web_search' && getToolTarget('web_search', call) === searchBlock.query,
  );
}

function makeEmptySearchCall(searchBlock: SearchBlock): ToolCallState {
  return {
    toolCallId: searchBlock.tool_call_log_id ?? searchBlock.id,
    toolName: 'web_search',
    arguments: { query: searchBlock.query },
    status: 'success',
    startedAt: 0,
    completedAt: 0,
  };
}

function getToolCallsNewestFirst(currentRun: AgentRunState | null): ToolCallState[] {
  if (!currentRun) {
    return [];
  }

  const calls: ToolCallState[] = [];

  for (let stepIndex = currentRun.steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = currentRun.steps[stepIndex];

    for (let callIndex = step.toolCalls.length - 1; callIndex >= 0; callIndex -= 1) {
      calls.push(step.toolCalls[callIndex]);
    }
  }

  return calls;
}
