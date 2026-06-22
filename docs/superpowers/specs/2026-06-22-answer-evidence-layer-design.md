# 回答依据区统一设计

## 背景

联网回答现在已经能展示真实搜索、网页读取、Agent 工具过程和引用侧栏。上一轮已经把 Agent 工具过程区从逐个 tool call chip 改成聚合摘要，解决了“搜索/读取像多个按钮”的问题。

下一处明显摩擦在“资料依据”展示层：同一条 assistant 消息里，URL 读取卡片、搜索来源 chips、Markdown 引用、正文下方“参考 N 篇资料”按钮、右侧 SourcesSidebar 分散展示。用户能看到材料，但需要自己理解这些入口之间的关系。

这份设计只处理 Web 聊天页的回答依据 UI。它不改变后端 schema，不改变搜索、URL 读取、Agent 执行或 Markdown 引用解析逻辑。

## 目标

- 把搜索来源和 URL 读取结果统一成一个“回答依据”区域。
- 让用户一眼知道本轮回答基于多少个搜索来源、多少个读取网页。
- 保留正文中的引用点击和右侧来源侧栏。
- 降低资料入口重复感，避免同一批来源在正文前后出现两套入口。
- 为后续更多资料类型留出清晰边界，例如文件、知识库或工具产物，但本次不实现这些类型。

## 非目标

- 不改后端返回结构。
- 不改 SSE、Redux store shape、Dexie schema。
- 不改 `MarkdownRenderer` 的引用解析规则。
- 不改 Agent 工具过程区。
- 不改移动端和 Electron。
- 不启动本地 Fusion 服务验证。
- 不做来源可信度评分、排序算法或引用质量判断。

## 当前问题

### 1. 来源入口分散

`ChatMessage` 当前按顺序渲染：

- `UrlCard`：历史 URL 读取卡片。
- `SourcesPanel`：搜索来源 chips。
- `MarkdownRenderer`：正文引用点击。
- 正文下方 `参考 N 篇资料` 按钮。
- `SourcesSidebar`：右侧资料侧栏。

这些入口都合理，但用户看到的是多个不同 UI 组件，而不是一个统一的“这轮回答用了什么材料”。

### 2. 搜索来源和网页读取视觉不一致

搜索来源是小 chip，URL 读取是卡片。两者都属于回答依据，但视觉权重不同，容易让 URL 读取比搜索来源更像“主要内容”。

### 3. 正文前后重复

正文上方已经有来源 chips，正文下方又有“参考 N 篇资料”。用户会困惑这两个入口是否指向同一批资料。

### 4. 侧栏只认识搜索来源

`SourcesSidebar` 目前只接收 `SearchSourceSummary[]`。URL 读取结果不会进入同一套资料详情，因此“搜索来源”和“读取网页”没有统一详情层。

## 设计方向

### 推荐方案：新增 AnswerEvidence 统一层

新增一个轻量聚合层，将搜索来源和 URL 读取 block 转换为统一的 evidence item：

```ts
type AnswerEvidenceKind = "search_source" | "url_read";

interface AnswerEvidenceItem {
  id: string;
  kind: AnswerEvidenceKind;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  sourceIndex?: number;
}
```

`AnswerEvidence` 负责展示摘要和详情入口：

- 摘要：`回答依据 · 搜索 5 条 · 读取 2 个网页`
- 默认展示最多 3 个域名/标题的紧凑条目。
- 有更多资料时显示 `查看全部 7 条`。
- 点击搜索来源仍可打开 `SourcesSidebar` 并高亮对应来源。
- 点击 URL 读取项直接打开网页；如果后续侧栏支持 URL 项，再统一进入侧栏。

推荐这个方案，因为它能收敛视觉和职责，同时不触碰数据协议。

### 备选方案 A：只美化 SourcesPanel 和 UrlCard

直接分别调整 `SourcesPanel` 和 `UrlCard` 的样式，让它们看起来更一致。

优点：改动最小。

缺点：组件关系仍然分散，正文前后重复入口仍存在。

### 备选方案 B：把所有资料都放进 SourcesSidebar

扩展 `SourcesSidebar`，让搜索来源和 URL 读取都进入右侧侧栏，正文附近只保留一个入口。

优点：信息架构最统一。

缺点：第一步改动较大，需要重写侧栏数据结构和交互，风险高于当前需要。

## 信息架构

### AnswerEvidence 区域位置

在 assistant 消息中，推荐顺序为：

1. Reasoning 折叠区。
2. Assistant activity status。
3. Agent timeline。
4. AnswerEvidence。
5. Markdown 正文。
6. 推荐问题和消息操作。

理由：

- Agent timeline 解释“AI 做了什么”。
- AnswerEvidence 解释“回答用了什么材料”。
- Markdown 正文是主内容，应该紧跟依据之后。

### 摘要层

摘要层只回答三个问题：

- 是否有外部资料。
- 搜索来源多少条。
- URL 读取多少个页面。

文案规则：

- 只有搜索来源：`回答依据 · 搜索 5 条`
- 只有 URL 读取：`回答依据 · 读取 2 个网页`
- 两者都有：`回答依据 · 搜索 5 条 · 读取 2 个网页`

### 预览层

默认展示最多 3 个 evidence item：

- 优先展示搜索来源前 2 条。
- 如果存在 URL 读取，至少保留 1 个 URL 读取 item。
- 每个 item 展示 favicon、domain、短标题。
- 标题单行截断，完整标题放在 `title`。

### 详情入口

当 evidence 总数大于 3：

- 显示 `查看全部 N 条`。
- 第一阶段点击后打开现有 `SourcesSidebar`，只展示搜索来源；URL 读取 item 仍在 AnswerEvidence 区域中直接可点。
- 如果只有 URL 读取且无搜索来源，则不打开空侧栏，只展示 URL 读取 item。

## 组件职责

### 新增 `answerEvidenceModel` helper

建议新增：

- `src/components/chat/answerEvidenceModel.ts`

职责：

- 接收 `searchSources: SearchSourceSummary[]` 和 `urlBlocks: UrlBlock[]`。
- 输出统一 evidence items 和摘要文案。
- 只做纯数据派生，不访问 DOM，不发请求，不写 Redux。

### 新增 `AnswerEvidence`

建议新增：

- `src/components/chat/AnswerEvidence.tsx`

职责：

- 渲染统一回答依据区域。
- 负责最多 3 个预览 item。
- 对搜索来源 item 调用 `onSourceClick(index)`。
- 对 URL item 使用 `<a>` 直接打开外部链接。
- 当存在更多搜索来源时显示 `查看全部 N 条` 并调用 `onOpenSources()`。

### 调整 `ChatMessage`

调整职责：

- 从 content blocks 和 streaming state 派生 `searchSources` 和 `activity.urlBlocks`。
- 用 `AnswerEvidence` 替换当前分散的 `UrlCard`、`SourcesPanel`、正文下方 `参考 N 篇资料`。
- 保留 `MarkdownRenderer` 的 `sources` 和 `onCitationClick`，不改变正文引用点击行为。
- 保留 `SourcesSidebar`，第一阶段仍只展示搜索来源。

### 旧组件处理

第一阶段不强制删除：

- `SourcesPanel`
- `UrlCard`

如果接入后它们没有任何引用，可以在实现阶段删除或停止导出；如果删除会扩大测试范围，可以先保留。

## 交互规则

### 搜索来源 item

- 点击 item 打开 `SourcesSidebar`。
- 如果 item 对应具体 search source index，则高亮该项。
- 使用 `button`，不是链接，因为目标是打开侧栏。

### URL 读取 item

- 点击 item 直接打开外部 URL。
- 使用 `a target="_blank" rel="noopener noreferrer"`。
- 不打开 SourcesSidebar，避免侧栏只显示搜索来源时造成空状态。

### 查看全部

- 当存在搜索来源时，点击 `查看全部 N 条` 打开 SourcesSidebar。
- 当只有 URL 读取时，不展示 `查看全部`，因为所有 URL item 已在预览中可见；超过 3 个 URL 的情况第一阶段仍显示前 3 个和 `另有 N 个网页` 的不可点击提示。

## 视觉规则

- AnswerEvidence 是正文前的低权重资料栏，不使用大卡片。
- 外层使用细边框或浅背景，避免比正文更突出。
- item 使用紧凑 inline row，不使用多个 pill button 堆叠。
- 正常状态使用中性色，hover 时轻微提升文字色和背景。
- 搜索来源和 URL 读取使用同一视觉结构，只用 icon 或小标签区分。
- 桌面端宽度下单行应稳定，长标题截断。

## 可访问性

- 搜索来源 item 的 button 使用明确 `aria-label`，例如 `查看来源：标题`。
- URL item 的链接文本包含 domain 或 title。
- `查看全部` button 使用 `aria-label="查看全部参考资料"`。
- favicon 作为装饰图时 `alt=""`。
- 不能只依靠颜色区分搜索来源和 URL 读取。

## 测试计划

### helper 测试

新增 `answerEvidenceModel.test.ts`：

- 搜索来源转换为 `search_source` items。
- URL blocks 转换为 `url_read` items。
- 搜索 + URL 组合生成正确摘要。
- 无资料时返回空状态。
- domain 解析失败时 fallback 到原始 URL。
- 预览规则保证有 URL 时至少展示 1 个 URL item。

### 组件测试

新增 `AnswerEvidence.test.tsx`：

- 只搜索来源时显示 `回答依据 · 搜索 N 条`。
- 只 URL 读取时显示 `回答依据 · 读取 N 个网页`。
- 搜索 + URL 同时存在时显示组合摘要。
- 点击搜索 item 调用 `onSourceClick(index)`。
- 点击 `查看全部` 调用 `onOpenSources()`。
- URL item 渲染为外部链接。
- 长标题有 `truncate` 和 `title`。

### ChatMessage 回归测试

更新 `ChatMessage.test.tsx`：

- 存在 search block 时渲染 AnswerEvidence，不再渲染旧 `SourcesPanel` 入口。
- 存在 url_read block 时渲染 AnswerEvidence，不再渲染旧 `UrlCard`。
- Markdown 引用点击仍打开 `SourcesSidebar` 并高亮对应来源。
- thinking 文本提到“来源/搜索”不会生成 AnswerEvidence。

## 实施边界

- 第一阶段只改前端展示和测试。
- 不改变 content block schema。
- 不改变搜索来源的侧栏数据结构。
- 不改变正文 Markdown 引用行为。
- 不启动本地 dev server。
- 验证使用单测、构建和 CI。

## 验收标准

- 一条联网回答中，搜索来源和 URL 读取结果统一出现在一个“回答依据”区域。
- 用户不再同时看到 `SourcesPanel`、`UrlCard`、正文下方“参考 N 篇资料”三套分散入口。
- 点击正文引用仍能打开来源侧栏并高亮对应来源。
- URL 读取结果仍可直接打开原网页。
- 没有真实 search/url_read block 时不显示回答依据区。
