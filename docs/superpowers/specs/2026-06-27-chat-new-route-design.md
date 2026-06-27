# `/chat/new` 新建对话路由设计

## 背景

当前新建对话使用 `/?new=true&model=<modelId>` 表达一次性 UI 命令。这个 URL 在冷启动直达时会被首屏 hydrate 重复消费，触发 `HomeChatSurface` 内部 `setInputKey(Date.now())` 的更新循环，表现为 React #185。更深层的问题是 URL 同时承载了资源位置、过渡态和输入框重置命令，导致点击进入和直接打开同一 URL 的行为不一致。

本设计将新建对话升级为正式路由 `/chat/new`，移除 `new=true` 命令式 query，让 URL 只表达可刷新、可分享、可恢复的产品状态。

## 目标

- `/chat/new` 是正式的新建对话页面，刷新或直接打开都稳定显示空 composer。
- `/chat/:conversationId` 只表示服务端真实会话，不再把本地 draft id 暴露到 URL。
- `?model=<modelId>` 只作为新建页的初始模型 hint，不承担重置输入框或创建对话的命令语义。
- 新建对话发送第一条消息时，页面先停留在 `/chat/new` 展示 pending/streaming 状态，收到服务端真实 `conversationId` 后 `replace` 到 `/chat/:conversationId`。
- 移除所有 `new=true` 生产路径，旧 URL 只做兼容跳转，不再被组件业务逻辑消费。

## 非目标

- 不实现离线草稿 URL，如 `/chat/draft/:clientId`。
- 不改后端会话创建协议。
- 不重构整个聊天状态层，只收敛路由和新建页过渡边界。
- 不改变历史会话列表、搜索、重命名、删除等侧边栏能力。

## URL 状态机

| URL | 产品含义 | 可刷新 | 可分享 | 数据源 |
| --- | --- | --- | --- | --- |
| `/chat/new` | 新建对话 composer | 是 | 是 | 客户端空状态 + 当前模型选择 |
| `/chat/new?model=<modelId>` | 使用指定模型 hint 的新建 composer | 是 | 是 | query hint + Redux 模型列表 |
| `/chat/:conversationId` | 服务端真实会话 | 是 | 是 | 后端会话 API + Redux 缓存 |
| `/` | 入口别名 | 是 | 是 | 跳转或渲染 `/chat/new` |
| `/?new=true&model=<modelId>` | 旧入口兼容 | 是 | 不推荐 | 跳转到 `/chat/new?model=<modelId>` |

状态边界：

- URL 只表达页面资源，不表达“重置输入框”“聚焦输入框”“强制新建”等一次性动作。
- 输入框重置、聚焦、pending 状态属于组件状态或 Redux 状态，不写入 URL。
- 只有服务端真实会话 id 可以出现在 `/chat/:conversationId`。

## 导航行为

### 侧边栏点击“新对话”

1. 读取当前可用模型，得到默认模型 id。
2. 导航到 `/chat/new?model=<defaultModelId>`，或没有模型时导航到 `/chat/new`。
3. 侧边栏 active 状态由 pathname 判断：`/chat/new` 视为新对话 active。
4. 不再维护 `AppLayout.showNewChatSurface` 作为临时覆盖层；路由本身决定主区域渲染新建页。

### 首页/新建页点击“新对话”

如果已经在 `/chat/new`：

- 清空 composer 本地输入和附件。
- 保持 URL 不变。
- 不通过 query 参数触发 remount。

如果在 `/chat/:conversationId`：

- 行为同侧边栏，导航到 `/chat/new?...`。

### 旧 URL 兼容

访问 `/?new=true&model=deepseek-chat` 时，入口页只做一次规范化：

- `replace('/chat/new?model=deepseek-chat')`
- 不渲染或消费 `new=true`
- 不触发输入框 reset side effect

访问 `/` 时执行 `replace('/chat/new')`。`/` 只保留为入口别名，不再承载新建页业务逻辑。

## 发送过渡

新建页发送第一条消息：

1. `NewChatPage` 调用 `useSendMessage`，传入 `conversationId: null` 和 `isDraft: true`。
2. `useSendMessage` 仍可创建本地 pending conversation，用于 Redux 中承载用户消息、assistant placeholder 和 stream state。
3. `onDraftCreated` 不再 `router.replace('/chat/<draftId>')`。新建页继续显示 pending/streaming 内容。
4. 收到后端真实 `conversationId` 后，`onMaterialized` 执行 `router.replace('/chat/<serverConversationId>')`。
5. `materializeConversation` 继续负责把 Redux 中 pending id 合并到 server id。
6. 如果发送失败且后端没有 materialize，页面停留 `/chat/new`，显示错误并保留输入可重试；不产生无效 `/chat/:draftId` URL。

历史会话页发送后续消息：

- 仍在 `/chat/:conversationId` 内流式更新。
- 不受 `/chat/new` 路由变化影响。

## 模型选择优先级

新建页初始模型选择按以下顺序：

1. `/chat/new?model=<modelId>` 中的 model hint，前提是模型存在且 enabled。
2. `models.selectedModelId`，前提是模型存在且 enabled。
3. 第一个 enabled 模型。

规则：

- `model` query 只在新建页初始化或 URL 变化时同步到选中模型，不重复覆盖用户在页面内手动选择的模型。
- 无效或 disabled 的 query model 不报错，静默回退到当前可用模型；如果存在 fallback 模型，`replace('/chat/new?model=<fallbackId>')` 规范化 URL，否则 `replace('/chat/new')` 移除无效 query。
- 发送消息时以后端实际使用的 `enabledModel.id` 为准，避免 URL、Redux 和发送模型分裂。

## 组件边界

- `src/app/(app)/chat/new/page.tsx`：新建对话路由入口，装配 `HomeChatSurface` 或新的 `NewChatPage`。
- `HomeChatSurface`：只负责新建页展示、示例问题、composer 和发送回调；不直接消费 `new=true`。
- `AppLayout`：只负责持久侧边栏和主布局；不再用 `showNewChatSurface` 覆盖 children。
- `ChatSidebar`：通过 pathname 判断 `/chat/new` 和 `/` 的 active 状态。
- `useSendMessage`：保留 draft -> materialized 的数据迁移，但 draft id 不再进入 URL。

## 错误处理

- `/chat/new` 未登录：沿用现有全局登录弹窗/静默 SSO 行为。
- `/chat/new` 无可用模型：composer 禁用或展示现有全局错误，不跳转到历史会话。
- `/chat/:conversationId` 不存在：沿用当前错误页和“返回首页”，但按钮应回到 `/chat/new`。
- 旧 `/?new=true` URL：兼容跳转失败时仍可显示 `/chat/new` 空状态，不能崩溃。

## 回归测试点

Vitest：

- 直达 `/chat/new?model=model-1` 渲染新建 composer，不触发无限更新。
- 直达 `/?new=true&model=model-1` 会 `replace('/chat/new?model=model-1')`，不消费 `new=true`。
- 侧边栏点击“新对话”导航到 `/chat/new?model=<default>`。
- `HomeChatSurface` 发送第一条消息时，`onDraftCreated` 不改 URL，`onMaterialized` 才 replace 到 `/chat/<serverId>`。
- `/chat/:id` 页面错误状态的“返回首页”跳到 `/chat/new`。
- query model 无效时回退到 enabled 模型。

真实 Chrome：

- 已登录状态打开 `https://fusion.seanfield.org/chat/new?model=deepseek-chat`，页面无 React #185，控制台无新增 error。
- 在 `/chat/new` 发送普通消息，流式完成后 URL replace 到 `/chat/<serverId>`。
- 从历史会话点击侧边栏“新对话”，立即显示空 composer，旧正文不闪现。

## 验收标准

- 生产代码中不再出现 `new=true` 作为业务状态消费。
- 新建对话不再把本地 draft id 写入 URL。
- `/chat/new`、`/chat/new?model=...`、`/chat/:id` 三类 URL 都可直接打开并保持语义一致。
- 相关 Vitest、`npm run build`、dev 部署和真实 Chrome 回归通过。
