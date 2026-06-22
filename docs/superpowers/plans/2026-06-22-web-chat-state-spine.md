# Fusion Web 聊天状态主线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Fusion Web 聊天页按一条清晰状态主线展示“AI 正在做什么”：等待响应、思考、真实工具活动、正文输出、完成态和推荐问题。

**Architecture:** 新增一个纯状态推导模块和一个轻量主状态组件，再把 `ChatMessage` 从局部布尔判断迁移到结构化状态主线。保持 SSE、Redux store shape、文件上传、URL read、web search 和发送逻辑不变；推荐问题只作为完成态附属状态收敛文案和 pending 反馈。

**Tech Stack:** Next.js 15, React 19, TypeScript, Redux Toolkit, Vitest, Testing Library, Tailwind CSS, lucide-react

---

## 执行约束

- 不启动本地 Fusion dev server；不要运行 `npm run dev:next`、`npm run dev`、`npm run start`。
- 不改移动端布局，不改 Electron。
- 不改 `fetchWithAuth`、SSE 协议、Redux store shape、Dexie schema。
- 不从 thinking、Markdown 正文或模型自述解析搜索状态。
- 每个任务先写测试，再实现，再跑目标测试，再提交。
- 提交信息使用中文，并包含 `Co-Authored-By: Codex <noreply@anthropic.com>`。
- 当前仓库有旧的未跟踪文档，提交时只 `git add` 本计划指定文件，不能 `git add docs/superpowers` 或 `git add -A`。

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `src/components/chat/assistantActivity.ts` | 从结构化 stream/message/run 数据推导 assistant 主状态 |
| 创建 | `src/components/chat/assistantActivity.test.ts` | 固定状态优先级和“不从 thinking 推断搜索”的规则 |
| 创建 | `src/components/chat/AssistantActivityStatus.tsx` | 渲染等待、工具运行、失败、中断、工具降级/失败提示 |
| 创建 | `src/components/chat/AssistantActivityStatus.test.tsx` | 验证主状态和工具问题提示文案 |
| 修改 | `src/components/chat/ChatMessage.tsx` | 接入状态推导，重排 reasoning/tool/timeline/sources/body/suggestions |
| 修改 | `src/components/chat/ChatMessage.test.tsx` | 增加 thinking-only、真实 search、工具降级的渲染回归 |
| 修改 | `src/components/chat/SuggestedQuestions.tsx` | 推荐问题 loading/pending 文案和视觉反馈收敛到完成态 |
| 修改 | `src/components/chat/SuggestedQuestions.test.tsx` | 增加 loading 文案和 pending 样式/禁用回归 |

---

### Task 1: 新增 assistant 状态推导模块

**Files:**
- Create: `src/components/chat/assistantActivity.ts`
- Create: `src/components/chat/assistantActivity.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/components/chat/assistantActivity.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import type { ContentBlock } from '@/types/conversation';
import { deriveAssistantActivity } from './assistantActivity';

function makeRun(overrides: Partial<AgentRunState>): AgentRunState {
  return {
    runId: 'run-1',
    messageId: 'assistant-1',
    status: 'running',
    config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
    totalSteps: 1,
    totalToolCalls: 0,
    steps: [],
    lastSequence: 1,
    ...overrides,
  };
}

describe('deriveAssistantActivity', () => {
  it('does not infer search from thinking text', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'thinking',
        id: 'think-1',
        thinking: '我应该搜索一下，但这里没有真实 tool_call。',
      },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: blocks,
      currentRun: null,
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('reasoning');
    expect(activity.tool).toBeNull();
    expect(activity.searchBlock).toBeNull();
    expect(activity.shouldShowSources).toBe(false);
  });

  it('prioritizes a running web_search tool over reasoning', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', id: 'think-1', thinking: '正在判断是否需要搜索。' },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: blocks,
      currentRun: makeRun({
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'running',
            startedAt: 1,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: 'AI 异常检测' },
                status: 'running',
                startedAt: 1,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('tool_running');
    expect(activity.tool?.kind).toBe('web_search');
    expect(activity.tool?.target).toBe('AI 异常检测');
    expect(activity.shouldSuppressReasoning).toBe(true);
  });

  it('derives url_read running state with hostname target', () => {
    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: [],
      currentRun: makeRun({
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'running',
            startedAt: 1,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'url_read',
                arguments: { url: 'https://example.com/path?q=1' },
                status: 'running',
                startedAt: 1,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('tool_running');
    expect(activity.tool?.kind).toBe('url_read');
    expect(activity.tool?.target).toBe('example.com');
  });

  it('prioritizes answering over reasoning once text is visible', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', id: 'think-1', thinking: '推理内容' },
      { type: 'text', id: 'text-1', text: '正文已经开始输出' },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: blocks,
      currentRun: null,
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('answering');
    expect(activity.hasText).toBe(true);
    expect(activity.hasThinking).toBe(true);
  });

  it('keeps completed as the primary state while suggestions are loading', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', id: 'text-1', text: '回答完成' },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: blocks,
      currentRun: makeRun({ status: 'completed' }),
      messageStatus: null,
      isLoadingSuggestedQuestions: true,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('completed');
    expect(activity.suggestionState).toBe('loading');
  });

  it('surfaces degraded search as a completed-state issue', () => {
    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [{ type: 'text', id: 'text-1', text: '基于已有信息回答。' }],
      currentRun: makeRun({
        status: 'completed',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'completed',
            startedAt: 1,
            completedAt: 2,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: 'AI 新闻' },
                status: 'degraded',
                error: 'timeout',
                startedAt: 1,
                completedAt: 2,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('completed');
    expect(activity.issue?.kind).toBe('degraded');
    expect(activity.issue?.toolKind).toBe('web_search');
  });

  it('failed and interrupted override tool and text states', () => {
    const failed = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [{ type: 'text', id: 'text-1', text: '部分正文' }],
      currentRun: makeRun({ status: 'failed', failure: { code: 'provider_error', message: 'upstream failed' } }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    const interrupted = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [{ type: 'text', id: 'text-1', text: '部分正文' }],
      currentRun: makeRun({ status: 'interrupted' }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(failed.kind).toBe('failed');
    expect(interrupted.kind).toBe('interrupted');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/assistantActivity.test.ts
```

Expected: FAIL，原因是 `src/components/chat/assistantActivity.ts` 不存在。

- [ ] **Step 3: 实现状态推导模块**

创建 `src/components/chat/assistantActivity.ts`：

```ts
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
  const searchBlock = input.contentBlocks.find((block): block is SearchBlock => block.type === 'search') ?? null;
  const urlBlocks = input.contentBlocks.filter((block): block is UrlBlock => block.type === 'url_read');
  const hasText = input.contentBlocks.some((block) => block.type === 'text' && block.text.trim().length > 0);
  const hasThinking = input.contentBlocks.some(
    (block) => block.type === 'thinking' && block.thinking.trim().length > 0,
  );
  const runningTool = findLatestToolCall(input.currentRun, (call) => call.status === 'running');
  const issue = findLatestToolIssue(input.currentRun, searchBlock);

  const suggestionState: AssistantSuggestionState = input.isLoadingSuggestedQuestions
    ? 'loading'
    : input.suggestedQuestionsCount > 0
      ? 'ready'
      : 'idle';

  let kind: AssistantActivityKind;
  if (input.messageStatus === 'failed' || input.currentRun?.status === 'failed') {
    kind = 'failed';
  } else if (input.currentRun?.status === 'interrupted') {
    kind = 'interrupted';
  } else if (runningTool) {
    kind = 'tool_running';
  } else if (input.isCurrentlyStreaming && hasText) {
    kind = 'answering';
  } else if (input.isCurrentlyStreaming && hasThinking) {
    kind = 'reasoning';
  } else if (input.isStreaming || input.isCurrentlyStreaming || input.messageStatus === 'pending') {
    kind = 'waiting';
  } else {
    kind = 'completed';
  }

  return {
    kind,
    tool: runningTool ? toToolActivity(runningTool) : null,
    issue,
    searchBlock,
    urlBlocks,
    hasText,
    hasThinking,
    shouldSuppressReasoning: kind === 'tool_running' || kind === 'waiting',
    shouldShowSources: Boolean(searchBlock && searchBlock.sources.length > 0),
    suggestionState,
  };
}

function findLatestToolCall(
  run: AgentRunState | null,
  predicate: (call: ToolCallState) => boolean,
): ToolCallState | null {
  if (!run?.steps?.length) return null;

  for (let stepIndex = run.steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = run.steps[stepIndex];
    for (let callIndex = step.toolCalls.length - 1; callIndex >= 0; callIndex -= 1) {
      const call = step.toolCalls[callIndex];
      if (predicate(call)) {
        return call;
      }
    }
  }

  return null;
}

function findLatestToolIssue(run: AgentRunState | null, searchBlock: SearchBlock | null): AssistantToolIssue | null {
  const failedOrDegraded = findLatestToolCall(
    run,
    (call) => call.status === 'failed' || call.status === 'degraded',
  );

  if (failedOrDegraded) {
    return toToolIssue(failedOrDegraded);
  }

  if (searchBlock && searchBlock.sources.length === 0) {
    return {
      kind: 'empty',
      toolKind: 'web_search',
      toolName: 'web_search',
      title: '未找到可用搜索结果',
      detail: '已基于现有信息回答',
      call: {
        toolCallId: searchBlock.tool_call_log_id || searchBlock.id,
        toolName: 'web_search',
        arguments: { query: searchBlock.query },
        status: 'success',
        startedAt: 0,
      },
    };
  }

  return null;
}

function toToolActivity(call: ToolCallState): AssistantToolActivity {
  const kind = getToolKind(call.toolName);
  return {
    kind,
    toolName: call.toolName,
    label: getToolLabel(kind, call.toolName),
    target: getToolTarget(kind, call),
    call,
  };
}

function toToolIssue(call: ToolCallState): AssistantToolIssue {
  const kind = getToolKind(call.toolName);
  const issueKind = call.status === 'degraded' ? 'degraded' : 'failed';

  if (kind === 'web_search') {
    return {
      kind: issueKind,
      toolKind: kind,
      toolName: call.toolName,
      title: issueKind === 'degraded' ? '搜索暂不可用' : '搜索失败',
      detail: issueKind === 'degraded' ? '已基于现有信息回答' : '本轮回答未使用搜索结果',
      call,
    };
  }

  if (kind === 'url_read') {
    return {
      kind: issueKind,
      toolKind: kind,
      toolName: call.toolName,
      title: issueKind === 'degraded' ? '网页暂时未返回内容' : '网页读取失败',
      detail: issueKind === 'degraded' ? '已跳过该页面' : '未使用该页面内容',
      call,
    };
  }

  return {
    kind: issueKind,
    toolKind: kind,
    toolName: call.toolName,
    title: issueKind === 'degraded' ? '工具部分降级' : '工具调用失败',
    detail: call.error || '已用现有信息继续回答',
    call,
  };
}

function getToolKind(toolName: string): AssistantToolKind {
  if (toolName === 'web_search') return 'web_search';
  if (toolName === 'url_read') return 'url_read';
  return 'other';
}

function getToolLabel(kind: AssistantToolKind, toolName: string): string {
  if (kind === 'web_search') return '正在搜索';
  if (kind === 'url_read') return '正在读取网页';
  return `正在调用 ${toolName}`;
}

function getToolTarget(kind: AssistantToolKind, call: ToolCallState): string {
  if (kind === 'web_search') {
    return String(call.arguments.query ?? '').trim();
  }

  if (kind === 'url_read') {
    const rawUrl = String(call.arguments.url ?? '').trim();
    if (!rawUrl) return '';
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return rawUrl;
    }
  }

  return '';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- src/components/chat/assistantActivity.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/assistantActivity.ts src/components/chat/assistantActivity.test.ts
git commit -m "feat: 添加聊天状态主线推导" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 2: 新增 AssistantActivityStatus 主状态组件

**Files:**
- Create: `src/components/chat/AssistantActivityStatus.tsx`
- Create: `src/components/chat/AssistantActivityStatus.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `src/components/chat/AssistantActivityStatus.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AssistantActivity } from './assistantActivity';
import AssistantActivityStatus from './AssistantActivityStatus';

function baseActivity(overrides: Partial<AssistantActivity>): AssistantActivity {
  return {
    kind: 'completed',
    tool: null,
    issue: null,
    searchBlock: null,
    urlBlocks: [],
    hasText: false,
    hasThinking: false,
    shouldSuppressReasoning: false,
    shouldShowSources: false,
    suggestionState: 'idle',
    ...overrides,
  };
}

describe('AssistantActivityStatus', () => {
  it('renders waiting state', () => {
    render(<AssistantActivityStatus activity={baseActivity({ kind: 'waiting' })} />);

    expect(screen.getByText('正在准备回答')).toBeTruthy();
  });

  it('renders running web search with query', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'tool_running',
          tool: {
            kind: 'web_search',
            toolName: 'web_search',
            label: '正在搜索',
            target: 'AI 异常检测',
            call: {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 异常检测' },
              status: 'running',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    expect(screen.getByText('正在搜索：AI 异常检测')).toBeTruthy();
  });

  it('renders running url read with hostname', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'tool_running',
          tool: {
            kind: 'url_read',
            toolName: 'url_read',
            label: '正在读取网页',
            target: 'example.com',
            call: {
              toolCallId: 'tool-1',
              toolName: 'url_read',
              arguments: { url: 'https://example.com/path' },
              status: 'running',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    expect(screen.getByText('正在读取网页：example.com')).toBeTruthy();
  });

  it('renders degraded search issue after completion', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'completed',
          issue: {
            kind: 'degraded',
            toolKind: 'web_search',
            toolName: 'web_search',
            title: '搜索暂不可用',
            detail: '已基于现有信息回答',
            call: {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 新闻' },
              status: 'degraded',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    expect(screen.getByText('搜索暂不可用')).toBeTruthy();
    expect(screen.getByText('已基于现有信息回答')).toBeTruthy();
  });

  it('renders nothing for normal completed state without issue', () => {
    const { container } = render(<AssistantActivityStatus activity={baseActivity({ kind: 'completed' })} />);

    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/AssistantActivityStatus.test.tsx
```

Expected: FAIL，原因是 `AssistantActivityStatus.tsx` 不存在。

- [ ] **Step 3: 实现主状态组件**

创建 `src/components/chat/AssistantActivityStatus.tsx`：

```tsx
'use client';

import { AlertCircle, Globe, Loader2, Search, Square, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { AssistantActivity } from './assistantActivity';

interface AssistantActivityStatusProps {
  activity: AssistantActivity;
  className?: string;
}

export default function AssistantActivityStatus({ activity, className }: AssistantActivityStatusProps) {
  if (activity.kind === 'failed') {
    return (
      <StatusShell tone="danger" className={className}>
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>生成失败，请重试</span>
      </StatusShell>
    );
  }

  if (activity.kind === 'interrupted') {
    return (
      <StatusShell tone="neutral" className={className}>
        <Square className="h-4 w-4 shrink-0" />
        <span>生成已停止</span>
      </StatusShell>
    );
  }

  if (activity.kind === 'tool_running' && activity.tool) {
    const Icon = activity.tool.kind === 'web_search'
      ? Search
      : activity.tool.kind === 'url_read'
        ? Globe
        : Wrench;
    const text = activity.tool.target
      ? `${activity.tool.label}：${activity.tool.target}`
      : activity.tool.label;

    return (
      <StatusShell tone={activity.tool.kind === 'url_read' ? 'teal' : 'info'} className={className}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{text}</span>
        <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
      </StatusShell>
    );
  }

  if (activity.kind === 'waiting') {
    return (
      <StatusShell tone="neutral" className={className}>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span>正在准备回答</span>
      </StatusShell>
    );
  }

  if (activity.issue) {
    return (
      <StatusShell tone={activity.issue.kind === 'failed' ? 'danger' : 'warn'} className={className}>
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">{activity.issue.title}</span>
        <span className="text-muted-foreground">{activity.issue.detail}</span>
      </StatusShell>
    );
  }

  return null;
}

function StatusShell({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone: 'info' | 'teal' | 'warn' | 'danger' | 'neutral';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-3 flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm',
        tone === 'info' && 'border-info-border bg-info-bg text-info',
        tone === 'teal' && 'border-teal/30 bg-teal/10 text-teal',
        tone === 'warn' && 'border-warn-border bg-warn-bg text-warn',
        tone === 'danger' && 'border-danger-border bg-danger-bg text-danger',
        tone === 'neutral' && 'border-border bg-muted/30 text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- src/components/chat/AssistantActivityStatus.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/AssistantActivityStatus.tsx src/components/chat/AssistantActivityStatus.test.tsx
git commit -m "feat: 添加聊天主状态提示组件" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 3: 接入 ChatMessage 状态主线

**Files:**
- Modify: `src/components/chat/ChatMessage.tsx`
- Modify: `src/components/chat/ChatMessage.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/components/chat/ChatMessage.test.tsx` 的 `describe('ChatMessage', () => { ... })` 内追加以下测试。测试要复用文件顶部现有 `selectorState` mock。

先在文件顶部类型 import 区增加：

```tsx
import type { AgentRunState } from '@/types/agentRun';
```

并把 `selectorState.stream.currentRun` 的初始值从：

```tsx
currentRun: null,
```

改成：

```tsx
currentRun: null as AgentRunState | null,
```

```tsx
  it('does not render search UI when thinking only mentions search', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.textBlocks = {};
    selectorState.stream.thinkingBlocks = { 'blk_t1': '让我搜索一下，但没有真实工具调用。' };
    selectorState.stream.blockOrder = ['blk_t1'];
    selectorState.stream.blockTypes = { 'blk_t1': 'thinking' };
    selectorState.stream.currentRun = null;

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [],
          timestamp: 1,
          chatId: 'chat-1',
        }}
        isStreaming
        isLastMessage
      />,
    );

    expect(screen.queryByText(/正在搜索/)).toBeNull();

    selectorState.stream.messageId = null;
    selectorState.stream.thinkingBlocks = {};
    selectorState.stream.blockOrder = [];
    selectorState.stream.blockTypes = {};
  });

  it('renders real running web_search as the main activity', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.textBlocks = {};
    selectorState.stream.thinkingBlocks = { 'blk_t1': '准备调用搜索。' };
    selectorState.stream.blockOrder = ['blk_t1'];
    selectorState.stream.blockTypes = { 'blk_t1': 'thinking' };
    selectorState.stream.currentRun = {
      runId: 'run-1',
      messageId: 'assistant-1',
      status: 'running',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 1,
      lastSequence: 2,
      steps: [
        {
          stepId: 'step-1',
          stepNumber: 1,
          status: 'running',
          startedAt: 1,
          contentBlockIds: [],
          toolCalls: [
            {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 异常检测' },
              status: 'running',
              startedAt: 1,
            },
          ],
        },
      ],
    };

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [],
          timestamp: 1,
          chatId: 'chat-1',
        }}
        isStreaming
        isLastMessage
      />,
    );

    expect(screen.getByText('正在搜索：AI 异常检测')).toBeTruthy();

    selectorState.stream.messageId = null;
    selectorState.stream.thinkingBlocks = {};
    selectorState.stream.blockOrder = [];
    selectorState.stream.blockTypes = {};
    selectorState.stream.currentRun = null;
  });

  it('renders degraded web_search notice without rendering an empty sources panel', () => {
    selectorState.stream.currentRun = {
      runId: 'run-1',
      messageId: 'assistant-1',
      status: 'completed',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 1,
      lastSequence: 3,
      steps: [
        {
          stepId: 'step-1',
          stepNumber: 1,
          status: 'completed',
          startedAt: 1,
          completedAt: 2,
          contentBlockIds: [],
          toolCalls: [
            {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 新闻' },
              status: 'degraded',
              error: 'timeout',
              startedAt: 1,
              completedAt: 2,
            },
          ],
        },
      ],
    };

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'text-1', text: '基于已有信息回答。' }],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    expect(screen.getByText('搜索暂不可用')).toBeTruthy();
    expect(screen.getByText('已基于现有信息回答')).toBeTruthy();
    expect(screen.queryByText(/参考 \d+ 篇资料/)).toBeNull();

    selectorState.stream.currentRun = null;
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/ChatMessage.test.tsx
```

Expected: FAIL，至少真实 `web_search` 主状态和降级提示还不存在。

- [ ] **Step 3: 修改 ChatMessage imports**

在 `src/components/chat/ChatMessage.tsx`：

删除旧状态组件 import：

```tsx
import SearchStatus from './SearchStatus';
import UrlReadStatus from './UrlReadStatus';
```

新增：

```tsx
import AssistantActivityStatus from './AssistantActivityStatus';
import { deriveAssistantActivity } from './assistantActivity';
```

- [ ] **Step 4: 用状态推导替换局部搜索/URL running 判断**

在 `ChatMessage` 中保留现有 `currentRun` 和 `streamSearchSources` selector，然后用下面代码替换从 `lastStep` 到 `hasThinking` 的局部状态推导块。

替换为：

```tsx
  const activity = useMemo(
    () => deriveAssistantActivity({
      isStreaming,
      isCurrentlyStreaming,
      contentBlocks: blocksToRender,
      currentRun,
      messageStatus: message.status ?? null,
      isLoadingSuggestedQuestions: isLoadingQuestions,
      suggestedQuestionsCount: suggestedQuestions.length,
    }),
    [
      isStreaming,
      isCurrentlyStreaming,
      blocksToRender,
      currentRun,
      message.status,
      isLoadingQuestions,
      suggestedQuestions.length,
    ],
  );

  const searchSources: SearchSourceSummary[] = useMemo(() => {
    if (isCurrentlyStreaming) return streamSearchSources;
    return activity.searchBlock?.sources ?? [];
  }, [isCurrentlyStreaming, streamSearchSources, activity.searchBlock]);

  const displayText = useMemo(() => extractTextFromBlocks(blocksToRender), [blocksToRender]);
  const displayThinking = useMemo(() => extractThinkingFromBlocks(blocksToRender), [blocksToRender]);
  const suppressThinking = isCurrentlyStreaming && activity.shouldSuppressReasoning;
  const hasThinking = !suppressThinking && displayThinking.length > 0;
```

删除这些旧变量：

```tsx
  const lastStep = currentRun?.steps[currentRun.steps.length - 1];
  const lastRunningToolCall = lastStep?.toolCalls.find(t => t.status === 'running');
  const streamIsSearching = lastRunningToolCall?.toolName === 'web_search';
  const streamSearchQuery = ...
  const streamIsReadingUrl = ...
  const streamUrlReadUrl = ...
  const showSearching = ...
  const showUrlReading = ...
  const searchQuery = ...
  const isThinkingPending = ...
```

- [ ] **Step 5: 调整渲染顺序**

在 AI 消息渲染分支内，按以下顺序组织：

1. ReasoningContent：只在 `!suppressThinking` 且有 thinking 或正在 reasoning 时渲染。
2. AssistantActivityStatus：渲染 waiting、真实工具运行、失败、中断和工具 issue。
3. AgentRunTimeline。
4. URL 历史卡片。
5. SourcesPanel。
6. Markdown 正文。
7. 流式光标。
8. 引用入口。

把旧的 `ThinkingIndicator`、`SearchStatus`、`UrlReadStatus` 分支替换为：

```tsx
                <AssistantActivityStatus activity={activity} />
```

同时把流式光标条件替换为：

```tsx
                {isStreaming && isLastMessage && activity.kind === 'answering' && (
                  <span className="animate-pulse motion-reduce:animate-none">▌</span>
                )}
```

如果 `ThinkingIndicator` import 变为未使用，删除该 import。保留 `ThinkingIndicator.tsx` 文件本身，不在本任务删除文件。

- [ ] **Step 6: 运行 ChatMessage 测试**

Run:

```bash
npm test -- src/components/chat/ChatMessage.test.tsx
```

Expected: PASS。

- [ ] **Step 7: 运行状态相关目标测试**

Run:

```bash
npm test -- \
  src/components/chat/assistantActivity.test.ts \
  src/components/chat/AssistantActivityStatus.test.tsx \
  src/components/chat/ChatMessage.test.tsx
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add \
  src/components/chat/ChatMessage.tsx \
  src/components/chat/ChatMessage.test.tsx
git commit -m "feat: 接入聊天状态主线渲染" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 4: 收敛推荐问题完成态反馈

**Files:**
- Modify: `src/components/chat/SuggestedQuestions.tsx`
- Modify: `src/components/chat/SuggestedQuestions.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/components/chat/SuggestedQuestions.test.tsx` 的 `describe('SuggestedQuestions', () => { ... })` 内追加：

```tsx
  it('shows completion-state loading copy while generating suggestions', () => {
    render(
      <SuggestedQuestions
        questions={[]}
        isLoading={true}
        onSelectQuestion={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('正在生成可继续追问的问题...')).toBeTruthy();
  });

  it('uses stronger pending affordance after selecting a question', () => {
    const onSelectQuestion = vi.fn();

    render(
      <SuggestedQuestions
        questions={['继续解释搜索结果']}
        isLoading={false}
        onSelectQuestion={onSelectQuestion}
      />,
    );

    const question = screen.getByRole('button', { name: /继续解释搜索结果/ });
    fireEvent.click(question);

    const pending = screen.getByRole('button', { name: /发送中/ });
    expect(pending.className).toContain('border-info-border');
    expect(pending.className).toContain('bg-info-bg');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/SuggestedQuestions.test.tsx
```

Expected: FAIL，loading 文案和 pending class 还没有调整。

- [ ] **Step 3: 修改 loading 文案和 pending 样式**

在 `src/components/chat/SuggestedQuestions.tsx` 中，找到问题按钮 className 的 pending 分支：

```tsx
              pendingQuestion === question && "bg-muted border-border-strong"
```

替换为：

```tsx
              pendingQuestion === question && "border-info-border bg-info-bg text-info"
```

找到 loading 文案：

```tsx
            <span>加载推荐问题中...</span>
```

替换为：

```tsx
            <span>正在生成可继续追问的问题...</span>
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- src/components/chat/SuggestedQuestions.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 运行 ChatMessage + SuggestedQuestions 联合测试**

Run:

```bash
npm test -- \
  src/components/chat/ChatMessage.test.tsx \
  src/components/chat/SuggestedQuestions.test.tsx
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/chat/SuggestedQuestions.tsx src/components/chat/SuggestedQuestions.test.tsx
git commit -m "feat: 强化推荐问题完成态反馈" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 5: 全量验证与收尾

**Files:**
- No source files expected beyond Tasks 1-4.

- [ ] **Step 1: 运行状态主线目标测试**

Run:

```bash
npm test -- \
  src/components/chat/assistantActivity.test.ts \
  src/components/chat/AssistantActivityStatus.test.tsx \
  src/components/chat/ChatMessage.test.tsx \
  src/components/chat/SuggestedQuestions.test.tsx
```

Expected: PASS。

- [ ] **Step 2: 运行相关 agent 工具展示测试**

Run:

```bash
npm test -- \
  src/components/chat/agent/AgentRunTimeline.test.tsx \
  src/components/chat/agent/AgentStepCard.test.tsx \
  src/components/chat/agent/ToolCallSummary.test.tsx \
  src/lib/agent/timelineDerive.test.ts \
  src/lib/agent/toolRegistry.test.ts
```

Expected: PASS。

- [ ] **Step 3: 运行全量测试**

Run:

```bash
npm test
```

Expected:

- 如果全量测试 PASS，记录 PASS。
- 如果出现已知 baseline mock 失败，不要掩盖；记录失败测试名，并确认目标测试仍 PASS。

- [ ] **Step 4: 构建 Web 包**

Run:

```bash
npm run build
```

Expected: PASS。

- [ ] **Step 5: 检查 diff 空白错误和提交历史**

Run:

```bash
git diff --check
git status -sb
git log --oneline -5
```

Expected:

- `git diff --check` 无输出，exit 0。
- 工作区只包含本任务相关变更；旧的未跟踪 docs 不应被暂存。
- 最近提交包含 Tasks 1-4 的中文提交。

- [ ] **Step 6: 最终提交补丁（如 Task 5 有验证修复）**

如果 Task 5 发现并修复了测试或构建问题，提交：

```bash
git add <修复过的文件>
git commit -m "fix: 修复状态主线验证问题" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

如果 Task 5 没有源码变更，不创建空提交。

## 手动验证清单

不启动本地 Fusion 服务。代码 push 并通过 CI/CD 部署后，在 Web 端验证：

- 普通文本问答：等待状态、正文输出、完成态正常。
- thinking 模型问答：thinking 显示为思考，不出现搜索 UI。
- 真实联网搜索问题：running 阶段出现“正在搜索”，完成后出现来源摘要和引用入口。
- 包含 URL 的问题：running 阶段出现“正在读取网页”，完成后出现 URL 卡片。
- 搜索降级或 URL 读取降级：出现轻量降级提示，正文可继续阅读。
- 推荐问题：回答完成后出现；loading 文案为“正在生成可继续追问的问题...”；点击后按钮显示“发送中...”，不能重复点击。

## 回滚策略

- 如果状态推导错误但 UI 未大面积破坏，优先修 `src/components/chat/assistantActivity.ts` 和对应测试。
- 如果 ChatMessage 渲染顺序影响流式阅读或 scroll-stick，回滚 Task 3 提交，保留 Task 1/2 作为未接入的基础能力。
- 如果推荐问题反馈不满意，只回滚 Task 4 提交。
- 不通过修改 SSE、Redux store shape 或后端协议来修前端展示问题。
