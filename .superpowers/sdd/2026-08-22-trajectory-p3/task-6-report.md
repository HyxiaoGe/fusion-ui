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

---

## Fix round 1：滚动恢复、受控远端选择与检查器安全语义

### 修复

- 首次 layout 现在把 `initialScrollTop` 按固定行高列表总高度和视口高度钳制后，同时写入虚拟窗口 state 与真实 viewport `scrollTop`；首次程序滚动的同值 scroll event 被识别并忽略，不会误报为用户滚动。
- 外部 `selectedCellKey` 变更后先按完整数据集解析 index；目标未挂载时使用 `auto` 对齐滚入视口，但不请求 DOM focus。虚拟窗口始终为一个已挂载 option 保留 roving `tabIndex=0`，`aria-activedescendant` 始终指向实际存在的节点。
- Inspector 不再原样渲染 `error_code` 或 `inferred_reason`：`truncated_prefix` 与三类 run orphan 原因映射为受控普通用户文案，未知推断原因使用通用说明；错误码仅触发阶段类型对应的通用摘要。
- recorded failed span 仅从 `span.record_sequences` 引用的已归一化 allowlist failure/cancel event 中选取允许的 `message/reason`，不会从无关事件取错误，也不会把结构性 `inferred_reason` 冒充用户错误。
- Inspector fixture 改为调用真实 `normalizeTrajectoryRecord()` 并使用 P1 的 `terminal_source=recorded|inferred`、固定 `inferred_reason` 与 `record_sequences` 形状，覆盖 recorded failure、失败 orphan、truncated prefix、tool-attempt error code、secret 脱敏及非 allowlist 字段移除。

### TDD 证据

1. RED：`npm test -- --run src/components/chat/trajectory/TrajectoryLedger.test.tsx src/components/chat/trajectory/TrajectoryInspector.test.tsx` → 2 files failed；16 tests 中 6 failed、10 passed，退出码 1。失败分别为 DOM `scrollTop` 仍为 0、远端第 91/100 行未挂载，以及 recorded failure 无短错误、两类内部推断码被原样展示、tool-attempt 内部错误码被原样展示。
2. GREEN：同一命令 → 2 files、16 tests passed，退出码 0。
3. 恢复路径测试同时断言真实 `scrollTop=5040`、挂载范围为第 79–100 行、第 91 行存在、初始化同值 scroll event 不触发回调；随后真实用户滚动仍触发回调。
4. 受控选择测试从第 1 行 rerender 到第 91/100 行，断言目标挂载并选中、唯一 roving tab stop 位于目标、active descendant 节点存在，且账本不抢走时间线控制按钮的焦点。
5. 自审补充 RED/GREEN：空数据首次渲染后异步到达 100 行时，新增测试先复现 DOM 仍为 0，再延迟消费恢复标记；未显式传 `viewportHeight` 时，新增测试先复现 `99_999` 被 fallback 高度错误钳制为 `5040`，再改为读取真实 `clientHeight=112` 并正确钳制为 `5488`。

### 最终验证

- Task 6 聚焦：`npm test -- --run src/lib/trajectory/virtualRange.test.ts src/components/chat/trajectory/TrajectoryLedger.test.tsx src/components/chat/trajectory/TrajectoryTimeline.test.tsx src/components/chat/trajectory/TrajectoryInspector.test.tsx src/components/chat/trajectory/TrajectoryIntegrityBanner.test.tsx` → 5 files、36 tests passed，退出码 0。
- 全量：`npm test` → 190 files、2104 tests passed，退出码 0。
- 目标 ESLint：5 个本轮源/测试路径退出码 0；仅有仓库既有 `.eslintignore` 迁移 warning。
- TypeScript：`npx tsc --noEmit --pretty false` 退出码 2，仍由仓库既有页面测试、旧组件、Task 1 归一化等基线错误阻断；本轮修改的 Ledger、Inspector、virtualRange 及测试路径没有错误输出。
- `git diff --check` 退出码 0。

### 自审与 Concerns

- 三个 P1 评审问题均有对应真实组件 RED 与最终 GREEN；未引入依赖、fetch、Redux、服务或浏览器操作。
- Task 7 仍未装配页面级 `TrajectoryTabView`，因此本轮没有真实页面数据与 Chrome 用户路径证据。
- 全仓 TypeScript 基线仍非零；本轮修改路径没有新增类型错误。

---

## Fix round 2：有效高度门闩与恢复事务 identity

### 修复

- 无显式正 `viewportHeight` 时，将“虚拟窗口渲染 fallback 560”与“可消费恢复的有效高度”分离；首帧 `clientHeight=0` 只建立 ResizeObserver，不再写入 DOM 或消费恢复门闩，等首个正 `contentRect.height` 后再按真实高度钳制并恢复。
- `TrajectoryLedger` 新增可选 `restoreKey: string | number | null`。组件按该 identity 记录已完成的恢复事务；identity 变化才允许同实例以新的 `initialScrollTop` 恢复一次，同 identity 的 rows append、callback 变化、ResizeObserver 重复通知与用户滚动不会重新覆盖当前位置。
- identity 在 layout effect 成功写入 DOM/state 时才标记完成；空 rows 或无有效高度只保持待恢复，不消费事务。Strict Effect 重放会看到同 identity 已完成并直接跳过，不形成恢复循环。

### TDD 证据

1. RED：`npm test -- --run src/components/chat/trajectory/TrajectoryLedger.test.tsx` → 13 tests 中 2 failed、11 passed，退出码 1。
   - 首帧 `clientHeight=0` 时实际错误写入 `scrollTop=5040`，期望保持 0 等待首个正高度。
   - 同实例从 `restoreKey=conversation-a, initialScrollTop=5040` 切到 `conversation-b, initialScrollTop=99_999` 后实际仍为用户位置 1120，期望按 112px 视口恢复到 5488。
2. GREEN：同一命令 → 1 file、13 tests passed，退出码 0。
3. 零高度测试在 ResizeObserver 报告 112 后断言 DOM 恢复到 5488、末行挂载；用户滚到 1120 后再次报告 224，DOM 仍保持 1120。
4. identity 测试在第二个事务恢复到 5488 后让用户滚到 2240，再同时追加 rows 并更换 callback，普通 rerender 不覆盖 2240。

### 最终验证

- Task 6 聚焦：`npm test -- --run src/lib/trajectory/virtualRange.test.ts src/components/chat/trajectory/TrajectoryLedger.test.tsx src/components/chat/trajectory/TrajectoryTimeline.test.tsx src/components/chat/trajectory/TrajectoryInspector.test.tsx src/components/chat/trajectory/TrajectoryIntegrityBanner.test.tsx` → 5 files、38 tests passed，退出码 0。
- 全量：`npm test` → 190 files、2106 tests passed，退出码 0。
- 目标 ESLint：本轮 Ledger 源文件与测试退出码 0；仅有仓库既有 `.eslintignore` 迁移 warning。
- TypeScript：`npx tsc --noEmit --pretty false` 退出码 2，仍由仓库既有页面测试、旧组件、Task 1 归一化等基线错误阻断；本轮 Ledger 源文件与测试没有错误输出。

### Concerns

- Task 7 装配时必须为会话/视图恢复事务传入稳定且在新事务时变化的 `restoreKey`；同 identity 下只改变 `initialScrollTop` 按设计不会覆盖用户滚动。
- Task 7 页面装配与真实浏览器路径仍不在本任务范围；全仓 TypeScript 基线仍非零。
