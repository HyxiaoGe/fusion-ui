# Runtime Config Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将运行时配置管理页从工程字段列表改成管理员能理解的配置说明页。

**Architecture:** 新增一个纯展示 helper，负责配置元数据和 payload 摘要；`RuntimeConfigManager` 只消费 helper 结果并调整卡片信息结构。后端接口、数据结构和编辑动作保持不变。

**Tech Stack:** Next.js 15、React 19、Vitest、Testing Library、shadcn 风格 UI 组件。

---

### Task 1: 配置展示元数据

**Files:**
- Create: `src/app/settings/runtimeConfigPresentation.ts`
- Test: `src/app/settings/runtimeConfigPresentation.test.ts`

- [x] **Step 1: Write failing helper tests**

覆盖 `prompt_template/generate_title` 中文名称、未登记 fallback、payload 摘要。

- [x] **Step 2: Run helper tests to verify red**

Run: `npm test -- src/app/settings/runtimeConfigPresentation.test.ts`
Expected: FAIL because helper file does not exist.

- [x] **Step 3: Implement helper**

新增 `getRuntimeConfigPresentation()` 和 `summarizeRuntimeConfigPayload()`。

- [x] **Step 4: Run helper tests to verify green**

Run: `npm test -- src/app/settings/runtimeConfigPresentation.test.ts`
Expected: PASS.

### Task 2: 管理面板可读性改版

**Files:**
- Modify: `src/app/settings/RuntimeConfigManager.tsx`
- Modify: `src/app/settings/RuntimeConfigManager.test.tsx`

- [x] **Step 1: Write failing component tests**

覆盖当前生效配置显示中文名/影响说明/摘要，候选表单显示编辑目标说明，版本列表显示中文名。

- [x] **Step 2: Run component tests to verify red**

Run: `npm test -- src/app/settings/RuntimeConfigManager.test.tsx`
Expected: FAIL because UI still only shows engineering fields.

- [x] **Step 3: Update component rendering**

在当前生效配置、创建候选版本、版本列表中使用 presentation helper。

- [x] **Step 4: Run focused tests to verify green**

Run: `npm test -- src/app/settings/runtimeConfigPresentation.test.ts src/app/settings/RuntimeConfigManager.test.tsx`
Expected: PASS.

### Task 3: 验证与发布

**Files:**
- All changed files.

- [x] **Step 1: Run full validation**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Commit and push**

Commit message: `feat: 优化运行时配置可读性`

- [ ] **Step 3: Monitor CI/CD**

Run: `gh run watch <run_id> --exit-status`
Expected: build, tests, deploy smoke all PASS.

- [ ] **Step 4: Real Chrome regression**

复用已打开 Fusion 标签，刷新 `/settings`，确认运行时配置页签有中文配置说明且 console 无新 error。
