# Fusion Trajectory P3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task with one implementer and one independent reviewer per task.

**Goal:** 在 `fusion-ui` 用全高会话级 Trajectory Tab 替代消息内联“过程”，直接消费 P1 快照 API，并把现有聊天 SSE 安全、幂等地归并为可回放、可检查、可对账的执行轨迹。

**Architecture:** 历史真相来自 P1 的有界 run list 与 per-run snapshot；实时增量经公共 SSE 解析器进入独立 `trajectorySlice`，以 `(runId, sequence)` 归一化去重，终态后用 durable snapshot 对账。页面只编排 Chat/Trajectory 两个 Tab 和唯一 Composer；纯 `TrajectoryCellProjection` 负责 messages、run summaries、snapshot 与 live tail 的确定性 join，虚拟账本、瀑布图和检查器只消费该投影。

**Tech Stack:** Next.js 15、React 19、TypeScript、Redux Toolkit、Radix UI、Tailwind CSS、Vitest、Testing Library。

**Spec:** `fusion-api/docs/TRAJECTORY_DESIGN.md` v0.19 §8（API 文档分支提交 `6985548`）。

## Global Constraints

- P1 已完成，P3 只消费现有 `/api/conversations/{id}/runs` 与 `/api/conversations/{id}/runs/{runId}/trajectory`，不重新实现后端投影器或第二条 SSE。
- 轨迹是会话级、有界、全高 Tab，不实现窄侧栏，不宣称完整历史；`truncated/degraded/legacy/reconciling/conflict` 必须显式可见。
- Composer 只有一个实例并始终挂载；从 Trajectory 发送后停留在 Trajectory。普通发送与历史 `selectedRunId` 无关；stop/steering 只针对 active stream。
- `NormalizedTrajectoryEvent` 的唯一身份是 `(runId, sequence)`。snapshot 覆盖 durable 前缀，保留更大的 live tail；同 key 冲突以 snapshot 为准并记录 conflict。
- 普通 UI 只使用用户安全 DTO。禁止展示 prompt、完整工具参数/输出、工具 schema、原始事件 JSON或管理员审计 DTO。
- Run list 最多 500、单 Run 最多 5000 events；只按需水合选中 Run，snapshot LRU 上限 8，禁止一次拉取/渲染全部 Run 的全部事件。
- 固定行高自实现虚拟窗口，记录行 DOM 上限 200；必须支持 Home/End/方向键、ARIA 位置和定位未挂载节点。
- Chat → Trajectory 使用一次性 `InspectRequest`；Trajectory → Chat 是独立 `revealInChat`，两者不能混成持久 selection。
- 消息级 retry 保留在 Chat；Agent run retry/continue 只在 Trajectory 终态横幅。retry 显式提交 `previous_run_id=selectedRunId`，新 attempt 由真实 `run_started.run_id` 自动选中。
- 产品 PR 仅移除旧 `AgentRunTimeline` 的消息内联挂载；旧实现文件在真实 dev 回归完成前保留，物理删除放独立 cleanup PR。
- 不启动本地 Fusion 服务，不打开新的 Chrome、窗口或标签页；真实浏览器验收只能复用用户已经打开且登录的目标 Tab，并在获得部署阶段授权后进行。

---

## Task 1: 固化 P1 wire contract、归一化事件与 API client

**Files:**

- Create: `src/types/trajectory.ts`
- Create: `src/lib/trajectory/normalizeTrajectoryEvent.ts`
- Create: `src/lib/trajectory/normalizeTrajectoryEvent.test.ts`
- Create: `src/lib/api/trajectory.ts`
- Create: `src/lib/api/trajectory.test.ts`
- Modify: `src/types/agentRun.ts`
- Modify: `src/lib/api/chat.test.ts`

- [ ] 从 P1 schema 精确声明 `TrajectoryRunSummary`、`TrajectoryRunListResponse`、`TrajectoryRecord`、`TrajectorySpan`、`TrajectoryCompleteness`、`TrajectorySnapshot`，字段名保持 wire snake_case，不自行补 `previous_run_id` 或分页字段。
- [ ] 先写 RED 测试：`schema_version` 可缺失、未知 schema/event 被拒绝、payload 只保留事件类型 allowlist 字段、record/SSE 都归一为同一 `NormalizedTrajectoryEvent`。
- [ ] 运行 `npm test -- src/lib/trajectory/normalizeTrajectoryEvent.test.ts`，确认因实现缺失失败。
- [ ] 实现 `normalizeTrajectoryRecord()` 与 `normalizeSseTrajectoryEvent()`；输出 `{runId, sequence, eventType, schemaVersion, timestamp, stepId, toolCallId, parentStepId, traceId, payload}`，不复制原始对象引用。
- [ ] 先写 API RED 测试：两个普通端点、`apiRequest` envelope、AbortSignal、404/401/截断响应透传。
- [ ] 实现 `getTrajectoryRuns(conversationId, signal)` 与 `getTrajectorySnapshot(conversationId, runId, signal)`，复用 `API_CONFIG.BASE_URL` 和 `apiRequest`。
- [ ] 给 `AgentEventEnvelope` 增加可选 `schema_version?: number`；保持现有 parser/handlers 兼容。
- [ ] 运行目标测试和 `npm test -- src/lib/api/chat.test.ts`，确认 GREEN。
- [ ] 提交：`feat: 固化轨迹读取与事件协议`

## Task 2: 实现 trajectorySlice 的合并、对账、选择与有界缓存

**Files:**

- Create: `src/redux/slices/trajectorySlice.ts`
- Create: `src/redux/slices/trajectorySlice.test.ts`
- Modify: `src/redux/store.ts`

- [ ] 先写 RED reducer 测试，覆盖 conversation 隔离、run list loading/error、active surface、selection、一次性 inspect、snapshot LRU、live merge 与 terminal reconciliation。
- [ ] 定义每个 conversation 的状态：run list、`snapshotsByRunId`、`liveEventsByRunId`、`reconciliationByRunId`、LRU、`selectedMessageId/selectedRunId/selectedSpanId`、`inspectRequest`、Tab/scroll/inspector 状态。
- [ ] 实现 `(runId, sequence)` 幂等 live merge；乱序输入按 sequence 排序；同 key 同 payload 不重复；同 key 异 payload记录 conflict。
- [ ] 实现 snapshot reconcile：durable snapshot 覆盖其最大 sequence 以内的 live 事件，保留更大 sequence tail；冲突保留可审计标志；终态 refetch 前状态为 `reconciling`。
- [ ] 缓存只保留最近访问的 8 个 snapshot；驱逐 snapshot 时不删除该 Run 的摘要、selection 或尚未持久化 live tail。
- [ ] `run_started` 可登记 provisional run 并自动选中真实 run id；普通选择不能误改 active stream。
- [ ] 注册 reducer 到 `store.ts`，运行 `npm test -- src/redux/slices/trajectorySlice.test.ts`，确认 GREEN。
- [ ] 提交：`feat: 添加轨迹会话状态与对账`

## Task 3: 实现纯 TrajectoryCellProjection 与一致性域规则

**Files:**

- Create: `src/lib/trajectory/TrajectoryCellProjection.ts`
- Create: `src/lib/trajectory/TrajectoryCellProjection.test.ts`
- Create: `src/lib/trajectory/trajectoryConsistency.ts`
- Create: `src/lib/trajectory/trajectoryConsistency.test.ts`
- Read/Reuse: `src/components/chat/agent/executionProcessModel.ts`
- Read/Reuse: `src/lib/agent/statusTreatment.ts`

- [ ] 建立 fixture：多 turn、同 turn 多 attempt、未加载 snapshot、完整工具/计划/上下文、compacted、legacy 回填、orphan、degraded、truncated、live tail。
- [ ] 先写 RED 测试：新数据按 `turn_message_id → user`、`message_id → assistant` join；legacy assistant-id 回填只允许相邻 user 回看；无法关联进入“未关联运行”。
- [ ] 定义 discriminated union：`UserCell | MessageCell | RunCell | PlanCell | ContextCell | ToolCell | SubtoolCell | CompactedCell`，每个 cell 都携带稳定 key、run/message 关联与完整性来源。
- [ ] 实现无 fetch、无 Redux 的投影器；未选中/未水合 Run 只输出骨架；只投影选中 Run 的详细 records/spans/live tail。
- [ ] 主 run 状态与 trajectory badge 分开派生；legacy/degraded/truncated 可用 `message.agent_run` 高置信度摘要做显式 fallback，但不伪造 span/event。
- [ ] 实现一致性 helper：`event projection parity`、`live ↔ durable reconciliation`、`message join invariants`、`action policy` 四组结果；只有 complete、非 truncated、支持 schema 的 cohort 进入严格 parity。
- [ ] 添加 5000 event projection benchmark test，阈值 750ms，避免易抖动的逐次微基准。
- [ ] 运行两个目标测试，确认 GREEN。
- [ ] 提交：`feat: 实现轨迹单元投影与一致性规则`

## Task 4: 将三条聊天 SSE 路径接入受控实时轨迹归并

**Files:**

- Modify: `src/lib/api/chat.ts`
- Modify: `src/lib/api/chat.test.ts`
- Modify: `src/lib/agent/streamEventHandlers.ts`
- Modify: `src/lib/agent/streamEventHandlers.test.ts`
- Modify: `src/hooks/useSendMessage.ts`
- Modify: `src/hooks/useSendMessage.test.ts`
- Modify: `src/hooks/useContinueAgentRun.ts`
- Modify: `src/hooks/useContinueAgentRun.test.ts`
- Modify: `src/app/(app)/chat/[chatId]/page.tsx`
- Modify: `src/app/(app)/chat/[chatId]/page.test.tsx`

- [ ] 先写 RED 测试：parser 对每个已知 `agent_event` 同时调用原 progress callback 与单一受控 trajectory callback；未知/非法事件不能进入 callback。
- [ ] 给 `StreamCallbacks` 增加 `onTrajectoryEvent(normalized)`，在 dispatch switch 的公共入口调用 allowlist adapter；不新增 SSE endpoint，不改后端 envelope。
- [ ] 扩展 `createAgentStreamEventHandlers` options 接受 conversation resolver 与 trajectory dispatch；原 `isActive` 只控制 progress 投影，trajectory 记录不能因 Tab 未挂载而停止。
- [ ] 在初次发送、continue、页面 reconnect 三处装配同一 trajectory callback；验证 late Tab、SSE replay 与 parser 局部 sequence 去重后 slice 仍幂等。
- [ ] 收到四种 run 终态时标记 `reconciling`；不在 callback 中直接 fetch，交给 hook 观察状态后重拉。
- [ ] 添加 1000 条受控 event reducer batch 性能测试，阈值 500ms。
- [ ] 运行相关 chat/handler/hook/page 目标测试，确认 GREEN。
- [ ] 提交：`feat: 归并实时轨迹事件`

## Task 5: 实现 run list/snapshot 水合 hook 与终态 refetch

**Files:**

- Create: `src/hooks/useConversationTrajectory.ts`
- Create: `src/hooks/useConversationTrajectory.test.ts`
- Modify: `src/redux/slices/trajectorySlice.ts`
- Modify: `src/redux/slices/trajectorySlice.test.ts`

- [ ] 先写 RED hook 测试：首载只拉 run list、默认选最近 attempt、只拉 selected run、快速切 run/chat 时 abort、缓存命中不重复拉取、LRU 驱逐后重拉。
- [ ] 实现 hook：Conversation 页面挂载后加载 run list；Trajectory 激活或 inspect 需要时水合 selected run；请求 key 防止旧 chatId 响应覆盖。
- [ ] 观察 `reconciling` run 并发起一次终态 snapshot refetch；失败保持显式错误和 retry 能力，成功后由 slice 对账并读取 P1 `completeness/truncated`。
- [ ] run list/snapshot 的 404 与空列表进入正常空态；权限/网络错误不伪装为空。
- [ ] 运行目标测试，确认 GREEN。
- [ ] 提交：`feat: 添加轨迹按需水合与终态对账`

## Task 6: 实现固定行高虚拟账本、时间线、检查器与完整性横幅

**Files:**

- Create: `src/lib/trajectory/virtualRange.ts`
- Create: `src/lib/trajectory/virtualRange.test.ts`
- Create: `src/components/chat/trajectory/TrajectoryCell.tsx`
- Create: `src/components/chat/trajectory/TrajectoryLedger.tsx`
- Create: `src/components/chat/trajectory/TrajectoryLedger.test.tsx`
- Create: `src/components/chat/trajectory/TrajectoryTimeline.tsx`
- Create: `src/components/chat/trajectory/TrajectoryTimeline.test.tsx`
- Create: `src/components/chat/trajectory/TrajectoryInspector.tsx`
- Create: `src/components/chat/trajectory/TrajectoryInspector.test.tsx`
- Create: `src/components/chat/trajectory/TrajectoryIntegrityBanner.tsx`
- Create: `src/components/chat/trajectory/TrajectoryIntegrityBanner.test.tsx`

- [ ] 先写 `virtualRange` RED 测试：固定 56px 行高、overscan 12、首/中/尾窗口、scrollToIndex、空列表和 resize；任意 5000 行输入渲染范围 ≤200。
- [ ] 实现纯虚拟范围计算，组件只挂载窗口行和上下 spacer；检查器在账本外独立展开，避免动态行高。
- [ ] 先写 Ledger RED 测试：turn/run 分组、键盘方向键/Home/End、`aria-posinset/aria-setsize`、未挂载目标 inspect 定位、高亮、状态保持。
- [ ] 实现用户可读 cell；工具/上下文仅展示 allowlist 摘要，禁止 JSON 倾倒。
- [ ] 时间线画会话 run 摘要带与当前 run spans；以 run 自身区间计算，不把 turn 之间等待时间算入耗时。
- [ ] 检查器展示状态、耗时、TTFT、父子关系、短错误与 sequence 引用；不展示管理员字段。
- [ ] 粘性横幅覆盖 `truncated/degraded/legacy/reconciling/conflict`，在任意滚动位置都可见。
- [ ] 运行所有新增组件目标测试，确认 GREEN。
- [ ] 提交：`feat: 构建轨迹账本与检查视图`

## Task 7: 装配全高 Trajectory Tab、唯一 Composer 与 inspect/reveal

**Files:**

- Create: `src/components/chat/trajectory/TrajectoryTabView.tsx`
- Create: `src/components/chat/trajectory/TrajectoryTabView.test.tsx`
- Create: `src/components/chat/trajectory/TrajectoryStatusLine.tsx`
- Create: `src/components/chat/trajectory/TrajectoryStatusLine.test.tsx`
- Modify: `src/app/(app)/chat/[chatId]/page.tsx`
- Modify: `src/app/(app)/chat/[chatId]/page.test.tsx`
- Modify: `src/components/chat/ChatMessageList.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Modify: `src/components/chat/AssistantMessage.tsx`
- Modify: `src/components/chat/AssistantResponseStack.tsx`
- Modify: corresponding `*.test.tsx` files along the prop path

- [ ] 先写 page RED 测试：Chat/Trajectory 双 Tab、`ChatInput` 只挂载一次、切换不 remount、不终止 stream、从 Trajectory 发送仍停留 Trajectory、tab 往返保留 selection/scroll/inspector。
- [ ] 用现有 Radix `Tabs` 重构 conversation body；`ChatInput` 留在 Tabs 外、资料面板保持同级，不改新会话页。
- [ ] 实现 `TrajectoryTabView` 编排 hook、projection、ledger、timeline、inspector、横幅和空/加载/错误态。
- [ ] 聊天 Agent 状态行固定为：状态点和名称、耗时、最高优先级异常、独立轨迹 badge、“查看轨迹”；禁止 plan/tool/evidence/retry 展开。
- [ ] `InspectRequest` 消费顺序：切 Tab → 选 Run → 水合 → index 定位 → 高亮 → 清 request；不可见目标回退 Run 头并提示。
- [ ] `revealInChat` 切回 Chat，按稳定 message DOM id 定位；没有细粒度目标时只定位 message，不伪造 step/LLM 锚点。
- [ ] 运行 page 和消息组件目标测试，确认 GREEN。
- [ ] 提交：`feat: 接入会话级轨迹标签页`

## Task 8: 收口 Agent run actions、previous_run_id 与替换闸门

**Files:**

- Create: `src/lib/trajectory/trajectoryActionPolicy.ts`
- Create: `src/lib/trajectory/trajectoryActionPolicy.test.ts`
- Create: `src/components/chat/trajectory/TrajectoryRunActions.tsx`
- Create: `src/components/chat/trajectory/TrajectoryRunActions.test.tsx`
- Modify: `src/lib/api/chat.ts`
- Modify: `src/lib/api/chat.test.ts`
- Modify: `src/hooks/useRetryMessage.ts`
- Modify: `src/hooks/useRetryMessage.test.ts`
- Modify: `src/app/(app)/chat/[chatId]/page.tsx`
- Modify: `src/components/chat/AssistantResponseStack.tsx`
- Modify: `src/components/chat/AssistantResponseStack.test.tsx`
- Test: `src/lib/trajectory/trajectoryConsistency.test.ts`

- [ ] 先写 action policy RED 测试：只有最后一轮最新 attempt、无 active stream、能力/模型/知识库满足时可 Agent retry；continue 额外要求 `limit_reached`；历史 attempt 只读。
- [ ] 扩展 `ChatRequest` 支持 `previous_run_id?: string`，Agent retry 显式使用 selected run id；消息级 retry 仍按原 user/assistant id 工作，不能被移除。
- [ ] 新 `run_started` 到达后自动选中真实 run id；不得用 `attempt_index + 1` 猜测。
- [ ] 在 Trajectory 终态横幅接入 Agent retry/continue，移除 Chat 中旧 Agent run retry/continue 入口。
- [ ] 跑四组一致性测试：event parity、live/durable、message join、action policy；另测 legacy/degraded/truncated 不静默且不伪造。
- [ ] 只有一致性闸门 GREEN 后，移除 `AssistantResponseStack` 对内联 `AgentRunTimeline` 的挂载；保留 `AnswerEvidence`、`StructuredToolResults`、`MessageActions` 和旧实现文件。
- [ ] 运行所有受影响目标测试，确认 GREEN。
- [ ] 提交：`refactor: 用轨迹标签页替换内联过程`

## Task 9: 完整验证、独立审查与产品 PR

**Files:**

- Modify if needed: `docs/superpowers/reports/trajectory-p3-verification.md`
- Do not delete yet: `src/components/chat/agent/AgentRunTimeline.tsx`
- Do not delete yet: `src/components/chat/agent/ExecutionProcess.tsx`
- Do not delete yet: `src/components/chat/agent/executionProcessModel.ts`

- [ ] 运行所有 trajectory、chat parser、stream handler、send/continue/retry、page 与消息组件目标测试。
- [ ] 运行 `npm test`，记录文件数/测试数/耗时；不得仅凭之前基线宣称通过。
- [ ] 运行 `npm run build`，记录类型检查和生产构建结果。
- [ ] 运行 `git diff --check`、`git status --short`、`git diff --stat origin/master...HEAD`，确认无非预期文件。
- [ ] 用独立 reviewer 按 v0.19 §8 和本计划审查：协议安全、合并竞态、缓存边界、性能、可访问性、旧流程替换、actions 归属；修复所有阻塞项并重跑相关验证。
- [ ] 推送 `feat/trajectory-p3-ui` 并创建中文 PR；监督 CI 到完成。未获得合并/部署授权前停在可审查 PR。
- [ ] 真实 dev 回归不在本地启动服务、不新开 Chrome；部署获授权后复用已打开登录 Tab，覆盖工具、知识库、失败/触顶或 continuation、刷新恢复、console 0 error。
- [ ] 真实 dev 回归通过后再建 cleanup PR，物理删除确认零引用的旧过程文件；此清理不得混入首次产品 PR。
