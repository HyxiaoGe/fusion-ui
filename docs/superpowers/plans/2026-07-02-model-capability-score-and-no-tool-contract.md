# 模型能力评分与非工具模型约束 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让模型选择器能用评分和短句推荐模型适用场景，同时锁住不支持联网工具的模型不能伪装实时查询。

**Architecture:** 前端只基于 `/api/models/` 已有字段派生评分，不改变 API/SSE 协议，也不自动替换用户选定模型。后端保持无工具模型 system prompt 约束，并用测试覆盖流式和非流式注入路径。

**Tech Stack:** Next.js/React/Vitest, FastAPI/Python unittest。

---

### Task 1: 前端能力评分纯函数

**Files:**
- Modify: `src/lib/models/modelCapabilityPresentation.ts`
- Test: `src/lib/models/modelCapabilityPresentation.test.ts`

- [ ] 增加 `buildModelCapabilityRecommendation(model)`，返回 `{ score, level, headline, reasons, warnings }`。
- [ ] 评分只使用已有字段：`searchCapable/agentTools/webSearch`、`vision`、`deepThinking`、`contextWindowTokens`、`health.status`。
- [ ] 健康异常模型必须降级为“不建议使用”；不支持联网模型必须给出实时信息边界 warning。
- [ ] 测试覆盖联网读图长上下文模型、普通文本模型、不可用模型。

### Task 2: 模型选择器展示推荐

**Files:**
- Modify: `src/components/models/ModelSelectorPanel.tsx`
- Test: `src/components/models/ModelSelectorPanel.test.tsx`

- [ ] 在模型卡片中展示推荐短句和评分等级，例如“推荐：实时资料与复杂任务”。
- [ ] 不新增复杂筛选/排序，不改变用户选择逻辑。
- [ ] 保持卡片紧凑，避免抢占聊天正文视觉层级。
- [ ] 测试覆盖推荐短句、非联网 warning、不可用模型降级文案。

### Task 3: 非工具模型回答约束补强

**Files:**
- Modify: `app/ai/prompts/agent_loop.py`
- Test: `test/services/stream/test_agent_loop_request_prep.py`, `test/test_chat_service.py`

- [ ] 保持无联网工具时注入 `NO_TOOL_NETWORK_BOUNDARY_PROMPT`。
- [ ] 明确约束：实时问题要先说明无法实时核验，再基于已有知识谨慎回答；普通稳定问题不主动解释工具能力。
- [ ] 测试覆盖流式 agent loop 和非流式 chat 路径。

### Task 4: 验证与发布

**Files:**
- No production files beyond Tasks 1-3.

- [ ] 先运行新增/修改测试确认红测失败。
- [ ] 实现后运行相关 Vitest、Python unittest、ruff。
- [ ] 前端涉及组件渲染，运行 `npm run build`。
- [ ] 分仓提交、push，并跟踪 GitHub Actions/dev smoke。
