# 会话切换渲染链路优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 降低已缓存会话切换时的主线程渲染成本，优先避免静态历史消息、Markdown、agent timeline 和侧边栏在无关状态变化下重复渲染。

**Architecture:** 第一阶段只做低风险 memo/selector 拆分，不引入虚拟列表。主消息区把静态 assistant 渲染稳定化，避免 stream/status/suggested question 等状态让历史 Markdown 重新解析；侧边栏只做 active/scroll 的轻量优化，保留现有列表结构。

**Tech Stack:** Next.js 15、React 19、Redux Toolkit、Vitest、Testing Library。

---

## 文件结构

- Modify: `src/components/chat/AssistantMessage.tsx`
  - 让静态 assistant message 的 view model 使用 `useMemo`，并导出 memo 化组件，避免无关父级 render 触发重复派生。
- Modify: `src/components/chat/MarkdownRenderer.tsx`
  - 使用 `React.memo` 包装，稳定 Markdown components 配置，保留 citation/code/table 行为。
- Modify: `src/components/chat/agent/AgentRunTimeline.tsx`
  - 改为接收可选 `run` prop；没有 prop 时保留现有 selector fallback。后续由上层传入 `agentRun`，避免每条历史 assistant 都订阅全局 stream。
- Modify: `src/components/chat/AssistantResponseStack.tsx`
  - 将 `agentRun` 透传给 `AgentRunTimeline`。
- Modify: `src/components/chat/AssistantMessage.test.tsx`
  - 增加静态消息重复 render 不重复派生 view model 的测试。
- Modify: `src/components/chat/AssistantResponseStack.test.tsx`
  - 增加 timeline 使用传入 run、Markdown props 稳定的测试。
- Modify: `src/components/chat/MarkdownRenderer.test.tsx`
  - 增加 memo 行为测试，确保相同 props rerender 不重复渲染重 markdown。
- Modify: `src/app/(app)/chat/[chatId]/page.tsx`
  - 拆分对象 selector，稳定 `emptyState`，减少无关 dispatch 导致页面层重渲染。
- Modify: `src/app/(app)/chat/[chatId]/page.test.tsx`
  - 增加无关 stream state 不改变 `ChatMessageList` 关键 props 的回归测试。
- Modify: `src/components/chat/ChatSidebar.tsx`
  - 侧栏滚动前判断 active item 是否已经可见，避免每次切换都排队 smooth scroll。
- Modify: `src/components/chat/ChatSidebar.test.tsx` 或新建测试
  - 如果现有测试缺失，增加 active item 已可见时不调用 `scrollIntoView` 的测试。

## Task 1: 静态 Assistant 渲染稳定化

**Files:**
- Modify: `src/components/chat/AssistantMessage.tsx`
- Modify: `src/components/chat/AssistantMessage.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `AssistantMessage.test.tsx` 增加测试：

```tsx
it('静态 assistant 在无关 props 引用稳定时不重复派生 view model', () => {
  const message = assistantMessage('assistant-1', '回答内容');
  const stableQuestions: string[] = [];
  const onSelectQuestion = vi.fn();
  const onRefreshQuestions = vi.fn();

  const { rerender } = render(
    <AssistantMessage
      message={message}
      isLastMessage={false}
      isStreaming={false}
      suggestedQuestions={stableQuestions}
      isLoadingQuestions={false}
      activeChatId="chat-1"
      modelName="AI助手"
      onSelectQuestion={onSelectQuestion}
      onRefreshQuestions={onRefreshQuestions}
    />
  );

  rerender(
    <AssistantMessage
      message={message}
      isLastMessage={false}
      isStreaming={false}
      suggestedQuestions={stableQuestions}
      isLoadingQuestions={false}
      activeChatId="chat-1"
      modelName="AI助手"
      onSelectQuestion={onSelectQuestion}
      onRefreshQuestions={onRefreshQuestions}
    />
  );

  expect(deriveStaticAssistantMessageViewModelMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/chat/AssistantMessage.test.tsx`

Expected: 新测试失败，`deriveStaticAssistantMessageViewModelMock` 被调用 2 次。

- [ ] **Step 3: 实现最小优化**

在 `StaticAssistantMessage` 内用 `useMemo` 缓存 view model：

```tsx
const viewModel = useMemo(
  () => deriveStaticAssistantMessageViewModel({
    message: props.message,
    isLoadingQuestions: props.isLoadingQuestions,
    suggestedQuestionsCount: props.suggestedQuestions.length,
    currentRun: props.agentRun,
  }),
  [
    props.message,
    props.isLoadingQuestions,
    props.suggestedQuestions.length,
    props.agentRun,
  ]
);
```

并用 `React.memo` 包装默认导出：

```tsx
export default React.memo(AssistantMessage);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/components/chat/AssistantMessage.test.tsx`

Expected: 全部通过。

## Task 2: MarkdownRenderer memo 化

**Files:**
- Modify: `src/components/chat/MarkdownRenderer.tsx`
- Modify: `src/components/chat/MarkdownRenderer.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `MarkdownRenderer.test.tsx` 中 mock `react-markdown`，增加相同 props rerender 不重复调用的测试。

```tsx
it('相同 props rerender 时不重复执行 ReactMarkdown', () => {
  const sources = [{ title: 'A', url: 'https://example.com/a' }];
  const onCitationClick = vi.fn();

  const { rerender } = render(
    <MarkdownRenderer content="hello [1]" sources={sources} onCitationClick={onCitationClick} />
  );

  rerender(
    <MarkdownRenderer content="hello [1]" sources={sources} onCitationClick={onCitationClick} />
  );

  expect(reactMarkdownRenderMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/chat/MarkdownRenderer.test.tsx`

Expected: 新测试失败，mock 被调用 2 次。

- [ ] **Step 3: 实现最小优化**

将组件改为命名函数并 memo 导出：

```tsx
const markdownComponents = {
  pre: ({ children }: any) => <>{children}</>,
  code: CodeRenderer,
  p: CitationParagraph,
  li: CitationListItem,
  strong: CitationStrong,
  em: CitationEm,
  h1: CitationH1,
  h2: CitationH2,
  h3: CitationH3,
  table: TableRenderer,
  th: TableHeaderRenderer,
  td: TableCellRenderer,
};

function MarkdownRenderer(props: MarkdownRendererProps) {
  // 保留现有 processedContent / citation 行为
}

export default React.memo(MarkdownRenderer);
```

实现时如果拆 renderer 过大，允许先只做 `React.memo(MarkdownRenderer)`，不改变 citation 行为。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/components/chat/MarkdownRenderer.test.tsx`

Expected: citation/code/table 既有测试和新 memo 测试都通过。

## Task 3: AgentRunTimeline 取消历史消息全局订阅

**Files:**
- Modify: `src/components/chat/agent/AgentRunTimeline.tsx`
- Modify: `src/components/chat/AssistantResponseStack.tsx`
- Modify: `src/components/chat/agent/AgentRunTimeline.test.tsx`
- Modify: `src/components/chat/AssistantResponseStack.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `AgentRunTimeline.test.tsx` 增加测试：传入 `run={null}` 时不读取全局 selector，且不渲染。

```tsx
it('传入 run prop 时不订阅全局 currentRun', () => {
  render(<AgentRunTimeline assistantMessageId="assistant-1" run={null} />);

  expect(useAppSelectorMock).not.toHaveBeenCalled();
  expect(screen.queryByTestId('agent-run-timeline')).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/chat/agent/AgentRunTimeline.test.tsx`

Expected: 类型或断言失败，因为当前组件没有 `run` prop 且总是调用 selector。

- [ ] **Step 3: 实现最小优化**

给 `AgentRunTimeline` 增加 prop：

```tsx
interface AgentRunTimelineProps {
  assistantMessageId: string;
  onRetry?: () => void;
  run?: AgentRunState | null;
}

export function AgentRunTimeline({ assistantMessageId, onRetry, run: runProp }: AgentRunTimelineProps) {
  const selectedRun = useAppSelector(s => runProp === undefined ? s.stream.currentRun : null);
  const run = runProp === undefined ? selectedRun : runProp;
  // 保留现有过滤逻辑
}
```

`AssistantResponseStack` 调用处传入 `activity` 以外新增的 `agentRun` prop：

```tsx
<AgentRunTimeline
  assistantMessageId={assistantMessageId}
  onRetry={onRetry}
  run={agentRun}
/>
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- src/components/chat/agent/AgentRunTimeline.test.tsx src/components/chat/AssistantResponseStack.test.tsx
```

Expected: 全部通过。

## Task 4: ChatPage selector 和 props 稳定化

**Files:**
- Modify: `src/app/(app)/chat/[chatId]/page.tsx`
- Modify: `src/app/(app)/chat/[chatId]/page.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `page.test.tsx` 中增加测试：同一 chatId 下无关 selector 值变化 rerender 时，`ChatMessageList` 收到的 `emptyState` 引用稳定。

```tsx
it('同一会话无关状态变化时保持 ChatMessageList 稳定 props', async () => {
  conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
  hydrationById.set('chat-a', { view: 'ready' });

  const { rerender } = render(<ChatPage />);

  await waitFor(() => {
    expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
  });

  const firstProps = chatMessageListMock.mock.calls.at(-1)?.[0];
  transientCompletionState.visible = true;
  rerender(<ChatPage />);
  const secondProps = chatMessageListMock.mock.calls.at(-1)?.[0];

  expect(secondProps.emptyState).toBe(firstProps.emptyState);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- 'src/app/(app)/chat/[chatId]/page.test.tsx'`

Expected: 新测试失败，因为 `emptyState` 是 inline object。

- [ ] **Step 3: 实现最小优化**

将空态对象提升到模块常量，并拆分 selector：

```tsx
const CHAT_EMPTY_STATE = {
  title: '开始对话',
  description: '发送消息后，AI 的回复会显示在这里。',
};

const conversationError = useAppSelector((state) => state.conversation.globalError);
const isStreaming = useAppSelector((state) => state.stream.isStreaming);
const lastReadyConversationSnapshot = useAppSelector((state) => state.conversation.lastReadyConversationSnapshot);
const streamConversationId = useAppSelector((state) => state.stream.conversationId);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- 'src/app/(app)/chat/[chatId]/page.test.tsx'`

Expected: 全部通过。

## Task 5: 侧栏 active 滚动降噪

**Files:**
- Modify: `src/components/chat/ChatSidebar.tsx`
- Create or Modify: `src/components/chat/ChatSidebar.test.tsx`

- [ ] **Step 1: 写失败测试**

新增测试：active item 已在 container 可视范围内时，不调用 `scrollIntoView`。

```tsx
it('active item 已可见时不触发 scrollIntoView', async () => {
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  mockElementRect(container, { top: 0, bottom: 300 });
  mockElementRect(activeItem, { top: 40, bottom: 80 });

  render(<ChatSidebar onNewChat={vi.fn()} activeChatIdOverride="chat-a" />);

  await vi.advanceTimersByTimeAsync(60);

  expect(scrollIntoView).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/chat/ChatSidebar.test.tsx`

Expected: 新测试失败，当前代码总会调用 `scrollIntoView`。

- [ ] **Step 3: 实现最小优化**

在滚动 effect 里加可见性判断：

```tsx
const containerRect = containerRef.current.getBoundingClientRect();
const targetRect = target.getBoundingClientRect();
const isVisible = targetRect.top >= containerRect.top && targetRect.bottom <= containerRect.bottom;
if (!isVisible) {
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/components/chat/ChatSidebar.test.tsx`

Expected: 全部通过。

## 验证

- [ ] `npm test -- src/components/chat/AssistantMessage.test.tsx src/components/chat/MarkdownRenderer.test.tsx src/components/chat/agent/AgentRunTimeline.test.tsx src/components/chat/AssistantResponseStack.test.tsx 'src/app/(app)/chat/[chatId]/page.test.tsx' src/components/chat/ChatSidebar.test.tsx`
- [ ] `npm test`
- [ ] `npx eslint src/components/chat/AssistantMessage.tsx src/components/chat/MarkdownRenderer.tsx src/components/chat/agent/AgentRunTimeline.tsx src/components/chat/AssistantResponseStack.tsx 'src/app/(app)/chat/[chatId]/page.tsx' src/components/chat/ChatSidebar.tsx`
- [ ] `npm run build`
- [ ] `git diff --check`

## 后续评估

如果 A/B 阶段后仍有明显长会话切换顿挫，再单独设计虚拟列表/窗口化。虚拟化会影响滚动、自动到底部、sources/sidebar、历史消息定位，不纳入本计划第一批实现。
