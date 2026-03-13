# Chat UI Data Flow

这份文档只描述当前 `Fusion UI` 的聊天主产品数据流，不覆盖已经退出主产品面的搜索增强、RSS、热点、摘要等能力。

## Runtime Surface

前端当前主产品范围集中在四条线：

- `auth`
- `chat`
- `files`
- `models`

当前入口层主要是：

- [`src/app/layout.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/layout.tsx)
- [`src/app/ClientLayout.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/ClientLayout.tsx)
- [`src/redux/providers.tsx`](/Users/sean/code/fusion/fusion-ui/src/redux/providers.tsx)

## App Initialization

启动阶段有两条初始化主线：

1. Redux store 初始化  
   入口在 [`src/redux/providers.tsx`](/Users/sean/code/fusion/fusion-ui/src/redux/providers.tsx)

2. 模型和认证初始化  
   入口在 [`src/app/ClientLayout.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/ClientLayout.tsx)

当前启动顺序可以概括成：

1. `Providers` 先恢复本地设置
2. 不再把 IndexedDB 聊天记录回灌为产品真源
3. `ClientLayout` 拉后端模型列表
4. `ClientLayout` 检查 token / 用户状态
5. 未登录时按当前策略弹登录框

IndexedDB 初始化逻辑在：

- [`src/lib/db/initializeStore.ts`](/Users/sean/code/fusion/fusion-ui/src/lib/db/initializeStore.ts)

当前结论：

- 服务端是聊天和模型的真源
- IndexedDB 只是缓存和设置存储

## Auth Flow

登录回调页在：

- [`src/app/auth/callback/page.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/auth/callback/page.tsx)

认证主线是：

1. 用户触发 OAuth 登录
2. 后端完成 provider callback
3. 后端重定向到前端 `/auth/callback?token=...`
4. 前端读取 `token`
5. Redux `authSlice` 保存 token
6. 前端请求 `/api/auth/me`
7. 用户状态进入已登录

这条链路的前端关键状态在：

- `authSlice`

## Chat Page Flow

聊天相关页面主要是：

- [`src/app/page.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/page.tsx)
- [`src/app/chat/[chatId]/page.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/chat/[chatId]/page.tsx)

主编排 hook 在：

- [`src/hooks/useChatActions.ts`](/Users/sean/code/fusion/fusion-ui/src/hooks/useChatActions.ts)

聊天主线可以概括成：

1. 用户输入消息
2. `useChatActions.sendMessage(...)` 决定复用空会话还是创建新会话
3. 用户消息先写进 Redux
4. 前端调用 `/api/chat/send` 的 SSE 流
5. 流式事件被解析成：
   - `reasoning_*`
   - `answering_*`
   - `done`
   - `error`
6. Redux 中的当前流式消息持续更新
7. 流结束后补做：
   - 标题生成
   - 推荐问题
   - 会话列表刷新

SSE 客户端在：

- [`src/lib/api/chat.ts`](/Users/sean/code/fusion/fusion-ui/src/lib/api/chat.ts)

## Chat State Flow

聊天全局状态仍然集中在：

- [`src/redux/slices/chatSlice.ts`](/Users/sean/code/fusion/fusion-ui/src/redux/slices/chatSlice.ts)

当前它主要承载：

- 当前会话 ID
- 会话列表
- 消息列表
- 流式消息状态
- 推理阶段显示状态
- 错误状态

和重构前相比，已经去掉了：

- search/context enhancement 相关状态
- web search UI 状态
- function call 面板状态

## Server-First Conversation Flow

当前会话数据流已经明确偏向 server-first：

1. 页面进入时优先从服务端拉会话
2. 历史消息按服务端结果重建
3. 本地 DB 不再在启动时回灌聊天历史
4. 本地缓存只承担：
   - 设置
   - 少量聊天缓存辅助

相关位置：

- [`src/hooks/useChatListManager.ts`](/Users/sean/code/fusion/fusion-ui/src/hooks/useChatListManager.ts)
- [`src/hooks/useSidebarChatActions.ts`](/Users/sean/code/fusion/fusion-ui/src/hooks/useSidebarChatActions.ts)
- [`src/lib/db/chatStore.ts`](/Users/sean/code/fusion/fusion-ui/src/lib/db/chatStore.ts)

## File Flow

文件前端链路主要在：

- [`src/lib/api/files.ts`](/Users/sean/code/fusion/fusion-ui/src/lib/api/files.ts)
- [`src/components/chat/ChatInput.tsx`](/Users/sean/code/fusion/fusion-ui/src/components/chat/ChatInput.tsx)

当前主线是：

1. 用户在输入区选择文件
2. 前端走鉴权请求上传文件
3. 后端返回 `file_ids`
4. 后续聊天请求把 `file_ids` 一并带上
5. 服务端按 `file_ids` 注入已解析文件内容

当前文件 API 已统一走：

- [`src/lib/api/fetchWithAuth.ts`](/Users/sean/code/fusion/fusion-ui/src/lib/api/fetchWithAuth.ts)

## Model Flow

模型设置和模型列表已经回到后端真源：

- [`src/components/models/ModelSettings.tsx`](/Users/sean/code/fusion/fusion-ui/src/components/models/ModelSettings.tsx)
- [`src/redux/slices/modelsSlice.ts`](/Users/sean/code/fusion/fusion-ui/src/redux/slices/modelsSlice.ts)
- [`src/lib/config/modelConfig.ts`](/Users/sean/code/fusion/fusion-ui/src/lib/config/modelConfig.ts)

当前主线是：

1. 前端启动时拉 `/api/models`
2. Redux 存当前模型列表
3. 模型开关、凭证保存、凭证测试、添加模型都直接打后端
4. 前端不再把静态模型配置当成产品真源

## Deferred Capability Boundary

以下能力现在不属于当前默认产品面：

- `search`
- `context enhancement`
- `RSS / hot topics / digests`

`web search / function call` 的状态是：

- 后端边缘能力仍保留
- 前端主产品面不默认暴露
- 后续如果恢复，应该以轻量联网增强方式回来，而不是恢复旧的复杂 UI

## Reading Order For New Engineers

如果只给 10 分钟，按这个顺序读：

1. [`src/redux/providers.tsx`](/Users/sean/code/fusion/fusion-ui/src/redux/providers.tsx)
2. [`src/app/ClientLayout.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/ClientLayout.tsx)
3. [`src/app/page.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/page.tsx)
4. [`src/app/chat/[chatId]/page.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/chat/[chatId]/page.tsx)
5. [`src/hooks/useChatActions.ts`](/Users/sean/code/fusion/fusion-ui/src/hooks/useChatActions.ts)
6. [`src/lib/api/chat.ts`](/Users/sean/code/fusion/fusion-ui/src/lib/api/chat.ts)
7. [`src/components/models/ModelSettings.tsx`](/Users/sean/code/fusion/fusion-ui/src/components/models/ModelSettings.tsx)
8. [`src/app/auth/callback/page.tsx`](/Users/sean/code/fusion/fusion-ui/src/app/auth/callback/page.tsx)

读完这几处，应该能讲清当前前端聊天主产品的数据流。
