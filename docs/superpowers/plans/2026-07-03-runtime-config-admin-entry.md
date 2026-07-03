# Runtime Config 管理入口 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `fusion-ui` 设置入口中提供管理员可用的 Runtime Config 管理页签，完成查看、校验、创建候选、激活和禁用闭环。

**Architecture:** 新增 `src/lib/api/runtimeConfig.ts` 封装后端 Admin Runtime Config API；新增 `src/app/settings/RuntimeConfigManager.tsx` 承载管理 UI；`SettingsPage` 和 `SettingsDialog` 只负责把管理员页签挂进去。组件通过 API client 调后端，不直接 fetch，不新增全局状态。

**Tech Stack:** Next.js 15、React 19、Vitest、Testing Library、Tailwind、现有 shadcn/ui 基础组件。

---

### Task 1: Runtime Config API Client

**Files:**
- Create: `src/lib/api/runtimeConfig.ts`
- Test: `src/lib/api/runtimeConfig.test.ts`

- [x] 写失败测试：`fetchRuntimeConfigSnapshotAPI()` GET `/api/admin/runtime-config`。
- [x] 写失败测试：`validateRuntimeConfigAPI()` POST `/api/admin/runtime-config/validate`，body 包含 `namespace/key/payload`。
- [x] 写失败测试：`createRuntimeConfigEntryAPI()` POST `/api/admin/runtime-config`，body 包含候选版本字段。
- [x] 写失败测试：`activateRuntimeConfigEntryAPI()` POST `/api/admin/runtime-config/{id}/activate`。
- [x] 写失败测试：`setRuntimeConfigEntryActiveAPI()` PATCH `/api/admin/runtime-config/{id}/status`。
- [x] 实现类型和 API client。
- [x] 运行 `npm test -- src/lib/api/runtimeConfig.test.ts` 确认转绿。

### Task 2: Runtime Config Manager UI

**Files:**
- Create: `src/app/settings/RuntimeConfigManager.tsx`
- Test: `src/app/settings/RuntimeConfigManager.test.tsx`

- [x] 写失败测试：加载后展示 effective 和 entries。
- [x] 写失败测试：payload 不是 JSON object 时不调用后端并展示前端错误。
- [x] 写失败测试：点击“校验”展示 validate issues。
- [x] 写失败测试：点击“创建候选”先 validate，validate 通过后 create 并刷新 snapshot。
- [x] 写失败测试：点击“激活”需要确认，确认后调用 activate 并刷新 snapshot。
- [x] 写失败测试：点击“禁用”需要确认，确认后调用 status=false 并刷新 snapshot。
- [x] 实现紧凑管理 UI、加载/错误/刷新状态和操作状态。
- [x] 运行 `npm test -- src/app/settings/RuntimeConfigManager.test.tsx` 确认转绿。

### Task 3: Settings Entry Integration

**Files:**
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/page.test.tsx`
- Modify: `src/components/settings/SettingsDialog.tsx`
- Modify: `src/components/settings/SettingsDialog.test.tsx`

- [x] 写失败测试：管理员在 `/settings` 看到“运行时配置”页签。
- [x] 写失败测试：普通用户在 `/settings` 不看到“运行时配置”页签。
- [x] 写失败测试：管理员在设置弹窗看到“运行时配置”页签并能渲染管理组件。
- [x] 写失败测试：普通用户残留 `runtime-config` active tab 时回退到常规设置。
- [x] 接入 `RuntimeConfigManager`，管理员 tabs 从 3 列调整为 4 列。
- [x] 运行相关页面/弹窗测试确认转绿。

### Task 4: Verification and Release

**Files:**
- 所有上述文件和本 spec/plan。

- [x] 运行聚焦测试：`npm test -- src/lib/api/runtimeConfig.test.ts src/app/settings/RuntimeConfigManager.test.tsx src/app/settings/page.test.tsx src/components/settings/SettingsDialog.test.tsx`
- [x] 运行全量测试：`npm test`
- [x] 运行构建：`npm run build`
- [ ] 检查 `git diff --check` 和 `git status --short`，确认不纳入无关未跟踪文档。
- [ ] 中文结构化 commit，包含 `Co-Authored-By: Codex <noreply@anthropic.com>`。
- [ ] push 后监控 GitHub Actions 和 dev 部署门禁。
- [ ] 如已有可复用的登录态 Chrome 标签，做真实设置入口回归；没有则记录阻塞，不新开标签。
