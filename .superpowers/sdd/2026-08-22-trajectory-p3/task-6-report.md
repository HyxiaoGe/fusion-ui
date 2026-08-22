# Task 6 报告：固定行高虚拟账本、时间线、检查器与完整性横幅

## 状态

已完成 Task 6 的组件与纯虚拟范围实现；变更只消费 Task 3 的 `TrajectoryCell`、P1 `TrajectoryRunSummary/TrajectorySpan` 和显式完整性状态，无 fetch、Redux、服务、浏览器、推送或发布操作。

## 实现

- 新增固定 56px 行高、overscan 12、最多 200 条 DOM 记录的纯虚拟窗口；覆盖空列表、首/中/尾窗口、视口 resize 与未挂载 index 的 start/center/end/auto 定位。
- `TrajectoryLedger` 只挂载窗口行与上下 spacer，按 turn 和 run attempt 标注；原生 button option 提供 `aria-posinset/aria-setsize/aria-selected`、方向键/Home/End、可见 focus ring，以及 inspect request 先找 index、再居中滚动、挂载、聚焦和高亮的闭环。
- `TrajectoryCell` 为 user/message/run/plan/context/tool/subtool/compacted 提供有界单行普通用户摘要；未知工具使用现有注册表的“外部工具”兜底，不输出 payload JSON、完整参数或结果。Run 主状态与 trajectory badge 独立显示，未水合 Run 在同一 56px 行内保留静态骨架空间。
- `TrajectoryTimeline` 用每个 Run 自身耗时占比分配会话摘要带，不读取相邻 turn 时间差；当前 Run span 瀑布按自身区间定位，并提供可见阶段列表作为键盘和读屏真相视图。
- `TrajectoryInspector` 独立于虚拟账本渲染，展示普通用户安全的状态、耗时、TTFT、父子关系、短错误和 sequence 引用；长 sequence 列表压缩为首尾范围，不接收或渲染 raw JSON、prompt、完整参数/结果或管理员 DTO。
- `TrajectoryIntegrityBanner` 使用 sticky 状态区同时覆盖 truncated、degraded、legacy、reconciling 与 conflict；每项均有 Lucide 图标和文字，不只依赖颜色。
- 按 UI/UX 复核补齐：交互使用 native button、完整 accessible name/pressed/selected state、可见 focus ring、账本 scroll padding 与居中键盘定位，避免 sticky 横幅/Composer 遮住焦点；空 timeline/inspector 与未水合 Run 保留稳定空间。

## TDD 证据

1. `virtualRange` RED：实现模块缺失后补最小 stub，7 tests 中 5 个按预期行为失败；完成固定窗口和定位计算后 7/7 GREEN。
2. 四组组件 RED：最小组件 stub 下 20 tests 中 19 个按真实 DOM/ARIA/键盘行为失败；实现后 20/20 GREEN。
3. Run 双状态与骨架 RED：新增测试时无法找到“主状态 + 轨迹降级”及骨架；实现独立 badge 与固定骨架后 GREEN。
4. Inspector 大量 sequence RED：5000 条引用被完整倾倒；改为有界范围摘要后 GREEN。
5. 长消息摘要 RED：完整正文进入账本 DOM/accessible name；改为 160 字符有界单行摘要后 GREEN。

## 验证

- 最终聚焦：`npm test -- src/lib/trajectory/virtualRange.test.ts src/components/chat/trajectory/TrajectoryLedger.test.tsx src/components/chat/trajectory/TrajectoryTimeline.test.tsx src/components/chat/trajectory/TrajectoryInspector.test.tsx src/components/chat/trajectory/TrajectoryIntegrityBanner.test.tsx` → 5 files、30 tests passed，退出码 0。
- 全量：`npm test` → 190 files、2098 tests passed，退出码 0。
- 目标 ESLint：11 个 Task 6 源/测试文件退出码 0；仅有仓库既有 `.eslintignore` 迁移 warning。
- TypeScript：全仓 `npx tsc --noEmit --pretty false` 仍由既有页面测试、旧组件和 Task 1 归一化文件错误阻断；定向过滤 `src/components/chat/trajectory` 与 `virtualRange` 无输出，本任务文件没有新增 TypeScript 错误。
- `git diff --check` / staged diff check 在提交前执行。

## 自审

- 数据边界：生产组件仅依赖传入 props 和 Task 3/P1 普通用户类型；没有 API、store、管理员 DTO 或原始事件序列化路径。
- 虚拟化边界：所有行高由同一 56px 常量控制；Inspector、timeline 和完整性横幅均在账本行外，5000 条 fixture 的 option 数不超过 200。
- 可访问性：行与时间线节点均为 button；状态同时使用图标与文字；键盘目标会在挂载后获得焦点；sticky 共存通过 `scroll-pt/scroll-pb` 和居中定位保护。
- 时间语义：会话摘要总耗时为各 Run 自身 duration 求和；span 坐标以所选 Run 的 started_at/duration 为原点，不把 turn 间等待画入执行耗时。
- 安全性：cell 摘要只读取明确字段；Inspector 只读取已建模的状态/时间/关系/错误/sequence，不遍历或 stringify payload。

## Concerns

- Task 7 尚未把这些纯组件装配进全高 `TrajectoryTabView`，因此本任务没有页面级布局、真实数据或 Chrome 用户路径证据。
- 全仓 TypeScript 基线仍非零；当前 Task 6 文件未出现在定向错误输出中。
