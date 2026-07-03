# ChatMessage 结构化拆分设计

## 背景

`src/components/chat/ChatMessage.tsx` 目前仍是聊天消息的总装组件，约 545 行。B 阶段已经把 assistant 正文栈抽到 `AssistantResponseStack`，但 `ChatMessage` 仍同时负责：

- Redux/stream 派生 assistant 渲染数据。
- assistant 模型头、正文栈、资料侧栏、推荐问题。
- 用户消息气泡、文件预览、编辑态、失败提示。
- 用户/assistant 操作栏。
- 复制状态、toast、引用侧栏状态、图片查看状态。
- Dexie 消息同步和 reasoning 自动折叠副作用。

C 阶段目标是结构化拆分，不改变用户可见行为，不再做新的 UI 视觉调整。

## 目标

- 让 `ChatMessage.tsx` 收缩为角色分发和少量共享副作用组件。
- 把 assistant 派生逻辑迁入独立 hook。
- 把用户消息、assistant 消息、消息操作栏、复制逻辑拆成可独立测试的单元。
- 保持 B 阶段确立的 `AssistantResponseStack` API 和视觉层级不变。

## 非目标

- 不改后端、SSE、Redux store shape、Dexie schema 或 Redis Stream 逻辑。
- 不改联网搜索、URL 读取、发送、停止、重连、推荐问题生成业务逻辑。
- 不做新的视觉风格调整。
- 不做移动端布局。
- 不启动本地 Fusion dev server 验证。
- 不顺手修复与拆分无关的历史 lint warning。

## 拆分边界

### `useAssistantMessageViewModel`

文件：`src/components/chat/useAssistantMessageViewModel.ts`

职责：

- 根据 message、stream 状态、currentRun、suggested questions 状态派生 assistant 渲染数据。
- 返回 `blocksToRender`、`activity`、`searchSources`、`answerEvidence`、`displayText`、`displayThinking`、`hasThinking`、`suppressThinking`、`isCurrentlyStreaming`。
- 只读 Redux，不写 Redux、不写数据库、不发请求。

### `useMessageCopy`

文件：`src/components/chat/useMessageCopy.ts`

职责：

- 封装复制正文、fallback textarea 复制、复制成功 2 秒状态、失败 toast、timer cleanup。
- 不关心消息角色和 UI。

### `MessageActions`

文件：`src/components/chat/MessageActions.tsx`

职责：

- 统一渲染 hover 操作栏。
- 支持 assistant：时间、复制、重新生成。
- 支持 user：时间、编辑、重新发送。
- 自己格式化 timestamp。
- 不读取 Redux、不写数据库。

### `UserMessage`

文件：`src/components/chat/UserMessage.tsx`

职责：

- 渲染用户消息气泡。
- 渲染用户文件 blocks，包括图片点击触发 `onViewImage`。
- 管理编辑态 UI 的输入、Esc 取消、Ctrl+Enter 保存。
- 渲染用户发送失败提示。
- 使用 `MessageActions` 渲染编辑/重新发送操作。
- 不读取 Redux、不写数据库。

### `AssistantMessage`

文件：`src/components/chat/AssistantMessage.tsx`

职责：

- 渲染 assistant 模型头。
- 调用 `AssistantResponseStack`。
- 渲染 assistant 操作栏。
- 渲染旧 `files` prop 文件卡片。
- 渲染推荐问题。
- 管理资料侧栏打开、关闭、引用高亮状态。
- 使用 `useAssistantMessageViewModel` 和 `useMessageCopy`。

### `ChatMessage`

保留职责：

- 角色分发：user 走 `UserMessage`，assistant 走 `AssistantMessage`。
- 共享外层布局。
- `chatStore.upsertMessage` 同步副作用。
- reasoning 自动折叠副作用。
- 图片查看器状态。

## 行为保持

C 阶段后这些行为必须保持：

- assistant 复制成功后图标短暂切换，2 秒后恢复。
- assistant 复制失败时 toast 提示。
- 用户消息可以编辑，Esc 取消，Ctrl+Enter 保存。
- 用户失败消息显示“发送失败，请重新发送”。
- 用户图片点击打开 `ImageViewer`。
- assistant 搜索和 URL 读取仍通过 `AnswerEvidence` 展示。
- Markdown 引用按钮仍打开 `SourcesSidebar` 并高亮对应来源。
- 推荐问题只在最后一条非流式 assistant 消息显示。
- reasoning streaming 和自动折叠行为不变。
- 运行中的真实工具状态不被 thinking 文本误判。

## 验收标准

- `ChatMessage.tsx` 不再直接包含 user edit form、assistant response stack props 拼装、操作栏按钮细节。
- `ChatMessage.tsx` 行数明显下降，主要做角色分发和共享副作用。
- 新文件职责单一，能通过单元测试验证。
- 既有 `ChatMessage.test.tsx` 继续通过，并补充拆分组件测试。
- `npm test`、`npm run build`、改动文件 eslint 通过；允许既有 warning，但不允许 error。
- 推送后 GitHub Actions 成功，dev server 部署成功。

## 测试策略

- `useMessageCopy.test.tsx` 覆盖 clipboard、fallback、失败 toast、timer reset。
- `MessageActions.test.tsx` 覆盖 assistant/user 操作按钮和 timestamp。
- `UserMessage.test.tsx` 覆盖普通文本、失败提示、编辑保存/取消、图片点击。
- `useAssistantMessageViewModel.test.tsx` 覆盖历史消息、streaming 消息、run 归属过滤、搜索来源派生。
- `AssistantMessage.test.tsx` 覆盖模型头、response stack、资料侧栏、推荐问题。
- `ChatMessage.test.tsx` 保留当前回归，确保拆分后整体行为不变。
