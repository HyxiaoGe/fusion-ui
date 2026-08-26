# Trajectory 三处显示回归修复计划

**目标：** 修复首次执行误标 Run 2、聊天状态行耗时未知、轨迹页出现上下文状态开关。

**依据：** 用户本轮请求，以及 dev 会话 `71ce13d1-9ab0-407a-85d4-ab0e4ff369ca` 的真实页面/API 核验。

**边界：** 只修改 fusion-ui；不改后端、数据和普通聊天思考策略，不重启本地服务，不新开 Chrome。继续现有 dev 发布授权，遵守 PR/CI 门禁。

## 修复与验收

- [x] 编号：后端 run 和 tool attempt 均从 1 开始，展示层不得再 +1。覆盖表格、摘要和工具 attempt 详情；未知序号保持未知，不以位置猜测。
- [x] 耗时：聊天状态行按会话和 run_id 精确消费已有 trajectory run summary；优先服务端 duration_ms，允许合法起止时间差，实时摘要尚未到达时保留现有步骤计时，不累计工具耗时、不发额外详情请求。
- [x] 上下文：ChatInput 增加默认开启的 showContextStatus，聊天页传 activeSurface === 'chat'；隐藏时入口和 Portal 弹层都不存在，不重建输入框、不清空草稿，回聊天可继续使用。
- [x] 每项先补失败测试再最小实现；运行关联 Vitest、lint、独立输出目录生产构建和 diff 检查。
- [x] 独立审查修复范围及回归风险，无可达 P0/P1 问题。
- [ ] 中文提交、PR/CI、合并 master、dev 部署。
- [ ] 复用已有 Chrome 会话检查首次编号、已知耗时、上下文开关 Tab 边界及刷新恢复，检查 network/console。

## 根因记录

- 后端 session_cache 的 max_attempt + 1 与 tool_executor 的执行前递增都产生 1 基序号，前端三处投影误用 0 基。
- 历史消息 agent_run 不携带 steps，TrajectoryStatusLine 只从 steps 计算导致未知；已有 trajectory 摘要包含权威耗时。
- 双 Tab 共用同一个 ChatInput，ContextStatus 未感知当前视图，因此入口及弹层泄漏到轨迹页。

## 发布前证据（2026-08-26，Asia/Shanghai）

- 基线：`origin/master` 的 `7de7f55`，修复分支 `fix/trajectory-display-regressions`。
- TDD：编号投影与组件断言先失败；耗时、上下文和页面路由共 7 项先失败，真实消息展示链路另有 1 项先失败，最小修复后转绿。
- 全量 `TZ=Asia/Shanghai npm test`：207 个文件、2,336 项测试全部通过，包括串行性能专项及原有聊天思考策略测试。
- 目标文件 ESLint 与 `git diff --check` 通过；独立临时目录 `npm run build` 通过，未改写本地开发服务 `.next`。
- 独立只读审查：14 个目标文件 319 项测试及 1 项思考链路测试通过，无 P0/P1 阻塞。
- 单独 `tsc --noEmit --incremental false` 未全绿：当前分支与干净 master 基线均有相同的 37 项既存错误，忽略行号后逐项一致，本次未新增。未通过放宽配置掩盖错误，也未扩展本次修复范围。
- 尚未完成的发布和真实浏览器门禁，以本次 PR 与后续验收结果为准。
