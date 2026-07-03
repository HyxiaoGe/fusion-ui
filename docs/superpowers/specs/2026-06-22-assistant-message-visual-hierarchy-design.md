# Assistant 回复视觉层级设计

## 背景

Fusion Web 聊天页已经完成状态主线、Agent 工具过程聚合、回答依据区统一。当前剩余问题不是缺入口，而是同一条 assistant 消息里的辅助信息仍然容易和正文争抢视觉层级。

现有渲染顺序在 `src/components/chat/ChatMessage.tsx` 中集中处理：

1. `ReasoningContent`
2. `AssistantActivityStatus`
3. `AgentRunTimeline`
4. `AnswerEvidence`
5. `MarkdownRenderer`
6. 消息操作栏
7. `SuggestedQuestions`

这些组件多数使用边框、背景、圆角和块级间距。它们各自合理，但合在一条消息里时，正文、思考、工具、依据、推荐问题的视觉权重过于接近。

## 目标

先做 B，再做 C：

- B：回答消息视觉层级收敛，同时抽出一个 AI 回复内容栈边界，让正文保持主层，辅助信息退到次级。
- C：在 B 的边界稳定后，再做更完整的 `ChatMessage` 结构化重构。

## 非目标

- 不改后端 schema、SSE、Redux store shape、Dexie 或 Redis Stream 逻辑。
- 不改变发送、停止、重连、文件上传、联网搜索、URL 读取的业务行为。
- 不做移动端布局。
- 不新增反馈、评分、点赞等新功能。
- 不启动本地 Fusion dev server 验证。
- B 阶段不把 `ChatMessage` 完全拆成多个业务组件；完整拆分留给 C。

## 当前问题

### 1. 辅助层视觉权重偏高

`ReasoningContent`、`AssistantActivityStatus`、`AnswerEvidence`、`AgentRunTimeline` 都使用卡片化表现。正常完成态下，辅助信息应该帮助理解回答，而不是像正文同级模块。

### 2. `ChatMessage` 总装层过重

`ChatMessage.tsx` 目前超过 500 行，同时负责：

- 用户消息展示和编辑。
- assistant 数据派生。
- reasoning/activity/timeline/evidence/markdown/suggested questions 组合。
- 复制、重试、图片查看、资料侧栏状态。

B 阶段可以先抽出 `AssistantResponseStack`，让 AI 回复内容的顺序和层级集中管理。C 阶段再继续拆 `UserMessage`、`AssistantMessage`、`MessageActions` 和 view model hook。

### 3. 推荐问题仍像主卡片

`SuggestedQuestions` 当前使用全宽 outline button。它语义上是完成态后的下一步行动，应低于正文和回答依据，视觉上更像 follow-up action。

## B 阶段设计

### 新增 `AssistantResponseStack`

新增文件：

- `src/components/chat/AssistantResponseStack.tsx`
- `src/components/chat/AssistantResponseStack.test.tsx`

职责：

- 只负责 assistant 回复内容栈的渲染顺序。
- 接收 `ChatMessage` 已经派生好的 props，不自行读取 Redux、不写数据库、不发请求。
- 组合 `ReasoningContent`、`AssistantActivityStatus`、`AgentRunTimeline`、`AnswerEvidence`、`MarkdownRenderer` 和流式光标。

`ChatMessage` 仍负责：

- 从 message/stream/currentRun 派生 `activity`、`searchSources`、`answerEvidence`、`displayText`、`displayThinking`。
- 管理引用侧栏、复制、重试、编辑等事件。

### 视觉层级规则

正常回答：

1. 正文是最强层级，不增加外层卡片。
2. `AnswerEvidence` 是正文前的 metadata strip。
3. 已完成的 reasoning 是低权重折叠条。
4. 正常成功的 Agent timeline 已隐藏；只有运行中、失败、降级、中断、超限时显示。
5. 推荐问题是完成后的 follow-up action 区，不做强卡片。

运行中回答：

1. 真实工具运行状态仍可见。
2. streaming reasoning 可保持 info 语义色，但不压过工具状态。
3. 正文开始输出后，正文和光标成为主线。

异常回答：

1. failed、interrupted、limit_reached、tool degraded/failed 保留明显提示。
2. 异常提示可以使用 warning/error 卡片，不参与降噪。

### B 阶段样式范围

允许调整：

- `ReasoningContent` 的默认完成态边框、背景、圆角、间距。
- `AssistantActivityStatus` 的尺寸和边框强度，但不改变 `role` / `aria-live`。
- `AnswerEvidence` 的 metadata strip 和预览 item 密度。
- `AgentStepCard` / `SummaryStep` 的正常态低权重样式。
- `SuggestedQuestions` 的间距、标题、按钮密度和 pending/loading 表现。

不允许调整：

- Markdown citation 解析。
- SourcesSidebar 数据结构。
- `deriveAssistantActivity` 状态优先级。
- `deriveAnswerEvidence` 计数逻辑。
- 推荐问题生成和发送逻辑。

## C 阶段设计

C 在 B 合并并验证后单独做。目标是结构化拆分，不和 B 同一个 PR 混做。

建议拆分：

- `AssistantMessage.tsx`：assistant 消息壳、model header、正文栈、操作栏、资料侧栏。
- `UserMessage.tsx`：用户气泡、用户文件展示、编辑态、用户操作栏。
- `MessageActions.tsx`：复制、重新生成、编辑、重试等 hover action。
- `useAssistantMessageViewModel.ts`：把 `ChatMessage` 中 assistant 相关派生逻辑迁出。
- `useMessageCopy.ts`：复制和 toast 状态。

C 的验收标准：

- `ChatMessage.tsx` 只做角色分发和少量共享布局。
- 用户消息和 assistant 消息测试仍覆盖现有交互。
- 不改变 B 阶段确立的视觉层级。

## 验收标准

B 完成后：

- `ChatMessage.tsx` 不再直接手写 assistant 内容栈顺序，而是交给 `AssistantResponseStack`。
- 正常完成态下，正文视觉权重最高，辅助信息不再像多张同级卡片。
- 异常态提示仍明显，不被过度降噪。
- 推荐问题更像下一步行动，不像回答正文的一组主卡片。
- 既有引用、资料、URL 外链、复制、重试、推荐问题点击行为不变。

## 测试策略

- `AssistantResponseStack.test.tsx` 覆盖渲染顺序、正文主层、流式光标和 handler 透传。
- `ReasoningContent.test.tsx` 覆盖完成态和 streaming 态基本样式语义。
- `AnswerEvidence.test.tsx` 覆盖低权重资料条、隐藏来源提示、搜索点击、URL 外链。
- `SuggestedQuestions.test.tsx` 覆盖 loading、refresh、pending、未登录阻断。
- `ChatMessage.test.tsx` 覆盖接入后行为不变。
