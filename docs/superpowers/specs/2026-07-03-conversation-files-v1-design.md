# 会话资料/文件体验 v1 设计

## 背景

Fusion 已有文件上传、文件解析、对话文件关联和消息附件展示能力，但当前产品体验仍停留在“本次消息上传附件”。用户上传过的资料不会成为会话里的可见资料资产，后续提问不能直接复用同一会话内已处理完成的文件，刷新历史页后的附件元数据也不够完整。

这导致两个问题：

1. 用户在长会话中无法确认当前会话已经有哪些资料。
2. 用户想围绕同一份资料继续追问时，需要重新上传或依赖历史消息上下文。

v1 目标是把“同一会话内已上传文件”升级为可查看、可管理、可复用的会话资料，不扩展为跨会话知识库。

## 目标

1. 在会话页提供轻量资料入口，展示当前会话关联的全部文件。
2. 文件列表展示文件名、类型、大小、处理状态；图片展示缩略图。
3. 已处理完成的资料可以加入本次提问，发送时复用原 `file_id`，不重新上传。
4. 上传中、解析中、解析失败的资料有明确状态，未处理完成的资料不能被加入本次提问。
5. 用户可以删除会话资料；删除后释放当前会话文件配额，且不能再被复用。
6. 刷新历史会话后，用户消息中的文件附件仍能保留缩略图、尺寸和文件类型等必要元数据。
7. 后端发送消息时校验每个 `file_id` 属于当前用户且属于当前会话，拒绝跨用户或跨会话文件绑定。

## 非目标

- 不做跨会话文件库。
- 不做项目空间。
- 不做知识库索引、embedding、召回排序或长期记忆。
- 不改变当前 Redis Stream 两段式聊天流。
- 不提高当前每会话 5 个文件的配额。
- 不把 Dexie 作为文件资料的 source of truth；服务端仍是权威数据源。

## 现有能力

后端已有：

- `POST /api/files/upload`：上传文件并绑定到 `conversation_id`。
- `GET /api/files/conversation/{conversation_id}`：读取对话关联文件。
- `GET /api/files/{file_id}/url`：获取缩略图或处理后文件访问 URL。
- `GET /api/files/{file_id}/status`：读取处理状态。
- `DELETE /api/files/{file_id}`：删除文件。
- `conversation_files`：现有对话和文件关联表。

前端已有：

- `src/lib/api/files.ts` 中的上传、删除、状态、对话文件列表和文件 URL API client。
- `ChatInput` 中的本地上传附件状态。
- `useSendMessage` 中基于 attachments 发送 `file_ids`。
- `UserMessage` / `AuthImage` / `ImageViewer` 中的消息附件展示和图片预览。

## 产品体验

会话页在会话标题右侧增加一个“资料”入口。点击后打开右侧轻量抽屉，展示当前会话资料。窄屏下同一组件以覆盖式抽屉呈现。

资料列表行为：

- 图片资料展示缩略图、文件名、大小、状态。
- 文档资料展示文件类型图标、文件名、大小、状态。
- `processed` 文件显示“加入本次提问”和“删除”操作。
- `parsing` / `uploading` 文件显示处理中状态，不允许加入本次提问。
- `error` 文件显示失败状态和删除操作。
- 空状态只显示简短提示，不做营销式说明。

composer 行为：

- 当前上传的本地文件和从资料面板加入的既有文件都显示在同一个附件区。
- 本地上传文件保持现有上传、轮询、失败、重试、删除逻辑。
- 既有资料不重新上传；发送时只把对应 `file_id` 加入 `file_ids`。
- 用户从 composer 移除既有资料时，只从本次提问移除，不删除后端文件。
- 用户从资料面板删除文件时，删除后端文件，并从当前 composer 里同步移除该文件。

历史消息行为：

- 用户消息中的 file block 继续作为消息内容的一部分渲染。
- 刷新历史页后，图片附件仍能显示缩略图并打开大图。
- 非图片附件保留文件名、类型和稳定卡片展示。

## 后端设计

v1 不新增表。

### 文件摘要

对话文件列表沿用 `GET /api/files/conversation/{conversation_id}`，增强序列化字段：

- `id`
- `filename`
- `mimetype`
- `size`
- `status`
- `thumbnail_url`
- `width`
- `height`
- `created_at`
- `error_message`

`thumbnail_url` 对图片文件直接返回可访问缩略图 URL。本地存储模式继续使用签名代理 URL；MinIO 模式继续使用 presigned URL。非图片文件或没有缩略图的文件返回 `null`。`error_message` 从处理失败结果中提取用户可读摘要；没有错误时返回 `null`。

### 发送消息校验

聊天发送链路接收 `file_ids` 时必须逐个校验：

1. 文件存在。
2. 文件 `user_id` 等于当前用户。
3. 文件已经关联到当前 `conversation_id`。
4. 非图片文件必须处于 `processed` 才能用于本次提问。
5. 图片文件必须有可读的原图或处理图记录。

任一校验失败时，聊天请求返回明确错误，不创建引用非法文件的用户消息，不启动 LLM 生成。

### 文件内容注入

非图片文件仍沿用现有 `parsed_content` 注入逻辑。v1 只保证“同会话复用”走同一条 `file_ids` 路径，不引入新的检索或摘要拼接机制。

### 删除行为

删除文件继续使用 `DELETE /api/files/{file_id}`。删除必须验证当前用户权限，并删除存储对象和 DB 记录。删除后，对话文件列表不再返回该文件，聊天发送校验也不得接受该 `file_id`。

## 前端设计

### API 类型

扩展 `FileInfo`，补齐后端摘要字段：

- `created_at`
- `thumbnail_url`
- `width`
- `height`
- `error_message`

保留 `getFileUrl(fileId, variant)` 作为图片 URL 兜底。

### 会话资料数据

新增 `useConversationFiles` hook，职责只包含：

- 根据 `activeChatId` 拉取 `getConversationFiles`。
- 上传完成、删除完成、发送后刷新当前会话资料列表。
- 暴露 `refresh` 给 `ChatInput` 或页面层调用。

资料列表不从 Dexie 推导，不把本地缓存当权威数据。

### 组件边界

建议新增组件：

- `ConversationFilesPanel`：负责资料列表、空状态、删除、加入本次提问。
- `ConversationFileItem`：负责单个资料展示和状态操作。
- `ComposerAttachmentList`：统一渲染本地上传文件和既有资料。

`ChatInput` 当前承担上传、轮询、附件展示和发送组装，v1 可以做有边界的局部拆分，避免继续把资料复用逻辑全部塞进单个组件。

### 附件模型

composer 内部附件状态拆成两类：

```ts
type ComposerAttachment =
  | { source: 'upload'; localId: string; file: File; fileId?: string; status: FileProcessingStatus; previewUrl?: string; thumbnailUrl?: string; errorMessage?: string }
  | { source: 'conversation'; fileId: string; filename: string; mimetype: string; status: 'processed'; thumbnailUrl?: string; width?: number; height?: number };
```

发送消息时，两类附件统一映射为 `FileAttachment[]`：

- `fileId`
- `filename`
- `mimeType`
- `previewUrl`：本地上传文件优先使用本地 `previewUrl`；既有资料使用 `thumbnailUrl` 填充到同一字段，保持 `useSendMessage` 的现有附件协议。

### 历史 hydration

`conversationHydration` 的 `ServerBlock` 和 `buildContentBlocks` 需要保留 file block 的可选字段：

- `thumbnail_url`
- `width`
- `height`

后端如果已经在消息内容中持久化这些字段，刷新后前端必须继续使用；如果旧消息缺少这些字段，`AuthImage` 继续通过 `file_id` 兜底请求缩略图。

## 错误处理

- 获取资料列表失败：面板显示可重试错误，不影响聊天主流程。
- 删除失败：保留列表项，显示 toast。
- 加入资料时文件不再存在：刷新列表并提示文件已失效。
- 发送前发现资料仍在处理中：阻止发送并提示等待处理完成。
- 后端拒绝 `file_id`：前端显示明确错误，不进入流式等待状态。

## 权限和安全

后端是权限边界。前端隐藏按钮不能替代后端校验。

必须覆盖：

- 用户不能复用其他用户的文件。
- 用户不能把同一账号其他会话的文件直接绑定到当前会话。
- 已删除文件不能复用。
- 未处理完成的非图片文件不能复用。

## 测试矩阵

### 后端

- `FileService` 对话文件列表返回状态、尺寸和缩略图相关字段。
- `ChatService` 接收同用户同会话 processed 文件时生成 file block。
- `ChatService` 拒绝其他用户文件。
- `ChatService` 拒绝同用户其他会话文件。
- `ChatService` 拒绝未 processed 的非图片文件。
- 删除文件后，对话文件列表不再返回，发送消息不能再绑定。
- 图片文件继续能进入视觉模型消息构建路径。

### 前端

- `getConversationFiles` 正确解析新增字段。
- `conversationHydration` 保留 file block 的 `thumbnail_url`、`width`、`height`。
- 资料面板展示空状态、processed、parsing、error 三类状态。
- processed 资料可以加入 composer，发送时包含原 `file_id`。
- 从 composer 移除既有资料不调用后端删除。
- 从资料面板删除资料会调用删除接口，并同步移除 composer 中同一资料。
- 上传新文件后资料列表刷新。
- 发送按钮在附件处理中时保持阻止发送。

### 构建和回归

- `fusion-api`：运行相关 pytest，必要时扩大到 `python -m pytest test/`；运行 ruff。
- `fusion-ui`：运行相关 Vitest，必要时扩大到 `npm test`；跨组件或构建边界变化后运行 `npm run build`。
- 不为调查或验收启动本地 Fusion 服务。
- 合并部署后，使用已部署环境和用户已打开且匹配的登录态 Chrome 标签做真实回归；如果没有可复用标签，记录阻塞。

## 验收标准

1. 新会话上传图片后，资料入口能看到该图片资料，并显示缩略图。
2. 刷新会话页后，历史用户消息中的图片附件仍显示缩略图。
3. 用户可以把同一会话中已处理完成的资料加入新提问，并成功发送。
4. 解析中的文档显示处理中，不能加入本次提问。
5. 删除资料后，资料列表和 composer 都不再出现该文件。
6. 构造跨会话或跨用户 `file_id` 请求时，后端拒绝且不创建非法消息。
7. CI/CD 通过后，真实部署环境完成至少一条“上传资料 -> 复用资料 -> 刷新确认”的回归记录。

## 实施顺序

1. 后端先补 failing tests，固定文件绑定权限和状态校验。
2. 后端增强文件摘要字段和必要序列化。
3. 前端补 hydration 和 API 类型测试。
4. 前端实现会话资料 hook 和资料面板。
5. 前端改造 composer 附件模型，支持既有资料复用。
6. 补齐组件交互测试、构建验证和部署回归记录。
