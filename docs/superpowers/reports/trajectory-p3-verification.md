# Fusion Trajectory P3 本地验证报告

- 验证时间：2026-08-23 06:23 CST（Asia/Shanghai）
- UI 分支：`feat/trajectory-p3-ui`
- UI 验证提交：`c092d9a468d76ca6fdd4a9a33f09860ad905628e`
- API 分支：`docs/trajectory-p3-v018`
- API 验证提交：`1e97cad0f4d56c78603fc741c8c6377f83db1ebe`
- 设计依据：`TRAJECTORY_DESIGN.md` v0.19 §8

## 已验证

### fusion-ui

- P3 聚焦测试：25 files / 481 tests passed。
- 类型门禁修复聚焦测试：2 files / 75 tests passed。
- 全量测试：195 files / 2171 tests passed。
- 生产构建：`npm run build` 通过；`/chat/[chatId]` 构建产物生成成功。
- 目标 ESLint：通过；仅保留仓库既有 `.eslintignore` 迁移提示。
- `git diff --check`：通过。
- 显式 `tsc --noEmit`：P3 自身错误已清零；仓库仍有 36 个既有基线错误，分布于 18 个非 P3 目标文件。Next.js 当前构建配置会跳过独立类型校验，因此本项不能表述为全仓 typecheck 通过。

### fusion-api

- 全量测试：2841 passed / 2 skipped / 783 subtests passed。
- 全仓 Ruff lint：通过。
- `git diff --check`：通过。
- retry/regenerate 的 `previous_run_id` 已在请求事务与最终 attempt 分配事务双重校验；陈旧显式 run 在请求阶段返回 409，最终事务关闭 TOCTOU 分叉。

## 功能门禁

- 会话级全高 Trajectory Tab、唯一 Composer、按 Run 水合、5000 事件虚拟窗口、inspect/reveal 状态保持已纳入自动化测试。
- 快照与 SSE live tail 按 `(runId, sequence)` 归并；终态执行历史快照对账。
- Agent run retry/continue 仅在 Trajectory；消息级 retry 保留。
- retry/continue 具 freshness refresh、Redux 最新状态复判、conversation single-flight 与后端 latest-attempt 原子门禁。
- 一致性闸门通过后已移除聊天中的旧 `AgentRunTimeline` 内联挂载；旧实现文件保留，等待 dev 真实回归后的独立 cleanup PR。

## 尚未验证

- 未启动本地 Fusion 服务。
- 未打开或新建 Chrome；未执行真实登录态浏览器回归。
- 未 push、未创建 PR、未运行远端 CI、未合并、未部署 dev。
- 真实 PostgreSQL 双客户端并发、多工具/知识库/失败或触顶 continuation、刷新恢复与 console/network 仍需在获得合并部署授权后，于已有登录 Chrome 标签页中验收。
