# Assistant 回复视觉层级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先完成 B 阶段：收敛 assistant 回复视觉层级，并抽出 `AssistantResponseStack` 作为后续 C 阶段结构化重构的稳定边界。

**Architecture:** B 阶段新增一个无 Redux 副作用的 `AssistantResponseStack` 组件承接 assistant 内容栈顺序；再对 reasoning、activity、answer evidence、agent step、suggested questions 做低风险视觉降噪。C 阶段不在本计划实施，只作为后续单独重构方向记录。

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, React Testing Library, Tailwind CSS, lucide-react。

---

## 执行约束

- [ ] 不启动本地 Fusion dev server，不运行 `npm run dev`、`npm run dev:next`、`next dev`、`next start`。
- [ ] 不改后端、SSE、Redux store shape、Dexie、发送/停止/重连逻辑。
- [ ] 不改 Markdown citation 解析和 `SourcesSidebar` 数据结构。
- [ ] 先写失败测试，再写实现。
- [ ] 每个任务完成后跑任务内列出的测试。
- [ ] 提交信息使用中文，并包含 `Co-Authored-By: Codex <noreply@anthropic.com>`。

## 文件结构

| 类型 | 文件 | 职责 |
|------|------|------|
| 新增 | `src/components/chat/AssistantResponseStack.tsx` | 组合 assistant 内容栈，管理 reasoning/status/timeline/evidence/markdown/cursor 顺序 |
| 新增 | `src/components/chat/AssistantResponseStack.test.tsx` | 验证内容栈顺序、handler 透传、流式光标 |
| 修改 | `src/components/chat/ChatMessage.tsx` | 保留数据派生，把 assistant 内容渲染委托给 `AssistantResponseStack` |
| 修改 | `src/components/chat/ChatMessage.test.tsx` | 回归接入后搜索、URL、引用、reasoning、正文行为 |
| 修改 | `src/components/chat/ReasoningContent.tsx` | 完成态降权，保留 streaming 态可见性 |
| 修改 | `src/components/chat/ReasoningContent.test.tsx` | 如现有测试不足，补完成态/streaming 态样式语义 |
| 修改 | `src/components/chat/AssistantActivityStatus.tsx` | 正常 running 状态更紧凑，异常态仍明显 |
| 修改 | `src/components/chat/AssistantActivityStatus.test.tsx` | 保留 aria 语义和文案测试 |
| 修改 | `src/components/chat/AnswerEvidence.tsx` | 从卡片感调整为 metadata strip |
| 修改 | `src/components/chat/AnswerEvidence.test.tsx` | 保留点击/外链/隐藏数量测试，补低权重结构断言 |
| 修改 | `src/components/chat/agent/AgentStepCard.tsx` | 正常工具步骤降噪，异常展开保持 |
| 修改 | `src/components/chat/agent/SummaryStep.tsx` | summary step 低权重 |
| 修改 | `src/components/chat/agent/*.test.tsx` | 保留状态、展开、异常展示行为 |
| 修改 | `src/components/chat/SuggestedQuestions.tsx` | 推荐问题转为 follow-up action 视觉 |
| 修改 | `src/components/chat/SuggestedQuestions.test.tsx` | 覆盖 loading、refresh、pending、未登录阻断 |

---

## Task 1: 新增 AssistantResponseStack 边界

**Files:**

- Create: `src/components/chat/AssistantResponseStack.tsx`
- Create: `src/components/chat/AssistantResponseStack.test.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Test: `src/components/chat/AssistantResponseStack.test.tsx`

### 1.1 写失败测试

- [ ] 新增 `src/components/chat/AssistantResponseStack.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantActivity } from './assistantActivity';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import AssistantResponseStack from './AssistantResponseStack';

vi.mock('./ReasoningContent', () => ({
  default: ({ content, onToggle }: { content: string; onToggle: () => void }) => (
    <button type="button" data-testid="reasoning-content" onClick={onToggle}>{content}</button>
  ),
}));

vi.mock('./AssistantActivityStatus', () => ({
  default: ({ activity }: { activity: AssistantActivity }) => (
    <div data-testid="activity-status">{activity.kind}</div>
  ),
}));

vi.mock('./agent', () => ({
  AgentRunTimeline: ({ assistantMessageId }: { assistantMessageId: string }) => (
    <div data-testid="agent-run-timeline">{assistantMessageId}</div>
  ),
}));

vi.mock('./AnswerEvidence', () => ({
  default: ({ evidence, onOpenSources }: { evidence: AnswerEvidenceModel | null; onOpenSources: () => void }) => (
    evidence ? <button type="button" data-testid="answer-evidence" onClick={onOpenSources}>{evidence.summary}</button> : null
  ),
}));

vi.mock('./MarkdownRenderer', () => ({
  default: ({ content, onCitationClick }: { content: string; onCitationClick?: (index: number) => void }) => (
    <button type="button" data-testid="markdown-renderer" onClick={() => onCitationClick?.(0)}>{content}</button>
  ),
}));

function activity(overrides: Partial<AssistantActivity> = {}): AssistantActivity {
  return {
    kind: 'completed',
    tool: null,
    issue: null,
    searchBlock: null,
    urlBlocks: [],
    hasText: true,
    hasThinking: false,
    shouldSuppressReasoning: false,
    shouldShowSources: false,
    suggestionState: 'idle',
    ...overrides,
  };
}

const evidence: AnswerEvidenceModel = {
  items: [],
  previewItems: [],
  searchCount: 1,
  urlCount: 0,
  totalCount: 1,
  hiddenSearchCount: 0,
  hiddenUrlCount: 0,
  summary: '回答依据 · 搜索 1 条',
  hasSearchSources: true,
};

describe('AssistantResponseStack', () => {
  it('按辅助信息到正文的顺序渲染 assistant 内容栈', () => {
    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: true,
          content: '推理内容',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity()}
        onRetry={vi.fn()}
        answerEvidence={evidence}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '正文内容',
          sources: [{ title: '来源', url: 'https://example.com' }],
          onCitationClick: vi.fn(),
        }}
        showStreamingCursor={false}
      />,
    );

    const ids = Array.from(screen.getByTestId('assistant-response-stack').children)
      .map(child => child.getAttribute('data-testid'));

    expect(ids).toEqual([
      'reasoning-content',
      'activity-status',
      'agent-run-timeline',
      'answer-evidence',
      'markdown-renderer',
    ]);
  });

  it('透传 reasoning、来源、引用点击事件并展示流式光标', () => {
    const onToggle = vi.fn();
    const onOpenSources = vi.fn();
    const onCitationClick = vi.fn();

    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: true,
          content: '推理内容',
          isVisible: true,
          isStreaming: true,
          onToggle,
        }}
        activity={activity({ kind: 'answering' })}
        answerEvidence={evidence}
        onSourceClick={vi.fn()}
        onOpenSources={onOpenSources}
        markdown={{
          content: '正文内容',
          sources: [{ title: '来源', url: 'https://example.com' }],
          onCitationClick,
        }}
        showStreamingCursor
      />,
    );

    fireEvent.click(screen.getByTestId('reasoning-content'));
    fireEvent.click(screen.getByTestId('answer-evidence'));
    fireEvent.click(screen.getByTestId('markdown-renderer'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpenSources).toHaveBeenCalledTimes(1);
    expect(onCitationClick).toHaveBeenCalledWith(0);
    expect(screen.getByText('▌')).toBeInTheDocument();
  });
});
```

### 1.2 跑测试确认失败

- [ ] 执行：

```bash
npm test -- src/components/chat/AssistantResponseStack.test.tsx
```

Expected: FAIL，原因是 `AssistantResponseStack.tsx` 尚不存在。

### 1.3 实现组件

- [ ] 新增 `src/components/chat/AssistantResponseStack.tsx`：

```tsx
'use client';

import type { SearchSourceSummary } from '@/types/conversation';
import type { AssistantActivity } from './assistantActivity';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import ReasoningContent from './ReasoningContent';
import AssistantActivityStatus from './AssistantActivityStatus';
import AnswerEvidence from './AnswerEvidence';
import MarkdownRenderer from './MarkdownRenderer';
import { AgentRunTimeline } from './agent';

interface AssistantResponseStackProps {
  assistantMessageId: string;
  reasoning: {
    shouldRender: boolean;
    content: string;
    isVisible: boolean;
    isStreaming: boolean;
    onToggle: () => void;
    startTime?: number;
    endTime?: number;
  };
  activity: AssistantActivity;
  onRetry?: () => void;
  answerEvidence: AnswerEvidenceModel | null;
  onSourceClick: (index: number) => void;
  onOpenSources: () => void;
  markdown: {
    content: string;
    sources: SearchSourceSummary[];
    onCitationClick?: (index: number) => void;
  };
  showStreamingCursor: boolean;
}

export default function AssistantResponseStack({
  assistantMessageId,
  reasoning,
  activity,
  onRetry,
  answerEvidence,
  onSourceClick,
  onOpenSources,
  markdown,
  showStreamingCursor,
}: AssistantResponseStackProps) {
  return (
    <div
      data-testid="assistant-response-stack"
      className="w-full min-w-0 [&>*:last-child]:mb-0"
    >
      {reasoning.shouldRender ? (
        <ReasoningContent
          content={reasoning.content}
          isVisible={reasoning.isVisible}
          onToggle={reasoning.onToggle}
          isStreaming={reasoning.isStreaming}
          startTime={reasoning.startTime}
          endTime={reasoning.endTime}
        />
      ) : null}

      <AssistantActivityStatus activity={activity} />

      <AgentRunTimeline
        assistantMessageId={assistantMessageId}
        onRetry={onRetry}
      />

      <AnswerEvidence
        evidence={answerEvidence}
        onSourceClick={onSourceClick}
        onOpenSources={onOpenSources}
      />

      <MarkdownRenderer
        content={markdown.content}
        className="prose-headings:border-0 prose-hr:border-border/30"
        sources={markdown.sources}
        onCitationClick={markdown.onCitationClick}
      />

      {showStreamingCursor ? (
        <span className="animate-pulse motion-reduce:animate-none">▌</span>
      ) : null}
    </div>
  );
}
```

### 1.4 跑测试确认通过

- [ ] 执行：

```bash
npm test -- src/components/chat/AssistantResponseStack.test.tsx
```

Expected: PASS。

### 1.5 接入 ChatMessage

- [ ] 在 `src/components/chat/ChatMessage.tsx` 中新增 import：

```ts
import AssistantResponseStack from './AssistantResponseStack';
```

- [ ] 删除这些直接渲染用 import：

```ts
import ReasoningContent from './ReasoningContent';
import AssistantActivityStatus from './AssistantActivityStatus';
import AnswerEvidence from './AnswerEvidence';
import { AgentRunTimeline } from './agent';
import MarkdownRenderer from './MarkdownRenderer';
```

- [ ] 用下面代码替换 assistant 分支中 `ReasoningContent` 到 streaming cursor 的渲染块：

```tsx
                <AssistantResponseStack
                  assistantMessageId={message.id}
                  reasoning={{
                    shouldRender: !suppressThinking && (hasThinking || (isStreaming && isLastMessage && isStreamingReasoning)),
                    content: displayThinking,
                    isVisible: message.isReasoningVisible || localReasoningVisible || (isStreaming && isLastMessage),
                    onToggle: handleToggleReasoning,
                    isStreaming: isStreamingReasoning && isLastMessage && !isThinkingPhaseComplete,
                    startTime: (isLastMessage ? streamingStartTime : undefined) ?? undefined,
                    endTime: isLastMessage ? streamingEndTime : undefined,
                  }}
                  activity={activity}
                  onRetry={onRetry ? () => onRetry(message.id) : undefined}
                  answerEvidence={answerEvidence}
                  onSourceClick={handleCitationClick}
                  onOpenSources={() => setSourcesSidebarOpen(true)}
                  markdown={{
                    content: displayText || '',
                    sources: searchSources,
                    onCitationClick: searchSources.length > 0 ? handleCitationClick : undefined,
                  }}
                  showStreamingCursor={isStreaming && isLastMessage && activity.kind === 'answering'}
                />
```

### 1.6 跑接入测试

- [ ] 执行：

```bash
npm test -- src/components/chat/AssistantResponseStack.test.tsx src/components/chat/ChatMessage.test.tsx
```

Expected: 两个测试文件全部通过。

### 1.7 提交 Task 1

- [ ] 执行：

```bash
git add src/components/chat/AssistantResponseStack.tsx src/components/chat/AssistantResponseStack.test.tsx src/components/chat/ChatMessage.tsx
git commit -m "refactor: 抽出助手回复内容栈" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

## Task 2: 降低辅助层默认视觉权重

**Files:**

- Modify: `src/components/chat/ReasoningContent.tsx`
- Modify: `src/components/chat/AssistantActivityStatus.tsx`
- Modify: `src/components/chat/AnswerEvidence.tsx`
- Modify: `src/components/chat/agent/AgentStepCard.tsx`
- Modify: `src/components/chat/agent/SummaryStep.tsx`
- Test: existing component tests

### 2.1 先补样式语义测试

- [ ] 在 `src/components/chat/AnswerEvidence.test.tsx` 中新增：

```tsx
it('回答依据使用低权重 metadata strip 而不是强卡片', () => {
  const { container } = render(
    <AnswerEvidence
      evidence={deriveAnswerEvidence({
        searchSources: [{ title: '来源', url: 'https://example.com' }],
        urlBlocks: [],
      })}
      onSourceClick={vi.fn()}
      onOpenSources={vi.fn()}
    />,
  );

  const section = container.querySelector('section');
  expect(section?.className).toContain('rounded-md');
  expect(section?.className).toContain('bg-transparent');
  expect(section?.className).not.toContain('rounded-xl');
});
```

- [ ] 在 `src/components/chat/AssistantActivityStatus.test.tsx` 中新增：

```tsx
it('running 状态保持紧凑辅助条，异常态仍保留 alert 语义', () => {
  const { rerender } = render(
    <AssistantActivityStatus
      activity={baseActivity({
        kind: 'tool_running',
        tool: {
          kind: 'web_search',
          toolName: 'web_search',
          label: '正在搜索',
          target: 'AI 新闻',
          call: {
            toolCallId: 'tool-1',
            toolName: 'web_search',
            arguments: { query: 'AI 新闻' },
            status: 'running',
            startedAt: 1,
          },
        },
      })}
    />,
  );

  expect(screen.getByRole('status').className).toContain('text-xs');

  rerender(<AssistantActivityStatus activity={baseActivity({ kind: 'failed' })} />);

  expect(screen.getByRole('alert')).toHaveTextContent('生成失败，请重试');
});
```

- [ ] 在 `src/components/chat/agent/AgentStepCard.test.tsx` 中新增：

```tsx
it('成功工具步骤使用低权重容器', () => {
  const { container } = render(
    <AgentStepCard
      _isLast
      step={{
        stepId: 's1',
        stepNumber: 1,
        status: 'completed',
        startedAt: 1,
        completedAt: 2,
        contentBlockIds: [],
        toolCalls: [
          {
            toolCallId: 't1',
            toolName: 'web_search',
            arguments: { query: 'AI 新闻' },
            status: 'success',
            resultSummary: { kind: 'search', count: 5, truncated: false },
            startedAt: 1,
            completedAt: 2,
          },
        ],
      }}
    />,
  );

  expect(container.firstElementChild?.className).toContain('bg-transparent');
});
```

### 2.2 跑测试确认失败

- [ ] 执行：

```bash
npm test -- src/components/chat/AnswerEvidence.test.tsx src/components/chat/AssistantActivityStatus.test.tsx src/components/chat/agent/AgentStepCard.test.tsx
```

Expected: FAIL，失败点是当前组件仍使用较强卡片样式。

### 2.3 调整 AnswerEvidence 为 metadata strip

- [ ] 在 `src/components/chat/AnswerEvidence.tsx` 中，把 section class 调整为：

```tsx
<section className="mb-2 rounded-md border border-border/30 bg-transparent px-2.5 py-2 text-xs text-muted-foreground">
```

- [ ] 将 evidence item 的 class 从强卡片调为更轻：

```tsx
className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/30 bg-muted/10 px-2 py-1 text-left transition-colors hover:bg-muted/30"
```

URL `<a>` 使用同样 class，并保留 `no-underline`。

### 2.4 调整 AssistantActivityStatus 尺寸

- [ ] 在 `src/components/chat/AssistantActivityStatus.tsx` 中将 `StatusShell` 基础 class 改为：

```ts
'mb-2 flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs'
```

- [ ] 保留 tone class、role、aria-live、aria-atomic 不变。

### 2.5 调整 ReasoningContent 完成态

- [ ] 在 `src/components/chat/ReasoningContent.tsx` 中把外层默认完成态 class 从强卡片调低：

```ts
"rounded-lg border mb-2 overflow-hidden transition-all duration-300"
```

完成态使用：

```ts
"border-border/40 bg-transparent"
```

streaming 态继续使用：

```ts
"border-info-border bg-info-bg"
```

### 2.6 调整 AgentStepCard 和 SummaryStep 正常态

- [ ] 在 `src/components/chat/agent/AgentStepCard.tsx` 中将外层 class 改为：

```tsx
<div className="rounded-md border border-border/30 bg-transparent w-full min-w-0">
```

- [ ] 将 button hover 降低：

```tsx
className="w-full flex items-start gap-2 px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors duration-fast disabled:cursor-default disabled:hover:bg-transparent"
```

- [ ] 在 `src/components/chat/agent/SummaryStep.tsx` 中将外层 class 改为：

```tsx
<div className="rounded-md border border-border/20 bg-transparent px-2.5 py-1.5 flex items-center gap-2 text-xs w-full min-w-0">
```

### 2.7 跑相关测试

- [ ] 执行：

```bash
npm test -- \
  src/components/chat/AnswerEvidence.test.tsx \
  src/components/chat/AssistantActivityStatus.test.tsx \
  src/components/chat/ReasoningContent.test.tsx \
  src/components/chat/agent/AgentStepCard.test.tsx \
  src/components/chat/agent/SummaryStep.test.tsx \
  src/components/chat/agent/AgentRunTimeline.test.tsx
```

Expected: 全部通过。

### 2.8 提交 Task 2

- [ ] 执行：

```bash
git add \
  src/components/chat/ReasoningContent.tsx \
  src/components/chat/AssistantActivityStatus.tsx \
  src/components/chat/AnswerEvidence.tsx \
  src/components/chat/agent/AgentStepCard.tsx \
  src/components/chat/agent/SummaryStep.tsx \
  src/components/chat/AnswerEvidence.test.tsx \
  src/components/chat/AssistantActivityStatus.test.tsx \
  src/components/chat/agent/AgentStepCard.test.tsx
git commit -m "style: 降低回答辅助层视觉权重" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

## Task 3: 推荐问题改为低权重 follow-up action

**Files:**

- Modify: `src/components/chat/SuggestedQuestions.tsx`
- Modify: `src/components/chat/SuggestedQuestions.test.tsx`

### 3.1 先补测试

- [ ] 在 `src/components/chat/SuggestedQuestions.test.tsx` 中新增：

```tsx
it('推荐问题使用完成态 follow-up 区域而不是强卡片列表', () => {
  const { container } = render(
    <SuggestedQuestions
      questions={['继续分析来源', '换个角度解释']}
      isLoading={false}
      onSelectQuestion={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );

  const root = container.firstElementChild;
  expect(root?.className).toContain('border-t');
  expect(root?.className).toContain('pt-3');

  const first = screen.getByRole('button', { name: /继续分析来源/ });
  expect(first.className).toContain('rounded-md');
  expect(first.className).not.toContain('py-2.5');
});
```

### 3.2 跑测试确认失败

- [ ] 执行：

```bash
npm test -- src/components/chat/SuggestedQuestions.test.tsx
```

Expected: FAIL，当前 root 没有 `border-t`，按钮仍使用 `py-2.5`。

### 3.3 调整 SuggestedQuestions 样式

- [ ] 在 `src/components/chat/SuggestedQuestions.tsx` 中将 root class 改为：

```tsx
<div className={cn("mt-4 w-full max-w-full border-t border-border/40 pt-3", className)}>
```

- [ ] 将问题按钮 class 改为：

```tsx
className={cn(
  "flex items-center gap-2 w-full text-left rounded-md border border-border/50 bg-transparent px-2.5 py-1.5 text-sm text-foreground transition-colors duration-fast hover:bg-muted/30 hover:border-border",
  "h-auto justify-start font-normal",
  pendingQuestion === question && "border-info-border bg-info-bg text-info"
)}
```

- [ ] 保留 `pendingQuestion === question` 的 `border-info-border bg-info-bg text-info`。

### 3.4 跑测试

- [ ] 执行：

```bash
npm test -- src/components/chat/SuggestedQuestions.test.tsx
```

Expected: PASS。

### 3.5 提交 Task 3

- [ ] 执行：

```bash
git add src/components/chat/SuggestedQuestions.tsx src/components/chat/SuggestedQuestions.test.tsx
git commit -m "style: 收敛推荐问题视觉层级" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

## Task 4: ChatMessage 回归和清理

**Files:**

- Modify: `src/components/chat/ChatMessage.tsx`
- Modify: `src/components/chat/ChatMessage.test.tsx`
- Test: chat component regression

### 4.1 添加 ChatMessage 集成回归

- [ ] 在 `src/components/chat/ChatMessage.test.tsx` 中新增：

```tsx
it('assistant 回复通过 AssistantResponseStack 渲染正文和辅助层', () => {
  render(
    <ChatMessage
      message={{
        id: 'assistant-1',
        role: 'assistant',
        content: [
          {
            type: 'search',
            id: 'search-1',
            query: 'AI standards',
            sources: [{ title: 'AI Standards Source', url: 'https://standards.example.com/source' }],
          },
          { type: 'url_read', id: 'url-1', title: '网页 1', url: 'https://one.example.com' },
          { type: 'text', id: 'text-1', text: '正文内容[1]。' },
        ],
        timestamp: 1,
        chatId: 'chat-1',
      }}
    />,
  );

  expect(screen.getByTestId('assistant-response-stack')).toBeInTheDocument();
  expect(screen.getByText('正文内容')).toBeTruthy();
  expect(screen.getByText('回答依据 · 搜索 1 条 · 读取 1 个网页')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看参考资料 1：AI Standards Source' })).toBeInTheDocument();
});
```

### 4.2 跑测试确认失败或通过

- [ ] 执行：

```bash
npm test -- src/components/chat/ChatMessage.test.tsx
```

Expected: 如果 Task 1 已正确接入，应 PASS；如果缺 `data-testid` 或正文引用断言不匹配，按测试修复接入。

### 4.3 清理 ChatMessage imports

- [ ] 确认 `src/components/chat/ChatMessage.tsx` 不再 import 这些仅由 `AssistantResponseStack` 使用的组件：

```bash
rg -n "ReasoningContent|AssistantActivityStatus|AnswerEvidence|MarkdownRenderer|AgentRunTimeline" src/components/chat/ChatMessage.tsx
```

Expected: 只允许出现 `AssistantResponseStack`；不应出现上述组件名。

### 4.4 跑联合回归

- [ ] 执行：

```bash
npm test -- \
  src/components/chat/AssistantResponseStack.test.tsx \
  src/components/chat/ChatMessage.test.tsx \
  src/components/chat/AnswerEvidence.test.tsx \
  src/components/chat/AssistantActivityStatus.test.tsx \
  src/components/chat/SuggestedQuestions.test.tsx \
  src/components/chat/agent/AgentRunTimeline.test.tsx \
  src/components/chat/agent/AgentStepCard.test.tsx \
  src/components/chat/agent/SummaryStep.test.tsx
```

Expected: 全部通过。

### 4.5 提交 Task 4

- [ ] 如果 Task 4 有额外修复，执行：

```bash
git add src/components/chat/ChatMessage.tsx src/components/chat/ChatMessage.test.tsx
git commit -m "test: 补充助手回复内容栈回归" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

如果没有额外 diff，不提交。

---

## Task 5: 全量验证、squash、推送、CI

**Files:** no product file changes expected beyond previous tasks.

### 5.1 跑完整验证

- [ ] 执行：

```bash
npm test
npm run build
npx eslint \
  src/components/chat/AssistantResponseStack.tsx \
  src/components/chat/AssistantResponseStack.test.tsx \
  src/components/chat/ChatMessage.tsx \
  src/components/chat/ChatMessage.test.tsx \
  src/components/chat/ReasoningContent.tsx \
  src/components/chat/AssistantActivityStatus.tsx \
  src/components/chat/AnswerEvidence.tsx \
  src/components/chat/SuggestedQuestions.tsx \
  src/components/chat/agent/AgentStepCard.tsx \
  src/components/chat/agent/SummaryStep.tsx
```

Expected:

- `npm test` 全部通过。
- `npm run build` 通过；允许现有 Browserslist 旧数据提示。
- ESLint 不能有 error；如仍有现有 `<img>` warning，可在总结中说明。

### 5.2 检查没有启动本地服务

- [ ] 确认命令历史和当前执行没有 `npm run dev` / `next dev` / `next start`。

### 5.3 检查 diff 范围

- [ ] 执行：

```bash
git status --short --branch
git diff --stat origin/master..HEAD
git diff --check origin/master..HEAD
```

Expected:

- diff 只包含本计划列出的 chat UI 文件和本计划文档。
- `git diff --check` 无输出。
- 如工作区存在与本计划无关的未跟踪文件，只忽略它们，不加入提交。

### 5.4 squash 为单个提交

- [ ] 如果实施过程中产生多个 task commit，并且 `origin/master..HEAD` 只包含本计划提交，squash 成一个提交：

```bash
git reset --soft origin/master
git commit -m "style: 收敛助手回复视觉层级" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

### 5.5 推送并监听 CI

- [ ] 执行：

```bash
git push origin master
gh run list --repo HyxiaoGe/fusion-ui --branch master --limit 5 --json databaseId,status,conclusion,headSha,displayTitle,url,createdAt
```

- [ ] 找到 head sha 对应 run 后执行：

```bash
gh run watch <run-id> --repo HyxiaoGe/fusion-ui --exit-status
```

Expected:

- `Fusion UI Build & Deploy` 成功。
- `Build on Windows runner` 成功。
- `Deploy master on dev server` 成功。

---

## C 阶段后续计划提纲

C 阶段单独开计划，不在 B 阶段实施。

建议任务顺序：

1. 新增 `src/components/chat/useAssistantMessageViewModel.ts`，迁移 assistant 派生逻辑。
2. 新增 `src/components/chat/MessageActions.tsx`，统一复制、重试、编辑 action。
3. 新增 `src/components/chat/AssistantMessage.tsx`，承接 assistant message 壳和侧栏状态。
4. 新增 `src/components/chat/UserMessage.tsx`，承接用户气泡、文件和编辑态。
5. 将 `ChatMessage.tsx` 收缩为角色分发组件。

C 阶段验收：

- `ChatMessage.tsx` 显著变薄，只做角色分发。
- B 阶段 `AssistantResponseStack` API 不被破坏。
- 所有 `ChatMessage.test.tsx`、`AssistantResponseStack.test.tsx`、复制/编辑/引用/推荐问题测试继续通过。

---

## Self-review

- Spec coverage: B 阶段覆盖内容栈边界、辅助层降噪、推荐问题降权、回归验证；C 阶段作为后续提纲单独保留。
- Placeholder scan: 未发现待填充标记。
- Type consistency: `AssistantResponseStackProps` 使用现有 `AssistantActivity`、`AnswerEvidenceModel`、`SearchSourceSummary` 类型；事件签名沿用现有 `ChatMessage` handler。
- Scope check: B 可作为单 PR；C 明确不混入 B。
