# ChatMessage 结构化拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ChatMessage.tsx` 从总装大组件拆成 assistant view model、用户消息、assistant 消息、操作栏和复制 hook，同时保持现有行为不变。

**Architecture:** C 阶段只做结构化拆分，不改业务协议和视觉层级。`ChatMessage` 保留角色分发、数据库同步、reasoning 自动折叠和图片查看状态；其余渲染和派生逻辑下沉到独立组件或 hook。

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, React Testing Library, Tailwind CSS, lucide-react。

---

## 执行约束

- [ ] 不启动本地 Fusion dev server，不运行 `npm run dev`、`npm run dev:next`、`next dev`、`next start`。
- [ ] 不改后端、SSE、Redux store shape、Dexie schema、发送/停止/重连逻辑。
- [ ] 不改 `AssistantResponseStack` API 和 B 阶段视觉层级。
- [ ] 不做新的视觉风格调整，只迁移现有 JSX。
- [ ] 先写测试，再写实现。
- [ ] 每个任务提交中文 commit，并包含 `Co-Authored-By: Codex <noreply@anthropic.com>`。
- [ ] 不提交现有未跟踪 docs，除非本计划最终决定提交 C 阶段 spec/plan。

## 文件结构

| 类型 | 文件 | 职责 |
|------|------|------|
| 新增 | `src/components/chat/useMessageCopy.ts` | 复制正文、fallback、toast、timer cleanup |
| 新增 | `src/components/chat/useMessageCopy.test.tsx` | 复制 hook 行为测试 |
| 新增 | `src/components/chat/MessageActions.tsx` | assistant/user hover 操作栏 |
| 新增 | `src/components/chat/MessageActions.test.tsx` | 操作栏按钮和时间测试 |
| 新增 | `src/components/chat/UserMessage.tsx` | 用户气泡、文件 blocks、编辑态、失败提示、用户操作栏 |
| 新增 | `src/components/chat/UserMessage.test.tsx` | 用户消息渲染和编辑交互测试 |
| 新增 | `src/components/chat/useAssistantMessageViewModel.ts` | assistant 派生逻辑 |
| 新增 | `src/components/chat/useAssistantMessageViewModel.test.tsx` | assistant view model 派生测试 |
| 新增 | `src/components/chat/AssistantMessage.tsx` | assistant 头部、内容栈、操作栏、资料侧栏、推荐问题 |
| 新增 | `src/components/chat/AssistantMessage.test.tsx` | assistant 消息组合测试 |
| 修改 | `src/components/chat/ChatMessage.tsx` | 收缩为角色分发和共享副作用 |
| 修改 | `src/components/chat/ChatMessage.test.tsx` | 保留并补充整体回归 |

## Task 1: 抽出 useMessageCopy 和 MessageActions

**Files:**

- Create: `src/components/chat/useMessageCopy.ts`
- Create: `src/components/chat/useMessageCopy.test.tsx`
- Create: `src/components/chat/MessageActions.tsx`
- Create: `src/components/chat/MessageActions.test.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Test: `src/components/chat/useMessageCopy.test.tsx`, `src/components/chat/MessageActions.test.tsx`, `src/components/chat/ChatMessage.test.tsx`

### 1.1 写失败测试

- [ ] 新增 `useMessageCopy.test.tsx`，覆盖：
  - secure clipboard 成功复制指定文本。
  - 复制失败时调用 toast，文案为“复制失败，请重试”。
  - 成功复制后 `copied` 为 true，2 秒后恢复 false。
- [ ] 新增 `MessageActions.test.tsx`，覆盖：
  - assistant 模式显示时间、复制、重新生成按钮。
  - user 模式显示时间、编辑、重新发送按钮。
  - 点击按钮会调用对应 handler。

### 1.2 跑测试确认失败

- [ ] 执行：

```bash
npm test -- src/components/chat/useMessageCopy.test.tsx src/components/chat/MessageActions.test.tsx
```

Expected: FAIL，原因是新文件尚不存在。

### 1.3 实现 hook 和组件

- [ ] `useMessageCopy` 导出：

```ts
interface UseMessageCopyOptions {
  text: string;
}

export function useMessageCopy({ text }: UseMessageCopyOptions): {
  copied: boolean;
  copy: () => Promise<void>;
}
```

- [ ] `MessageActions` 导出：

```ts
interface MessageActionsProps {
  timestamp?: number;
  copied?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  onEdit?: () => void;
  retryLabel: string;
  className?: string;
}
```

- [ ] `MessageActions` 内部格式化时间，空 timestamp 不显示时间文本。
- [ ] assistant 有 `onCopy` 时显示复制按钮；user 有 `onEdit` 时显示编辑按钮；有 `onRetry` 时显示 retry 按钮。

### 1.4 接入 ChatMessage

- [ ] 删除 `ChatMessage.tsx` 中 `copied` state、timer ref、copy effect、`handleCopyMessage`。
- [ ] 用 `useMessageCopy({ text: displayText })` 取代复制逻辑。
- [ ] assistant 操作栏改用 `MessageActions`。
- [ ] user 操作栏改用 `MessageActions`。

### 1.5 验证并提交

- [ ] 执行：

```bash
npm test -- src/components/chat/useMessageCopy.test.tsx src/components/chat/MessageActions.test.tsx src/components/chat/ChatMessage.test.tsx
npx eslint src/components/chat/useMessageCopy.ts src/components/chat/useMessageCopy.test.tsx src/components/chat/MessageActions.tsx src/components/chat/MessageActions.test.tsx src/components/chat/ChatMessage.tsx
```

- [ ] 提交：

```bash
git add src/components/chat/useMessageCopy.ts src/components/chat/useMessageCopy.test.tsx src/components/chat/MessageActions.tsx src/components/chat/MessageActions.test.tsx src/components/chat/ChatMessage.tsx
git commit -m "refactor: 抽出消息操作栏和复制逻辑" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 2: 抽出 UserMessage

**Files:**

- Create: `src/components/chat/UserMessage.tsx`
- Create: `src/components/chat/UserMessage.test.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Test: `src/components/chat/UserMessage.test.tsx`, `src/components/chat/ChatMessage.test.tsx`

### 2.1 写失败测试

- [ ] 新增 `UserMessage.test.tsx`，覆盖：
  - 普通用户文本渲染。
  - `message.status === 'failed'` 时显示“发送失败，请重新发送”。
  - 点击编辑后进入编辑态，修改内容后 Ctrl+Enter 调用 `onEdit(message.id, value)`。
  - Esc 取消编辑，不调用 `onEdit`。
  - 图片 file block 点击调用 `onViewImage(block)`。

### 2.2 跑测试确认失败

```bash
npm test -- src/components/chat/UserMessage.test.tsx
```

Expected: FAIL，原因是 `UserMessage.tsx` 尚不存在。

### 2.3 实现 UserMessage

- [ ] Props：

```ts
interface UserMessageProps {
  message: Message;
  blocksToRender: ContentBlock[];
  messageText: string;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onViewImage: (block: FileBlockType) => void;
}
```

- [ ] 从 `ChatMessage.tsx` 搬迁用户文件 blocks、用户气泡、编辑态、失败提示、用户操作栏。
- [ ] 使用 `MessageActions` 渲染用户操作栏。
- [ ] 不读取 Redux，不写数据库。

### 2.4 接入 ChatMessage

- [ ] `ChatMessage.tsx` 用户分支改为：

```tsx
<UserMessage
  message={message}
  blocksToRender={blocksToRender}
  messageText={messageText}
  onRetry={onRetry}
  onEdit={onEdit}
  onViewImage={setViewingImage}
/>
```

- [ ] 删除 `ChatMessage.tsx` 中用户编辑态 state 和用户文件 JSX。

### 2.5 验证并提交

```bash
npm test -- src/components/chat/UserMessage.test.tsx src/components/chat/ChatMessage.test.tsx
npx eslint src/components/chat/UserMessage.tsx src/components/chat/UserMessage.test.tsx src/components/chat/ChatMessage.tsx
git add src/components/chat/UserMessage.tsx src/components/chat/UserMessage.test.tsx src/components/chat/ChatMessage.tsx
git commit -m "refactor: 抽出用户消息组件" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 3: 抽出 useAssistantMessageViewModel

**Files:**

- Create: `src/components/chat/useAssistantMessageViewModel.ts`
- Create: `src/components/chat/useAssistantMessageViewModel.test.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Test: `src/components/chat/useAssistantMessageViewModel.test.tsx`, `src/components/chat/ChatMessage.test.tsx`

### 3.1 写失败测试

- [ ] 新增 hook 测试，mock `useAppSelector`，覆盖：
  - 历史 assistant 消息从 `message.content` 派生 `displayText`、`searchSources`、`answerEvidence`。
  - 流式最后一条消息从 stream blocks 派生正文。
  - `currentRun.messageId` 不属于当前消息时不污染 activity issue。
  - thinking 文本提到“搜索”但没有真实工具调用时不产生搜索 UI。

### 3.2 跑测试确认失败

```bash
npm test -- src/components/chat/useAssistantMessageViewModel.test.tsx
```

Expected: FAIL，原因是 hook 尚不存在。

### 3.3 实现 hook

- [ ] hook 参数：

```ts
interface UseAssistantMessageViewModelOptions {
  message: Message;
  isStreaming: boolean;
  isLastMessage: boolean;
  isLoadingQuestions: boolean;
  suggestedQuestionsCount: number;
}
```

- [ ] 返回：

```ts
{
  blocksToRender,
  isCurrentlyStreaming,
  activity,
  searchSources,
  answerEvidence,
  displayText,
  displayThinking,
  suppressThinking,
  hasThinking,
  streamingStartTime,
  streamingEndTime,
  isStreamingReasoning,
  isThinkingPhaseComplete,
}
```

- [ ] 保持现有派生逻辑和依赖关系。

### 3.4 接入 ChatMessage

- [ ] 从 `ChatMessage.tsx` 移除 assistant 派生 `useAppSelector` 和 `useMemo` 块。
- [ ] 用 `useAssistantMessageViewModel` 的返回值替代现有变量。

### 3.5 验证并提交

```bash
npm test -- src/components/chat/useAssistantMessageViewModel.test.tsx src/components/chat/ChatMessage.test.tsx src/components/chat/assistantActivity.test.ts src/components/chat/answerEvidenceModel.test.ts
npx eslint src/components/chat/useAssistantMessageViewModel.ts src/components/chat/useAssistantMessageViewModel.test.tsx src/components/chat/ChatMessage.tsx
git add src/components/chat/useAssistantMessageViewModel.ts src/components/chat/useAssistantMessageViewModel.test.tsx src/components/chat/ChatMessage.tsx
git commit -m "refactor: 抽出助手消息视图模型" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 4: 抽出 AssistantMessage 并瘦身 ChatMessage

**Files:**

- Create: `src/components/chat/AssistantMessage.tsx`
- Create: `src/components/chat/AssistantMessage.test.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Modify: `src/components/chat/ChatMessage.test.tsx`
- Test: `src/components/chat/AssistantMessage.test.tsx`, `src/components/chat/ChatMessage.test.tsx`

### 4.1 写失败测试

- [ ] 新增 `AssistantMessage.test.tsx`，mock Redux selectors 和子组件必要依赖，覆盖：
  - 显示模型头。
  - 渲染 `AssistantResponseStack`。
  - 点击 Markdown 引用后打开 `SourcesSidebar`。
  - 最后一条非流式 assistant 消息渲染 `SuggestedQuestions`。
  - 非最后一条或 streaming 时不渲染推荐问题。

### 4.2 跑测试确认失败

```bash
npm test -- src/components/chat/AssistantMessage.test.tsx
```

Expected: FAIL，原因是组件尚不存在。

### 4.3 实现 AssistantMessage

- [ ] Props：

```ts
interface AssistantMessageProps {
  message: Message;
  files?: FileWithPreview[];
  isLastMessage: boolean;
  isStreaming: boolean;
  onRetry?: (messageId: string) => void;
  suggestedQuestions: string[];
  isLoadingQuestions: boolean;
  onSelectQuestion?: (question: string) => void;
  onRefreshQuestions?: () => void;
  activeChatId: string | null;
  providerId?: string;
  modelName: string;
}
```

- [ ] 从 `ChatMessage.tsx` 搬迁 assistant header、`AssistantResponseStack`、assistant actions、旧 files prop、`SuggestedQuestions`、`SourcesSidebar`。
- [ ] 使用 `useAssistantMessageViewModel`、`useMessageCopy`、`MessageActions`。
- [ ] 保留 `handleToggleReasoning` 行为：有 `activeChatId` 时 dispatch `toggleReasoningVisibility`，否则本地切换。

### 4.4 瘦身 ChatMessage

- [ ] `ChatMessage.tsx` 保留：
  - 外层 shared layout。
  - `useAppDispatch`、`activeChatId`、model/provider 选择。
  - `chatStore.upsertMessage` 同步副作用。
  - reasoning 自动折叠副作用。
  - `ImageViewer` 状态。
  - user/assistant 分发。
- [ ] 删除已经迁出的 JSX 和 handler。

### 4.5 验证并提交

```bash
npm test -- src/components/chat/AssistantMessage.test.tsx src/components/chat/ChatMessage.test.tsx src/components/chat/AssistantResponseStack.test.tsx src/components/chat/SuggestedQuestions.test.tsx
npx eslint src/components/chat/AssistantMessage.tsx src/components/chat/AssistantMessage.test.tsx src/components/chat/ChatMessage.tsx src/components/chat/ChatMessage.test.tsx
git add src/components/chat/AssistantMessage.tsx src/components/chat/AssistantMessage.test.tsx src/components/chat/ChatMessage.tsx src/components/chat/ChatMessage.test.tsx
git commit -m "refactor: 抽出助手消息组件" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 5: 回归验证、squash、推送、CI

**Files:** no product file changes expected beyond previous tasks.

### 5.1 完整验证

```bash
npm test
npm run build
npx eslint \
  src/components/chat/ChatMessage.tsx \
  src/components/chat/ChatMessage.test.tsx \
  src/components/chat/AssistantMessage.tsx \
  src/components/chat/AssistantMessage.test.tsx \
  src/components/chat/UserMessage.tsx \
  src/components/chat/UserMessage.test.tsx \
  src/components/chat/MessageActions.tsx \
  src/components/chat/MessageActions.test.tsx \
  src/components/chat/useMessageCopy.ts \
  src/components/chat/useMessageCopy.test.tsx \
  src/components/chat/useAssistantMessageViewModel.ts \
  src/components/chat/useAssistantMessageViewModel.test.tsx
```

Expected:

- `npm test` 全部通过。
- `npm run build` 通过；允许既有 Browserslist 旧数据提示。
- ESLint 不允许 error；既有 warning 可记录。

### 5.2 检查范围

```bash
git status --short --branch
git diff --stat origin/master..HEAD
git diff --check origin/master..HEAD
```

Expected:

- diff 只包含本计划列出的 chat 组件/hook/test 文件。
- 不提交现有未跟踪 docs。
- `git diff --check` 无输出。

### 5.3 squash 和推送

```bash
git reset --soft origin/master
git commit -m "refactor: 拆分聊天消息组件结构" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
git push origin master
```

### 5.4 监听 CI

```bash
gh run list --repo HyxiaoGe/fusion-ui --branch master --limit 10 --json databaseId,status,conclusion,headSha,displayTitle,url,createdAt,workflowName,event
gh run watch <run-id> --repo HyxiaoGe/fusion-ui --exit-status
```

Expected:

- `Build on Windows runner` 成功。
- `Deploy master on dev server` 成功。

## Self-review

- Spec coverage: C 阶段拆分目标覆盖 assistant view model、copy hook、操作栏、用户消息、assistant 消息和最终 ChatMessage 瘦身。
- Placeholder scan: 未发现待填充标记。
- Scope check: 只做结构化拆分，不改协议、不改视觉、不改业务行为。
