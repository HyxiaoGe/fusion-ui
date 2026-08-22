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
