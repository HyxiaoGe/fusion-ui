# Task 8 报告：Agent run actions、previous_run_id 与替换闸门

## 状态

已完成 Task 8。Agent run retry/continue 的可见入口已收口到 Trajectory Tab 的所选运行终态区域；Chat 继续保留消息级 `MessageActions` 重试，不再下发 Agent continuation 入口。四组一致性闸门通过后，才移除了 `AssistantResponseStack` 对内联 `AgentRunTimeline` 的挂载；旧组件文件、`AnswerEvidence`、`StructuredToolResults` 和 `MessageActions` 均保留。

未启动服务或浏览器，未 push、PR、部署，也未删除旧过程实现文件。

## 契约核对

- 实施前核对了后端 P0/P1 契约工作树提交 `6985548`：`app/schemas/chat.py` 已声明 `ChatRequest.previous_run_id`，并校验它必须与 `retry_user_message_id` 同时提供；`app/api/chat.py` 将该字段传给 `ChatService`；`ChatService` 再将其用于 retry/regenerate 的 run lineage。
- 既有 continue 路径仍使用 `ContinueAgentRunRequest.previous_run_id`，本任务没有发明新端点或字段。
- 前端 Agent retry 继续经过现有消息重试路径，因而同时发送真实 user/assistant 消息 ID；新增的 `previous_run_id` 始终来自 Trajectory 当前 `selectedRunId`。
- 新 attempt 自动选择复用既有 `trajectorySlice` 行为及测试：接受的 `run_started` 直接使用事件中的真实 `runId` 登记 provisional run 并自动选择，没有通过 `attempt_index + 1` 猜 ID。

## 实现

- 新增纯函数 `resolveTrajectoryActionPolicy()`，集中派生 Agent retry/continue 的唯一 eligibility 与请求目标。只有以下条件全部满足才允许操作：所选 run 已终态、run list 最新、所选快照已水合且对账完成、轨迹 `complete` 且未截断、run 可按 `turn_message_id/message_id` 精确关联最后一轮消息、attempt index 完整且唯一并为该轮最大值、无 active stream、服务能力可用、会话模型可用、知识库选择可用。
- `continue` 在共享前置条件之外要求 `status=limit_reached`、存在对应 assistant 消息，并沿用既有知识库 continuation 限制；历史 attempt、旧 turn、legacy/degraded/truncated/unverified 状态全部只读。
- 新增 `TrajectoryRunActions` 终态横幅，通过既有 `getChatCapabilities()` 验证 `message_retry_v1` 后才展示按钮；只读原因以普通用户文案显示，不伪造可操作性。
- `ChatRequest`、`useSendMessage`、`useRetryMessage` 增加 `previous_run_id/previousRunId` 透传。未传 lineage 的原消息级 retry 保持原调用参数和 payload 行为。
- 页面将 selected run 的操作上下文装配到 `TrajectoryTabView`。Agent retry 显式调用 `retryMessage(..., selectedRunId)`；continue 显式调用现有 continue hook 并提交 selected run id。Chat 消息列表仍接收 `onRetry`，但不再接收 `onContinueAgentRun`。
- 一致性闸门 GREEN 后移除 `AssistantResponseStack` 中 `AgentRunTimeline` 的 import、props 组装和 JSX 挂载；状态行、结构化工具结果、回答依据、Markdown 和消息级操作保持原位。React 变更审查确认能力请求只在 Trajectory 激活且所选 run 为终态时触发，隐藏的 force-mounted Tab 不请求能力。

## 文件

- 新增：`src/lib/trajectory/trajectoryActionPolicy.ts`
- 新增：`src/lib/trajectory/trajectoryActionPolicy.test.ts`
- 新增：`src/components/chat/trajectory/TrajectoryRunActions.tsx`
- 新增：`src/components/chat/trajectory/TrajectoryRunActions.test.tsx`
- 修改：`src/lib/api/chat.ts`、`src/lib/api/chat.test.ts`
- 修改：`src/hooks/useSendMessage.ts`、`src/hooks/useSendMessage.test.ts`
- 修改：`src/hooks/useRetryMessage.ts`、`src/hooks/useRetryMessage.test.ts`
- 修改：`src/app/(app)/chat/[chatId]/page.tsx`、`page.test.tsx`
- 修改：`src/components/chat/trajectory/TrajectoryTabView.tsx`
- 修改：`src/components/chat/AssistantResponseStack.tsx`、`AssistantResponseStack.test.tsx`
- 修改：`src/lib/trajectory/trajectoryConsistency.test.ts`

## TDD 证据

1. Action/request RED：运行 policy、终态组件、retry hook 和 chat API 测试时，两个新模块因尚不存在无法解析，retry hook 因未透传 `previousRunId` 失败；已存在用例 63 个通过。
2. Send RED：`npm test -- src/hooks/useSendMessage.test.ts -t 'Agent run retry 把 previousRunId'` → 1 failed、69 skipped；实际 payload 缺少 `previous_run_id`。
3. 首轮 GREEN：action policy、终态组件、retry/send hook、chat API 共 5 files、152 tests passed。
4. 页面装配 RED：page + consistency 共 83 tests 中 2 failed；Chat 仍下发 continuation handler，Trajectory 中找不到“重试所选运行”。
5. 页面装配 GREEN：同一组 2 files、83 tests passed。
6. 一致性替换闸门：`trajectoryConsistency`、action policy、终态组件、page、retry/send/API、slice 共 8 files、259 tests passed。覆盖 event projection parity、live/durable reconciliation、message join、action policy，以及 legacy/degraded/truncated 只读；此时尚未移除内联 timeline。
7. Timeline 替换 RED：`AssistantResponseStack.test.tsx` → 17 tests 中 2 failed；两处均真实观察到旧 `stack-agent` 仍挂载。
8. Timeline 替换 GREEN：同一文件 17 tests passed，同时断言结构化工具结果仍位于 Markdown 前、回答依据仍存在。
9. 保守 attempt RED/GREEN：新增同轮 attempt index 重复/缺失用例先 1 failed、14 skipped；收紧 policy 后 15/15 passed。

## 最终验证

- 受影响目标测试：13 files、357 tests passed。
- 全量测试：`npm test` → 195 files、2160 tests passed，退出码 0。
- 目标 ESLint：16 个本任务源/测试文件退出码 0；仅输出仓库既有 `.eslintignore` 迁移 warning。
- TypeScript：`npx tsc --noEmit` 退出码 2。初次发现并修复了本任务新增的 `TrajectoryRunActions.test.tsx` helper 类型错误；复跑后本任务新增的 production/test 文件均未出现在错误清单。剩余错误来自既有基线，包括 `page.test.tsx` 未修改的 4 处 `ContentBlock` fixture、旧组件/管理页测试、Task 1 `normalizeTrajectoryEvent.ts` 与脚本测试。
- `git diff --check` → 退出码 0。

## 自审

- action target 只由 selected run 的真实 `run_id` 与精确 join 的 user/assistant 消息产生；没有从 attempt index 构造 run id。
- 同轮任何 attempt index 缺失或重复均标为 ambiguous，只读；run list 非 ready、快照未水合、对账非 ready、能力检查失败也一律保守禁用。
- Chat 的 `onRetry` 与 `MessageActions` 未删除；仅移除了 Agent run continuation 的 Chat 页面装配和内联 timeline。
- Composer 仍在 Tabs 外唯一挂载；本任务未触碰 surface/inspect/cache/scroll 状态机或 SSE 生命周期。
- `AgentRunTimeline`、`ExecutionProcess`、`executionProcessModel` 文件均保留，等待真实 dev 回归后的独立 cleanup。

## Concerns

- 按任务约束，本轮只有自动化 DOM/Redux/API-client 验证，没有真实后端或浏览器用户路径证据；真实 dev 能力可达与新 attempt 自动选中仍应在 Task 9 部署授权后的既有登录 Tab 中验收。
- 全仓 TypeScript 基线仍非零，不能宣称 typecheck 全绿；本任务没有新增剩余类型错误。

## Review fix round 1（2026-08-23）

### 结论与提交

独立审查的 2 个 Important 均已修复。UI 提交为 `a29ce75`（`fix: 收紧轨迹运行操作竞态闸门`），API 提交为 `1e97cad`（`fix: 原子校验重试运行最新性`）。未启动服务或浏览器，未 push、PR、部署，也未修改数据库 schema。

### Finding 1：latest attempt freshness

- UI 的 `refreshRuns()` 现在返回可等待的稳定结果；Trajectory retry/continue 点击后必须发起独立 freshness 请求。若首载请求仍在进行，会先等待首载完成，再发起新的强制刷新，不把旧请求成功误当作本次操作 freshness。
- 强制刷新结果被 Redux 接受后，`TrajectoryTabView` 从 store 最新状态重新读取 run list、selected run、message join、snapshot/reconciliation 与 active stream，再重新计算 action policy。刷新失败、认证切换、所选 run 改变或出现更新 attempt 时均拒绝发送。
- API 请求阶段复用 `prepare_message_retry()` 已持有的 conversation row 锁事务，由 `validate_latest_previous_run_candidate()` 校验显式 `previous_run_id` 是同 conversation/user/turn 的最新 attempt；合法但陈旧时返回稳定 `409 CONFLICT` 和文案“所选 Agent 运行已不是最新执行，请刷新轨迹后重试”，非法范围仍保持 404。
- `write_session_started()` 在自己的 conversation 锁事务内执行同一 latest 校验，关闭请求校验与真正 attempt 分配之间的 TOCTOU；即使竞态发生，也不能从历史 attempt 分叉。既有 continue 最新性校验与 lineage 回归测试保持 GREEN。

### Finding 2：conversation single-flight

- `TrajectoryRunActions` 在第一次点击的同步事件栈内以 `useRef` 建立 conversation 级门闩，并立即同时禁用 retry/continue。重复点击直接返回，不 abort 或替换第一次动作。
- refresh、retry capability、知识库 capability 等等待结束后，`canStart()` 都会从 Redux 最新状态复核 active stream、selected run 与 action policy。retry 的真正 `sendMessage` 前和 continue 建立 controller/stream 前均再次复核。
- retry/continue 的 accepted、失败、刷新失败、policy 拒绝与异常路径均通过幂等 lifecycle 释放门闩；流被接受后由 Redux active stream 接管按钮可用性。`useContinueAgentRun` 遇到已有 continuation 直接拒绝，不再 abort 前一次 controller。
- Chat 消息级 retry 参数与入口未改变；Agent run 操作仍仅由 Trajectory 终态区域发起。

### RED / GREEN 证据

1. UI 首轮 RED：3 个目标文件共 43 tests 中 9 failed。失败直接覆盖强制刷新仍返回 `undefined`、retry capability 等待后仍发送、retry/continue 未同步建闩、active stream/selection/new attempt 竞态未拒绝。
2. UI freshness 追加 RED：首载请求进行中点击动作时只观察到 1 次 GET，未发起独立 freshness 请求；实现排队刷新后该用例 GREEN。
3. UI GREEN：Trajectory action、Tab、page、run-list、retry/send/continue hooks 共 8 files、215 tests passed；覆盖 retry 双击、continue 双击、刷新/能力等待期间 active stream、selection 与 attempt 变化，以及 accepted/rejected 门闩释放。
4. API RED：请求阶段 stale attempt 未抛异常，最终 allocation 仍创建从 `run-old` 分叉的新 run；2 failed、API 409 透传契约 1 passed。
5. API GREEN：service、session cache 与 chat request contract 共 98 tests passed；continue 与 run finalizer 相关回归另有 34 tests passed。

### 最终验证

- UI 受影响目标测试：8 files、215 tests passed。
- UI 全量：`npm test` → 195 files、2171 tests passed，退出码 0。
- UI 目标 ESLint：13 个本轮源/测试文件退出码 0；仅有仓库既有 `.eslintignore` 迁移 warning。
- UI TypeScript：`npx tsc --noEmit` 仍为基线退出码 2。错误清单没有本轮修改的 production 文件；`page.test.tsx` 的 4 个 `ContentBlock` fixture 错误与原报告一致，另有旧组件、管理页、Task 1 轨迹归一化和脚本测试错误。本轮未新增剩余 TypeScript 错误。
- API 定向：session cache、ChatService、ChatRequest contract 共 98 passed；continue/run finalizer 共 34 passed。
- API 全量：`python -m pytest -q test/` → 2841 passed、2 skipped、783 subtests passed，退出码 0。
- API Ruff：`ruff check .` 全仓通过；本轮 5 个目标文件 `ruff format --check` 通过。全仓 `ruff format --check .` 仍列出 38 个既有基线文件需格式化，本轮没有扩大范围。
- 两仓 `git diff --check` 均通过。

### Concerns

- 本轮证据为自动化单元、组件、Redux、ORM 与 API contract；按任务约束没有启动服务或浏览器，因此不宣称 dev 真实用户路径已验收。
- API 最终 allocation 闸门在极窄 TOCTOU 中可能通过流式业务错误结束，而不是改变为另一条 lineage；请求到达时已经陈旧的显式 run 会稳定返回 HTTP 409。
