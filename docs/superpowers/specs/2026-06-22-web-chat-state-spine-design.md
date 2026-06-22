# Fusion Web 聊天状态主线设计

## 背景

Fusion Web 端聊天页已经具备推理展示、联网搜索、URL 读取、Agent 步骤、搜索来源、推荐问题、文件上传和流式恢复等能力。当前主要问题不是缺功能，而是这些状态在同一条 assistant 消息里同时出现时，用户需要自己判断 AI 到底处于什么阶段。

这份设计只定义 Web 浏览器端聊天主流程的状态主线。它不处理移动端布局，不处理 Electron 桌面壳，不重写底层 SSE、Redux、Redis Stream 或文件上传链路。

## 目标

让用户在每一轮对话里清楚看到一条主线：

`等待响应 → 思考中 → 工具活动 → 正文输出 → 完成态 → 推荐问题`

其中工具活动包括真实的 `web_search`、`url_read` 和其他 Agent tool call。前端不得从 thinking 文本里推断是否联网，也不得把模型口头提到“搜索”当作真实搜索。

## 非目标

- 不做整体视觉改版。
- 不考虑移动端断点和触摸布局。
- 不考虑 Electron 窗口、菜单、托盘或桌面特性。
- 不改 `fetchWithAuth`、SSE 协议、Redux store shape、Dexie schema。
- 不重写文件上传、图片 vision、URL read、联网搜索的业务逻辑。
- 不新增点赞、反馈、会话评分等新功能。
- 不把历史消息反推成完整 Agent timeline；历史消息只展示已有 content block 和来源信息。

## 当前问题

### 1. 状态语义混在一起

`ReasoningContent`、`ThinkingIndicator`、`SearchStatus`、`UrlReadStatus`、`AgentRunTimeline`、`SourcesPanel` 和 `SuggestedQuestions` 都能表达“AI 正在做事”或“本轮已经完成”。它们现在是按组件局部条件渲染，而不是按同一条状态主线排序。

### 2. 搜索状态需要只绑定真实工具调用

后端已经通过真实 tool call 和 content block 记录搜索。前端状态应只来自这些结构化信号：

- 流式阶段：`currentRun.steps[].toolCalls[].toolName === "web_search"`。
- 历史阶段：assistant message content 里的 `search` block。

thinking 文本、Markdown 正文、模型自述都不能触发搜索 UI。

### 3. Agent timeline 现在容易抢主状态

Agent timeline 对调试和可解释性有价值，但对普通用户来说是二级信息。它应该辅助说明“刚才发生了哪些工具步骤”，不能在视觉上压过当前回答正文和主状态。

### 4. 推荐问题属于完成态

推荐问题不是独立模块，它是回答完成后的下一步引导。它应在本轮回答确定完成后出现；加载中、刷新中、点击发送中都要表达为完成态后的附属状态。

## 设计原则

### 原则 1：结构化事件优先

所有主状态都从结构化数据推导：

- `stream.currentRun`
- stream content blocks
- assistant message content blocks
- stream status
- suggested question loading state

不得从自然语言文本里解析状态。

### 原则 2：一条主状态，多个辅助细节

同一时间只允许一个主状态占据最高视觉层级。其他信息作为辅助细节展示。

例如搜索工具运行时：

- 主状态：正在搜索。
- 辅助信息：搜索 query、Agent step、tool call 详情。
- 暂不展示：泛化的“正在思考下一步”作为同级主状态。

### 原则 3：正文优先

一旦正文开始输出，正文成为主内容。Reasoning、Agent timeline、来源、URL 卡片都应退为上下文信息，不抢占正文阅读路径。

### 原则 4：失败和降级要可见

工具失败、工具降级、搜索无结果、URL 读取失败都不应静默消失。用户至少应看到一条轻量提示，知道回答是否基于完整联网结果。

### 原则 5：不破坏现有链路

第一阶段只调整状态推导和展示层级，不改变发送、重连、停止生成、文件上传和数据落库逻辑。

## 状态模型

### 状态定义

| 状态 | 含义 | 主信号来源 | 主展示 |
|------|------|------------|--------|
| `waiting` | 用户已发送，assistant 尚无可见内容 | stream started，但无 text/thinking/tool running | 轻量等待提示 |
| `reasoning` | 模型正在输出推理内容 | thinking block 正在流式增长 | `ReasoningContent` |
| `tool_running` | 真实工具正在执行 | running tool call | 工具专属状态条 |
| `answering` | 正文正在输出 | text block 正在增长 | Markdown 正文 + 光标 |
| `completed` | 本轮回答已完成 | run completed 或 stream done | 正文 + 完成后辅助信息 |
| `suggesting` | 推荐问题生成中 | suggested questions loading | 完成态下的推荐问题加载提示 |
| `failed` | 本轮生成失败 | run failed 或 stream error | 错误卡片 + 重试入口 |
| `interrupted` | 用户停止或连接中断 | run interrupted / stream cancelled | 中断提示 + 可继续操作 |

### 优先级

当多个信号同时存在时，按以下优先级决定主状态：

1. `failed`
2. `interrupted`
3. `tool_running`
4. `answering`
5. `reasoning`
6. `waiting`
7. `completed`
8. `suggesting`

说明：

- `tool_running` 高于 `reasoning`，因为真实工具活动比模型推理更能解释“为什么现在没正文”。
- `answering` 高于 `reasoning`，因为正文一旦开始输出，阅读路径应转向正文。
- `suggesting` 不覆盖 `completed`，它只是完成态后的附属状态。

## 工具活动展示规则

### web_search

流式阶段，如果当前 step 存在 running 的 `web_search`：

- 主状态显示“正在搜索”。
- 展示搜索 query。
- 如果 Agent timeline 同时存在，该 step 可以作为折叠或低权重详情，不重复显示同一句状态。

完成后，如果 assistant message 含 `search` block：

- 正文上方展示来源摘要，帮助用户先知道回答使用了外部资料。
- 正文下方展示引用入口，显示资料数量并打开详情侧栏。
- 点击引用仍打开 `SourcesSidebar`。

失败或降级时：

- `failed`：显示“搜索失败，本轮回答未使用搜索结果”。
- `degraded`：显示“搜索暂不可用，已基于现有信息回答”。
- 空结果：显示“未找到可用搜索结果，已基于现有信息回答”。

### url_read

流式阶段，如果当前 step 存在 running 的 `url_read`：

- 主状态显示“正在读取网页”。
- 展示目标 URL 的 hostname 或标题占位。

完成后，如果 assistant message 含 `url_read` block：

- 展示 URL 卡片。
- 卡片属于资料上下文，不应比正文更突出。

失败或降级时：

- `failed`：显示“网页读取失败，未使用该页面内容”。
- `degraded`：显示“网页暂时未返回内容，已跳过该页面”。

### 其他工具

其他工具不做专门 UI 时，统一进入 Agent timeline。主状态使用通用文案：

- running：`正在调用工具`
- success：不显示主状态，只在 timeline 里保留摘要
- degraded：显示轻量降级提示
- failed：显示轻量失败提示

## 组件职责

### `ChatMessageList`

职责：

- 维持消息列表、黏底滚动和错误卡片。
- 继续负责推荐问题挂载到最后一条 assistant 消息。

不新增职责：

- 不直接推导 tool 状态。
- 不解析 message content 的具体业务语义。

### `ChatMessage`

职责：

- 针对单条 message 组合状态主线。
- 根据 stream blocks、message content blocks、currentRun 推导当前展示状态。
- 决定 Reasoning、Tool status、Agent timeline、Markdown、Sources、SuggestedQuestions 的顺序。

建议拆出纯函数或轻量 helper：

```ts
type AssistantActivityKind =
  | "waiting"
  | "reasoning"
  | "tool_running"
  | "answering"
  | "completed"
  | "suggesting"
  | "failed"
  | "interrupted";
```

该 helper 只接收结构化状态，不读取 DOM，不发请求，不写 Redux。

### `ReasoningContent`

职责：

- 只表达模型推理。
- 不承担搜索、URL 读取或工具调用解释。

规则：

- 工具运行期间，Reasoning 不作为主状态；如果已有 reasoning 内容，默认保留折叠入口，不展开抢占工具状态。
- 正文开始输出后，Reasoning 保持可展开，但不作为主状态。

### `AgentRunTimeline`

职责：

- 表达 Agent 过程详情。
- 对 failed、interrupted、limit_reached 保留可见提示。

规则：

- 普通 running 工具状态由主状态条表达时，timeline 不重复抢占视觉焦点。
- completed 且无异常的普通步骤默认低权重展示。

### `SourcesPanel` 和 `SourcesSidebar`

职责：

- 只展示真实搜索来源。
- 只在存在 `search` block 或 stream search sources 时出现。

规则：

- 不因为 thinking 或正文提到“搜索”而显示。
- 搜索失败或降级时显示状态提示，不显示空 sources 面板。

### `SuggestedQuestions`

职责：

- 作为回答完成后的继续提问引导。

规则：

- 只在最后一条 assistant 消息完成后出现。
- loading 显示为“正在生成可继续追问的问题”。
- 点击某个问题后，该问题进入“发送中”状态，避免用户重复点击。
- 如果推荐问题为空或被过滤为空，区域整体隐藏，不显示空容器。

## 页面层边界

`src/app/(app)/chat/[chatId]/page.tsx` 当前较厚。状态主线第一阶段不强制拆页，但实现计划应避免继续往 page 增加 UI 判断。

后续实现时，新增状态推导逻辑应放在组件或 hook 中，例如：

- `src/components/chat/assistantActivity.ts`
- 或 `src/hooks/useAssistantActivity.ts`

具体放置在 implementation plan 中决定，但必须遵守现有架构规则：

- 页面只做编排。
- 组件不直接 fetch。
- 后端请求继续走 `src/lib/api/`。
- Redux slice 不交叉 import。

## 展示顺序

一条 assistant 消息内部建议顺序：

1. AI 消息头部：模型 / provider。
2. 当前主状态：等待、思考、搜索、读 URL、工具调用、失败或中断。
3. Agent timeline：过程详情，低于主状态。
4. 资料上下文：URL 卡片、搜索来源摘要。
5. 正文 Markdown。
6. 引用入口：资料数量和侧栏入口。
7. 消息操作栏：复制、重新生成、时间。
8. 推荐问题：完成态后的下一步。

例外：

- 正文正在流式输出时，Markdown 可以和当前主状态并存，但正文仍是阅读主体。
- 失败态没有正文时，错误卡片替代正文位置。

## 可观测性和调试

前端不新增日志上报要求。后端已有 `AGENT_ROUND_SUMMARY` 可用于区分：

- reasoning 里提到搜索但没有 tool call。
- 真实发生了 `web_search`。
- 工具调用数量和 finish reason。

前端调试时应优先看 Redux stream 状态和 content blocks，而不是用户可见文本。

## 验收标准

### 场景 1：只思考，不搜索

用户使用支持 thinking 的模型提问。模型输出 thinking，但没有 `web_search` tool call。

期望：

- 显示思考状态。
- 不显示搜索中。
- 不显示搜索来源。
- 如果正文提到“搜索”但没有真实 tool call，前端仍不显示搜索 UI。

### 场景 2：真实联网搜索

模型实际发起 `web_search`。

期望：

- 工具 running 时显示“正在搜索”。
- 搜索完成后显示来源摘要和引用入口。
- Agent timeline 可查看工具过程，但不压过正文。

### 场景 3：URL 读取

用户输入 URL 或模型调用 `url_read`。

期望：

- 读取中显示“正在读取网页”。
- 成功后显示 URL 卡片。
- 失败或降级时显示轻量提示，不阻断正文阅读。

### 场景 4：搜索降级

`web_search` 返回 degraded 或失败。

期望：

- 用户能看到搜索未成功或已降级。
- 正文仍可正常显示。
- 不显示空 sources 面板。

### 场景 5：推荐问题

回答完成后触发推荐问题生成。

期望：

- 回答完成后才出现推荐问题区域。
- loading 时显示推荐问题生成中。
- 点击推荐问题后显示发送中。
- 空结果不占位。

## 测试策略

### 单元测试

优先测试状态推导 helper：

- thinking-only 不触发 search。
- running `web_search` 得到 `tool_running` + search metadata。
- running `url_read` 得到 `tool_running` + url metadata。
- text block 增长时得到 `answering`。
- failed/interrupted 覆盖其他状态。
- completed + suggested loading 保持 completed 主态，并带 suggesting 附属态。

### 组件测试

覆盖 `ChatMessage` 和 `SuggestedQuestions`：

- 没有真实 search block 时不渲染 Sources。
- 有 search block 时渲染 Sources 和引用入口。
- degraded 工具显示降级提示。
- 推荐问题点击后进入 pending 文案。

### 手动验证

Web 端浏览器验证以下路径：

- 普通文本问答。
- thinking 模型问答。
- 需要联网搜索的问题。
- 包含 URL 的问题。
- 搜索失败或 URL 读取降级时的显示。
- 回答完成后推荐问题生成和点击发送。

不要求移动端和 Electron 验证。

## 实施分期

### Phase 1：状态推导

新增纯状态推导层，先通过测试固定语义。该阶段不改视觉。

### Phase 2：ChatMessage 顺序收敛

按状态主线重排 `ChatMessage` 内部渲染顺序，降低 Agent timeline 的默认视觉权重，确保真实工具活动优先于泛化 thinking。

### Phase 3：搜索和 URL 降级提示

为 `web_search` 和 `url_read` 的失败、降级、空结果补轻量提示。

### Phase 4：推荐问题完成态联动

把推荐问题明确放到完成态后，强化 loading、refreshing、sending 状态。

### Phase 5：Web 端验收

跑测试和 Web 浏览器手动验证。若发现 scroll-stick 抖动，优先修滚动黏底，不扩大到移动端布局。

## 风险

- `ChatMessage` 当前承担多种职责，直接改渲染顺序可能影响流式显示。
- `AgentRunTimeline` 和旧的 `SearchStatus` / `UrlReadStatus` 可能出现重复状态，需要明确谁是主状态。
- Reasoning 展开高度会影响 scroll-stick，需要回归流式黏底。
- 推荐问题与 stream completion 的时间关系需要保持现有 `shouldAutoFetchSuggestedQuestions` 逻辑，不应提前触发。

## 最终交付

第一版实现完成后，Web 端聊天页应达到：

- 用户能区分思考、搜索、读 URL、工具调用和正文输出。
- 搜索 UI 只来自真实 `web_search`。
- URL UI 只来自真实 `url_read` 或 URL block。
- Agent timeline 成为详情而不是主状态。
- 推荐问题成为完成态后的自然下一步。
- 现有发送、停止、重连、文件上传路径不回归。
