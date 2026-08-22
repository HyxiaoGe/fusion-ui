# Task 7 报告：全高 Trajectory Tab、唯一 Composer 与 inspect/reveal

## 状态

已完成 Task 7 的页面级装配：会话主列现为受控 Chat/Trajectory 双 Tab，`ChatInput` 只有一个始终挂载的实例；全高 Trajectory 视图复用已有 hook、唯一投影、账本、时间线、检查器和完整性横幅；Chat Agent 消息新增固定状态行和单次 inspect/reveal 闭环。未启动服务或浏览器，未推送、发布，未修改 retry policy，也未提前删除 Task 8 负责的旧内联 timeline。

## 实现

- `chat/[chatId]/page.tsx` 使用现有 Radix Tabs 装配受控的“聊天/轨迹”两个会话视图。两个 Tab body 都保持挂载，用受控 `activeSurface` 决定显示；唯一 `ChatInput` 位于 Tabs 之外，资料面板仍为同级元素。切 Tab 不改变 SSE 生命周期，从 Trajectory 发送后也不强制切回 Chat。
- `TrajectoryTabView` 在页面挂载时调用 `useConversationTrajectory` 拉取有界 run list，仅由 hook 在激活、inspect 或 reconcile 时水合所选 run。组件只调用一次 `projectTrajectoryCells`，将 messages、有界 runs、快照和 live tail 交给 Ledger/Timeline/Inspector，没有再次解析协议或发起 fetch。
- Trajectory 页头和内容只声称“有界”视图，真实覆盖 run list 的 loading/empty/failed/unavailable，所选快照的 loading/failed/unavailable，以及 truncated/degraded/reconciling/conflict 横幅。`TrajectoryLedger` 传入稳定 `restoreKey={conversationId}`；同会话 Tab 往返保留账本 DOM、滚动位置、选择和检查器，换会话才开始新的恢复事务。
- `activeSurface`、选择、inspect request、`scrollMode` 和 Inspector 开关均读写 `trajectorySlice`。局部状态只保留一次 inspect 的短提示与已解析高亮，以便 request consume 后用户仍能看到定位结果。
- Chat→Trajectory 的 `InspectRequest` 依次完成切 Tab、选 run、等待水合、解析 index、居中滚动、聚焦高亮，最后 consume。消息级 inspect 也不跳过水合；span 不可见、截断或详情不可用时回退 run header，并提示“该节点不在当前有界快照中”。
- Trajectory→Chat 只传递投影得到的稳定 user/assistant message id。页面切回 Chat 后用统一 `getChatMessageDomId()` 找到消息容器，滚动到中央并聚焦；没有伪造 step/LLM 细粒度双向锚点。
- Agent 状态行只包含文字可辨识的主状态点与名称、耗时、单一最高优先级异常、独立 trajectory badge 和“查看轨迹”。工具异常复用现有普通用户安全文案；不渲染 plan、tool/evidence 列表、token、TTFT、run retry/continue 或可展开详情。消息级 `MessageActions` 保留。
- Chat 状态行的 trajectory badge 也通过唯一 `TrajectoryCellProjection` 得到，覆盖 recording/complete/degraded/truncated/legacy/summary-only/unknown，消息组件不重复投影协议。

## TDD 证据

1. Page 壳 RED：新增受控双 Tab、唯一 Composer identity/SSE 生命周期、同会话 selection/scroll/inspector 的 3 个测试，初始因 Tab 不存在全部失败；完成页面装配后 GREEN。
2. `TrajectoryTabView` RED：最小 placeholder 下 5 个真实 Redux/DOM 测试全部失败；完成 loading/error/unavailable/empty、投影、Ledger/Timeline/Inspector/Banner、inspect 回退和 reveal 后 5/5 GREEN。
3. `TrajectoryStatusLine` RED：最小 placeholder 下 10 个状态、耗时、异常优先级、七类 badge 和禁止内容测试全部失败；完成后 10/10 GREEN。
4. 消息 prop path RED：`AssistantResponseStack`/`ChatMessage`/`ChatMessageList` 的状态行、稳定 DOM、summary-only/truncated badge 与 inspect 透传共 4 个测试按预期失败；实现后 GREEN。
5. Page inspect/reveal RED：两个页面测试先分别因 inspect 入口和 reveal 回调不存在而失败；完成真实 trajectory Redux/DOM 编排后 GREEN。
6. 自审补充的消息级水合顺序 RED：未水合时 request 被提前 consume；调整为任何 inspect 都先等所选 run 水合后，该用例 GREEN。

## 验证

- 最终聚焦：`npm test -- --run <page + message prop path + trajectory components/hook/projection/slice>` → 18 files、283 tests passed，退出码 0。
- 全量：`npm test` → 192 files、2131 tests passed，退出码 0。
- 目标 ESLint：15 个 Task 7 源/测试文件退出码 0；仅有仓库既有 `.eslintignore` 迁移 warning。
- TypeScript：全仓 `npx tsc --noEmit --pretty false` 仍由仓库既有页面测试、旧组件、Task 1 归一化等基线错误阻断；修复本任务新增的两处类型问题后，定向过滤无 Task 7 生产文件错误，仅剩 `page.test.tsx` 既有的 4 处 `ContentBlock` fixture 错误。
- `git diff --check` 在报告前退出码 0。

## 自审

- 数据边界：页面只编排现有 hook 和 slice；新组件不直接访问 API，不自行 merge SSE/快照，不遍历或 stringify 原始 payload。
- 状态边界：跨 Tab 持久的产品状态均来自 `trajectorySlice`；同会话 force-mounted Tab 不丢失 Ledger 内部虚拟滚动实例，`restoreKey` 仅由 conversation identity 决定。
- inspect 边界：解析 span 时同时限定 run id，避免不同 run 重复 sequence 误定位；选择 run header 不会沿用旧 run span。request 只在 Ledger 完成定位与 focus 请求后 consume。
- 交互与可访问性：只使用现有 token、Lucide、Radix Tabs 和 native/Button controls；状态同时有文字，Tab、Ledger、Timeline、Inspector、刷新、inspect/reveal 均有可见 focus 路径。没有新 Drawer、侧栏或依赖。
- 范围：旧 `AgentRunTimeline` 和 run retry/continue 通路原样保留，没有删除旧文件或改变策略；这些明确留给 Task 8。

## Concerns

- Task 8 仍需移除已保留的旧内联 `AgentRunTimeline`/run actions 并收口 retry/continue；在此之前，新状态行与旧执行过程属于预期的过渡共存。
- 按任务约束未启动本地服务或浏览器，因此本报告只声称真实 DOM/Redux 自动化验收，不声称真实浏览器或后端用户路径。
- 全仓 TypeScript 基线仍非零；Task 7 生产文件未出现新的定向类型错误。

## Review fix round 1（2026-08-23）

### 修复

- 收紧一次性 inspect 的请求隔离：resolution 同时校验 requestId、`selectionSource === 'inspect'`、`selectedRunId === request.runId` 与 `snapshot.run.run_id === request.runId`；Ledger、Timeline、Inspector 的手动选择会先 consume 当前 pending request，再建立 manual selection。inspect 反馈按 requestId 隔离，新请求立即隐藏旧 notice/highlight，成功定位显式清除旧 fallback 提示。
- 将 `TrajectoryStatusLine` 从隐式 live 的 `role="status"` 改为非 live `role="group"`；每秒更新的耗时节点显式 `aria-live="off"`，同时保留包含实时值的 accessible name。
- 已有 runs 的刷新失败继续保留旧列表，并在完整性区域展示非阻塞 `role="alert"`、`runListError` 安全文案、“当前数据可能不是最新”与“重试刷新”按钮；首次零 runs 失败页保持原行为。

### RED / GREEN

1. `TrajectoryTabView` 新增竞态测试“inspect A 水合中手选 B”与连续请求测试“fallback A → 成功 B”。RED 时 pending A 未被取消且旧 fallback 提示残留；完成请求/selection/snapshot identity 门禁和手动取消后，2 tests passed。
2. `TrajectoryStatusLine` 新增 fake timers 多 tick 测试。RED 时整行仍是 `role="status"`；改为非 live group 且耗时 `aria-live="off"` 后，可见耗时从 1.5 秒更新到 3.5 秒且不存在 polite/assertive live region。
3. `TrajectoryTabView` 新增“ready 有 runs → refresh rejected”测试。RED 时页面没有 alert；补 stale alert 与 retry 后，旧 Run 保留、错误及 stale 提示可达，重试成功后新 Run 出现且提示清除。零 runs 初次失败用例同时 GREEN。

### 最终验证

- Task 7 聚焦：18 files、287 tests passed，退出码 0（page、消息路径、StatusLine、Tab、其余 trajectory components/hook/projection/slice）。
- 全量：192 files、2135 tests passed，退出码 0。
- 目标 ESLint：本轮 5 个变更源/测试文件退出码 0，仅仓库既有 `.eslintignore` 迁移 warning。
- TypeScript：`npx tsc --noEmit --pretty false` 仍由仓库既有基线错误阻断；本轮变更的 StatusLine/Tab 生产与测试文件未新增类型错误。page 测试仍有原报告披露的 4 处 `ContentBlock` fixture 错误。
- 未启动服务或浏览器；未改 Task 8 的旧内联 timeline、retry/continue policy，未推送或发布。
