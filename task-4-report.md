# Task 4：Tool Node Detail client 与可取消懒加载报告

## 交付

- 实现提交：`42d2f39 feat: 增加轨迹工具详情按需读取`
- 范围：普通用户 Tool Detail wire DTO、普通 `/api/conversations/.../node-detail/tool/...` client，以及 `useTrajectoryToolNodeDetail`。
- 未调用管理员审计端点；未修改 `TrajectoryTabView`、Timeline、Ledger、Inspector 或聊天壳。

## TDD

- Red：先新增 client/hook 测试并运行 `npx vitest run src/lib/api/trajectory.test.ts src/hooks/useTrajectoryToolNodeDetail.test.ts`。预期失败：`getTrajectoryToolNodeDetail is not a function`，且 `useTrajectoryToolNodeDetail` 模块不存在。
- Green：实现最小 wire type、路径编码 client 与窄 hook 后，运行 `npx vitest run --pool=forks --maxWorkers=1 --no-file-parallelism src/lib/api/trajectory.test.ts src/hooks/useTrajectoryToolNodeDetail.test.ts`，`14 passed`。

## 验证

- 回归：`npx vitest run --pool=forks --maxWorkers=1 --no-file-parallelism src/lib/api/trajectory.test.ts src/hooks/useTrajectoryToolNodeDetail.test.ts src/hooks/useConversationTrajectory.test.ts`，`33 passed`。
- 定向 ESLint：通过；仅输出仓库现有 `.eslintignore` 迁移警告。
- `npx tsc --noEmit`：修改前后均为既有 51 行错误输出，逐行 diff 无新增错误。
- `git diff --check`：通过。

## 行为覆盖

- 所有路径段 `encodeURIComponent`、signal 透传、wire DTO 原样返回。
- disabled、identity 不完整、非 Tool identity 零请求。
- identity 切换/卸载 abort，A 的迟到成功或失败均不能覆盖 B。
- retry 仅针对当前 identity；请求失败不保留上个节点数据。
- `available`、`pending`、`not_recorded`、`degraded` 均保留为 `ready` 业务响应。

## 疑虑

- 无实现阻塞。Task 6 仍需决定何时把 `enabled` 置为 true，以满足 Payload/Result 的真正点击后加载与 pending 的有界重试。
