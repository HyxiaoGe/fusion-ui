# 回答依据统一侧栏增强设计

## 背景

联网回答已经完成后端来源口径统一：`SearchBlock` / `UrlBlock` 现在能携带 `status`、`error_message`、`source_count`、`source_refs`。前端也已把这些字段透传到 `AnswerEvidenceModel`，但当前 UI 仍存在信息断层：

- `AnswerEvidence` 只在正文上方展示紧凑预览，适合回答前的轻量提示，不适合解释全部来源。
- `SourcesSidebar` 仍是旧的“搜索来源侧栏”，只接收 `SearchSourceSummary[]`，不能展示 URL 读取结果。
- 搜索失败、URL 读取失败、降级、跳过、中断原因只散落在 Agent 工具过程里，用户无法从“回答依据”入口完整理解这次回答用了哪些材料、哪些材料没用上、为什么没用上。

下一步目标不是新增独立详情页，而是把现有右侧侧栏升级为统一“回答依据”侧栏。

## 目标

- 用户点击 `AnswerEvidence` 的“查看全部”或 Markdown 引用编号时，打开统一“回答依据”侧栏。
- 侧栏能同时展示搜索来源、成功读取网页、失败/降级/中断的搜索或读取目标。
- 侧栏顶部给出本次联网依据摘要：已使用多少条来源、搜索多少条、读取多少页、异常多少个。
- 每条资料显示类型、标题、域名、状态、错误或降级原因、外链入口。
- Markdown 引用编号仍能定位到对应搜索来源并高亮。
- 保持正文区域轻量，不把失败和降级详情塞回正文上方。

## 非目标

- 不改后端协议、SSE、Redis Stream、数据库结构。
- 不改变回答生成、工具调用、搜索或 URL 读取策略。
- 不做移动端布局。
- 不新增复杂筛选、全文搜索、排序、批量复制、导出。
- 不把 Agent Timeline 替换成资料侧栏；过程区仍负责解释“AI 正在做什么”，资料侧栏负责解释“回答依据是什么”。
- 不启动本地 Fusion dev server 验证。

## 推荐方案

升级 `SourcesSidebar` 为 `AnswerEvidenceSidebar`。侧栏继续从 `AssistantMessage` 管理开关和高亮状态，但数据不再只传 `searchSources`，而是传完整的 `answerEvidence`。

### 入口

- `AnswerEvidence` 顶部按钮文案调整为“查看全部依据”。
- 当存在隐藏项、异常项，或用户需要打开完整资料时，按钮可见。
- Markdown 引用点击继续打开侧栏，并滚动高亮对应搜索来源。
- URL 读取卡片点击仍直接打开外链；“查看全部依据”用于看完整列表和状态解释。
- 如果没有可用来源但存在失败/降级/中断目标，正文上方仍显示轻量入口，例如 `回答依据 · 2 个未使用`，点击后打开侧栏查看原因。

### 侧栏结构

侧栏宽度保持桌面端右侧抽屉形态，建议从当前 `400px` 调整为 `440px`，信息更充足但不明显压缩主内容。

侧栏分三块：

1. 顶部摘要
   - 标题：`回答依据`
   - 汇总行：`已使用 X 条 · 搜索 Y 条 · 读取 Z 个网页`
   - 如果存在异常：显示轻量警示 chip，例如 `2 个未使用`

2. 已使用来源
   - 展示 `AnswerEvidenceModel.items` 中成功可用的搜索和 URL 读取来源。
   - 搜索来源使用搜索图标，URL 读取使用地球/链接图标。
   - 每条显示标题、域名、类型标签、外链按钮。
   - 被 Markdown 引用定位的搜索来源高亮，并滚动到中间。

3. 未使用或异常
   - 展示来自 content block 的非成功状态：
     - `search.status === failed/degraded/interrupted`
     - `url_read.status === failed/degraded/interrupted`
     - `source_refs` 中非成功的条目
   - 每条显示目标、类型、状态标签、原因。
   - 原因优先使用 `error_message`，缺失时显示状态兜底文案：
     - `failed`：`未取得可用内容`
     - `degraded`：`部分内容不可用，已降级处理`
     - `interrupted`：`读取已中断`

## 数据模型

在前端新增一个侧栏专用模型，避免 `AnswerEvidenceModel` 承担过多 UI 细节。

文件建议：`src/components/chat/answerEvidenceSidebarModel.ts`

模型职责：

- 输入：
  - `answerEvidence: AnswerEvidenceModel | null`
  - `searchBlock?: SearchBlock | null`
  - `urlBlocks: UrlBlock[]`
- 输出：
  - `summary`: 总数和异常数
  - `usedItems`: 可展示为回答依据的来源
  - `issueItems`: 未使用/异常来源

`usedItems` 直接来自 `AnswerEvidenceModel.items`，不重新推导成功来源，避免和正文引用口径分叉。

`issueItems` 从 blocks/source_refs 派生：

- 如果 block 有 `source_refs`，以 `source_refs` 为准，收集非成功状态项。
- 如果 URL block 没有 `source_refs` 且 block 本身非成功，则用 block 自身构造异常项。
- 如果 search block 非成功且没有可用 `source_refs`，用 query 构造异常项。
- 去重规则：优先按 `url` 去重，其次按 `kind + title` 去重。

## 组件边界

### `AnswerEvidenceSidebar`

替代旧 `SourcesSidebar` 的新组件。

职责：

- 渲染右侧抽屉、遮罩、ESC 关闭。
- 渲染摘要、已使用来源、异常来源。
- 支持 `highlightIndex` / `highlightTick` 滚动并高亮搜索来源。
- 不读取 Redux，不发请求，不修改消息状态。

### `answerEvidenceSidebarModel`

职责：

- 从 `AnswerEvidenceModel`、`SearchBlock`、`UrlBlock[]` 派生侧栏数据。
- 处理状态文案、域名、去重、分组。
- 可用纯单元测试覆盖。

### `AssistantMessage`

职责变化：

- 不再把 `searchSources` 传给旧 `SourcesSidebar`。
- 传 `answerEvidence`、`activity.searchBlock`、`activity.urlBlocks` 给 `AnswerEvidenceSidebar`。
- 当 `answerEvidence` 为空但存在异常来源时，仍必须显示/打开侧栏入口，避免“工具失败了但回答依据区域消失”。

### `AnswerEvidence`

职责变化：

- 文案从“查看全部搜索来源”调整为“查看全部依据”。
- `showOpenAll` 逻辑从“有隐藏搜索来源”扩展为“有隐藏搜索、隐藏 URL、或存在完整侧栏信息”。
- 仍只渲染轻量预览，不承载错误详情。
- 支持 `answerEvidence === null` 但侧栏模型存在异常项的状态，显示紧凑异常入口，不渲染成功来源卡片。

## 视觉与交互

- 保持现有朴素、低干扰风格：细边框、8px 以下圆角、无大面积装饰背景。
- 状态颜色沿用现有 token：
  - success / 已使用：普通 foreground / muted。
  - degraded / partial：`text-warn`。
  - failed：`text-danger`。
  - interrupted：`text-muted-foreground`。
- 列表项保持稳定高度区间，标题最多两行，域名单行截断。
- 外链使用 `ExternalLink` 图标按钮；搜索来源项点击主体可只做高亮，不强制打开外链，避免和引用定位冲突。
- 空状态：
  - 无来源且无异常时不渲染侧栏。
  - 有异常无可用来源时显示“没有可用回答依据”，并展示异常列表。

## 可访问性

- 侧栏关闭按钮有 `aria-label="关闭回答依据"`。
- 外链按钮有 `aria-label="打开来源：{title}"`。
- 状态标签不只依赖颜色，必须有文本。
- ESC 可关闭侧栏，点击遮罩可关闭侧栏。
- 引用跳转高亮不改变键盘焦点，避免打断正文阅读。

## 测试策略

- `answerEvidenceSidebarModel.test.ts`
  - 成功搜索和成功 URL 读取进入 `usedItems`。
  - failed/degraded/interrupted 的 `url_read` 进入 `issueItems`。
  - `source_refs` 非成功项进入 `issueItems`，成功项不重复进入异常。
  - block 与 source_refs 重复时按 URL 去重。
  - 无可用来源但有异常时仍返回可渲染模型。

- `AnswerEvidenceSidebar.test.tsx`
  - 渲染摘要、已使用来源、异常来源。
  - 点击关闭按钮触发 `onClose`。
  - 传入 `highlightIndex` 时高亮对应搜索来源。
  - 外链具备正确 href 和 aria-label。

- `AnswerEvidence.test.tsx`
  - “查看全部依据”按钮在存在隐藏搜索、隐藏 URL 或可打开侧栏信息时显示。
  - 点击按钮调用 `onOpenSources`。

- `AssistantMessage.test.tsx`
  - 点击 Markdown 引用打开统一侧栏并高亮来源。
  - 点击“查看全部依据”打开统一侧栏。
  - 有 URL 读取来源时侧栏也能展示，不再只依赖搜索来源。

## 验收标准

- 用户能从一个入口看到搜索来源和 URL 读取来源。
- 用户能在同一个侧栏看到失败、降级、中断的目标和原因。
- 没有成功来源但存在失败/降级/中断时，用户仍能从回答依据入口打开侧栏查看原因。
- Markdown 引用编号仍能打开侧栏并高亮对应搜索来源。
- 正文上方回答依据保持轻量，不因为异常详情变高。
- 旧搜索来源场景保持兼容。
- 目标测试、相关聊天展示测试通过。
- 不启动本地 Fusion dev server。
