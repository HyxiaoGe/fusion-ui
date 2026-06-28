# Agent 可读化任务时间线设计

## 背景

Fusion 前端已经有 `AgentRunTimeline`，可以根据 SSE `agent_event` 展示 run、step、工具调用、触顶和失败状态。现有 UI 已经避免把正常成功 timeline 变成主视觉，并通过工具分组降低了工程日志感。

下一步不是重做 timeline，而是接入 Agent Progress Protocol v2，把后端推来的计划、进度、证据和工具摘要展示成普通用户能理解的任务时间线。用户应该知道 agent 当前在做什么、做到哪一步、哪些资料支撑了回答、触顶后还差什么。

## 目标

- 接入后端 v2 `agent_event`，包括计划、进度、证据和工具结果 digest。
- 保留现有 v1 timeline 能力，不破坏 `run_started`、`step_started`、`tool_call_*` 和 continuation。
- 用 Redux 保存 streaming 期可读时间线，支持 Redis replay 幂等恢复。
- 从会话详情 hydration 恢复历史 compact progress snapshot。
- 让运行中、失败、触顶和长任务场景明显更可读；正常成功后继续低干扰。
- 不解析 reasoning 文本，不读取 raw tool output，不在前端猜证据链。

## 非目标

- 不实现发送前“先规划再确认”的长任务计划模式。
- 不让用户编辑计划、跳过步骤、换工具或调预算。
- 不把每次成功工具调用都做成高亮大面板。
- 不改答案正文 Markdown、来源侧栏和推荐问题的核心结构。
- 不启动本地 Fusion 服务作为验收路径；实现阶段使用 Vitest、build、CI/CD、远端部署和正式域名 Chrome 回归。

## 用户体验原则

### 1. 正文仍是主内容

时间线解释 agent 做了什么，但不能压过回答正文。正常成功的 timeline 可以折叠或降权；运行中、失败、触顶时才提高可见性。

### 2. 计划是“当前任务地图”，不是模型内心独白

计划项文案必须短、可理解，例如：

- 理解问题
- 搜索资料
- 读取关键来源
- 整理回答

不要展示 chain-of-thought 或 prompt。

### 3. 证据解释“为什么可信”

证据区只显示关键发现、标题、domain 和采用状态。完整来源仍由 AnswerEvidence 或来源侧栏承接，避免重复展示一整套搜索结果。

### 4. 触顶时显示“还差什么”

`limit_reached` banner 旁边展示未完成或 blocked 的计划项，让“继续查”变成有上下文的动作。

## 数据模型

### 新增类型

在 `src/types/agentRun.ts` 扩展：

```ts
export type AgentProgressPhase =
  | 'planning'
  | 'thinking'
  | 'researching'
  | 'reading'
  | 'synthesizing'
  | 'answering'
  | 'recovering';

export type AgentPlanItemStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'blocked';

export type AgentPlanItemKind =
  | 'reasoning'
  | 'search'
  | 'read'
  | 'synthesis'
  | 'answer'
  | 'other';

export interface AgentProgressState {
  phase: AgentProgressPhase;
  label: string;
  completedSteps?: number;
  totalSteps?: number;
  completedToolCalls?: number;
  maxToolCalls?: number;
}

export interface AgentPlanItem {
  id: string;
  title: string;
  status: AgentPlanItemStatus;
  kind: AgentPlanItemKind;
  summary?: string;
  toolNames: string[];
  evidenceItemIds: string[];
}

export interface AgentPlanState {
  planId: string;
  revision: number;
  items: AgentPlanItem[];
}

export interface AgentEvidenceItem {
  id: string;
  kind: 'web' | 'file' | 'tool' | 'model';
  status: 'candidate' | 'used' | 'discarded';
  title: string;
  url?: string;
  domain?: string;
  claim: string;
  snippet?: string;
  usedByFinalAnswer: boolean;
}

export interface AgentToolDigest {
  toolCallId: string;
  toolName: string;
  status: 'success' | 'failed' | 'degraded' | 'interrupted';
  title: string;
  summary: string;
  keyFindings: string[];
  sourceRefs: string[];
  truncated: boolean;
}
```

`AgentRunState` 增加：

```ts
protocolVersion?: number;
progress?: AgentProgressState;
plan?: AgentPlanState;
evidence: AgentEvidenceItem[];
toolDigests: AgentToolDigest[];
```

兼容规则：

- v1 run 没有这些字段时照旧渲染。
- 历史 hydration 缺 progress 时不显示可读时间线增强区。
- `evidence` 和 `toolDigests` 默认空数组。

## SSE 解析

`src/lib/api/chat.ts` 的 `StreamCallbacks` 新增回调：

- `onRunProgressUpdated`
- `onPlanSnapshot`
- `onPlanStepUpdated`
- `onToolResultDigest`
- `onEvidenceItemUpserted`

`dispatchAgentEvent` 增加 v2 case。未知 event 继续 warn 并忽略。

注意点：

- 继续使用 `run_id + sequence` 去重。
- v2 event 不触发 `onReady`。
- v2 event 不改变 `messageId` / `conversationId` materialization。
- `protocol_version` 缺失时按 v1 处理。

## Redux 设计

`src/redux/slices/streamSlice.ts` 新增 reducer：

- `updateRunProgress`
- `applyPlanSnapshot`
- `updatePlanStep`
- `upsertToolDigest`
- `upsertEvidenceItem`

幂等规则：

- 所有 reducer 先校验 `currentRun.runId === payload.runId`。
- `sequence <= currentRun.lastSequence` 时忽略。
- `applyPlanSnapshot` 覆盖整个 plan。
- `updatePlanStep` 要求 `revision > currentRun.plan.revision`，然后按 item id upsert。
- `upsertEvidenceItem` 按 evidence id 覆盖。
- `upsertToolDigest` 按 toolCallId 覆盖。

历史 hydration 直接构造 `AgentRunState.progress/plan/evidence/toolDigests`，不经过 streaming reducer。

## 事件映射去重

当前 `useSendMessage`、`useContinueAgentRun` 和 chat page reconnect 各自写了一套 agent event callback。v2 会放大重复代码。

建议新增：

- `src/lib/agent/streamEventHandlers.ts`

职责：

- 接收 `dispatch`、`store`、`messageIdResolver`、`activeGuard`。
- 返回包含 v1 和 v2 的 `StreamCallbacks` 片段。
- `useSendMessage`、`useContinueAgentRun`、reconnect 复用它。

这样 v2 callback 不需要复制三份，也降低 continuation 与 reconnect 行为漂移风险。

## UI 设计

### 顶层结构

沿用 `AgentRunTimeline`，内部新增三块低干扰区域：

1. `RunProgressStrip`
2. `PlanTimeline`
3. `EvidenceDigest`

结构顺序：

```text
RunHeader
RunBanner
RunProgressStrip
PlanTimeline
StepTimeline
EvidenceDigest
```

其中 `StepTimeline` 是现有工具过程区。v2 不是替代它，而是在它上方提供任务语义，在它下方提供证据摘要。

### `RunProgressStrip`

展示当前阶段和预算进度。

示例：

- `正在搜索相关资料 · 2/4 步`
- `正在读取关键来源 · 工具 6/20`
- `正在整理回答`

规则：

- 只有 `run.progress` 存在时显示。
- running 时显示 spinner。
- completed 后如果没有异常，默认隐藏或折叠到 header 辅助文案。
- limit/failed/interrupted 时保留显示。

### `PlanTimeline`

展示计划项状态。

视觉规则：

- pending：中性色。
- running：轻量 spinner + 当前项。
- completed：小 check。
- failed/blocked：warning/error 文案。
- skipped：低权重。

折叠规则：

- running、limit_reached、failed、interrupted：默认显示。
- completed 且无 failed/blocked：默认折叠，只显示 `已完成 N 步`。
- 用户展开后显示全部计划项。

### `EvidenceDigest`

展示关键证据摘要，不替代 AnswerEvidence。

规则：

- 最多显示 3 条 evidence。
- 优先显示 `used`，其次 candidate。
- 每条显示 title、domain、claim。
- discarded 默认不显示；异常展开时可以显示“已跳过的来源”。
- snippet 只在展开态显示，且不超过后端裁剪长度。

示例：

```text
采用的依据
官方发布页 · example.com
确认了发布时间和原始公告内容
```

### 工具摘要增强

现有 `ToolCallSummary` 继续显示工具分组。若 `toolDigests` 存在：

- 对应 tool group 展开时优先显示 digest summary 和 key findings。
- 不展示 raw arguments 之外的内部细节。
- digest 缺失时回退现有 group detail。

## 历史消息恢复

后端会在 `Message.agent_run.progress` 返回 compact snapshot。前端 hydration 规则：

- `buildChatFromServerConversation` 把 snake_case progress 映射为 camelCase。
- message 上的 `agent_run` 继续作为历史 timeline 数据源。
- 如果当前 stream 的 `currentRun` 与 message id 匹配，优先显示 streaming currentRun。
- 否则显示 message.agent_run。

这保证：

- Redis TTL 后历史会话仍有 compact timeline。
- continuation 成功后刷新页面仍能看到最新 run 的计划/证据摘要。
- 老消息没有 progress 时不报错。

## 与现有组件的关系

### `AgentRunTimeline`

保留 message 归属过滤和 completed 隐藏规则。新增判断：

- 如果 run completed 且只有正常 progress/plan，没有异常，可以保持隐藏。
- 如果存在 `failed`、`blocked`、`limit_reached`、`degraded tool` 或 `used evidence`，可以显示低权重摘要。

### `AgentStepCard`

继续负责工具执行过程。不要把 plan item 和 evidence 都塞进 step card，避免卡片过重。

### `AnswerEvidence`

继续负责回答依据的主入口。`EvidenceDigest` 只是 run 过程内的轻量解释。

## 空状态和异常状态

- 没有 progress：完全走 v1 UI。
- 有 progress 没有 plan：只显示 progress strip。
- 有 plan 没有 evidence：显示计划，不显示证据区。
- evidence 全部 discarded：默认不显示证据区，异常展开时显示“未采用来源”。
- v2 event 到达早于 `run_started`：忽略并 warn。
- v2 event sequence 倒退：沿用现有去重逻辑忽略。

## 可访问性

- 计划折叠按钮使用真实 `button` 和 `aria-expanded`。
- spinner 必须配文字状态，不只靠动画表达。
- evidence title 和 domain 文案可被屏幕阅读器读取。
- URL 截断时完整 URL 放入 `title` 或可访问文本。
- 不使用按钮样式展示不可点击状态标签。

## 测试计划

### API 解析测试

`src/lib/api/chat.test.ts`

- v2 五类事件能 dispatch 到对应 callback。
- 未知 v2 event 仍 warn 不抛。
- sequence 倒退的 v2 event 被丢弃。
- v2 event 不触发 `onReady`。

### Redux 测试

`src/redux/slices/streamSlice.test.ts`

- `updateRunProgress` 写入 progress。
- `applyPlanSnapshot` 建立 plan。
- `updatePlanStep` 按 revision 更新，不接受旧 revision。
- `upsertEvidenceItem` 不重复。
- `upsertToolDigest` 覆盖同 toolCallId。
- `endStream` 保留 progress/plan/evidence/toolDigests。

### Hydration 测试

`src/lib/chat/conversationHydration.test.ts`

- server `agent_run.progress` 映射为 camelCase。
- 缺失 progress 的历史消息兼容。
- message.agent_run 与 streaming currentRun 归属规则不变。

### 组件测试

新增或更新：

- `RunProgressStrip.test.tsx`
- `PlanTimeline.test.tsx`
- `EvidenceDigest.test.tsx`
- `AgentRunTimeline.test.tsx`

覆盖：

- running 默认显示计划和进度。
- completed 正常成功降权或隐藏。
- limit_reached 显示未完成计划和“继续查”。
- failed/blocked 计划项可见。
- evidence 最多显示 3 条，used 优先。

### 回归测试

- `npm test`
- `npm run build`
- `git diff --check`
- 正式域名 Chrome 回归：
  - 普通短问答不出现异常大 timeline。
  - 联网/工具问题运行中显示计划和证据摘要。
  - 触顶 continuation banner 能看到剩余计划。

## 验收标准

- 用户在运行中能看懂当前阶段，而不是只看到工具 chip。
- 用户在工具完成后能看到关键发现和来源摘要，而不是 raw 参数。
- 触顶时能看到未完成或 blocked 的计划项，并能自然点击“继续查”。
- 普通成功回答不会被 timeline 抢主视觉。
- 刷新历史会话后，compact progress snapshot 能恢复。
- 旧 v1 agent run 和老消息继续正常显示。

## 分阶段实施

### 第一阶段：类型、解析和状态

- 扩展 `AgentRunState` 类型。
- 扩展 `chat.ts` v2 callbacks。
- 新增 Redux reducers 和测试。
- 抽出共享 agent event handler，消除三处重复映射。

### 第二阶段：UI 组件

- 新增 `RunProgressStrip`、`PlanTimeline`、`EvidenceDigest`。
- 接入 `AgentRunTimeline`。
- 用 `toolDigests` 增强工具详情展开态。

### 第三阶段：历史 hydration 和真实回归

- 映射后端 `agent_run.progress`。
- 补历史会话组件测试。
- 走 CI/CD 和正式域名 Chrome 回归。
