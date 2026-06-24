# 回答依据统一来源适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端消费后端新增的 `source_refs/source_count/status/error_message`，让“回答依据”优先使用统一来源口径，并保留旧消息 fallback。

**Architecture:** 后端新增字段是向后兼容扩展，前端只在类型、历史 hydrate、回答依据模型三处接入。`source_refs` 作为统一来源列表优先级最高；没有新字段时继续使用旧的 `sources` 和 `url_read` blocks。

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest。

---

### Task 1: 接入统一来源字段

**Files:**
- Modify: `src/types/conversation.ts`
- Modify: `src/lib/chat/conversationHydration.ts`
- Modify: `src/components/chat/answerEvidenceModel.ts`
- Modify: `src/components/chat/useAssistantMessageViewModel.ts`
- Test: `src/components/chat/answerEvidenceModel.test.ts`
- Test: `src/components/chat/useAssistantMessageViewModel.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests proving:
- `deriveAnswerEvidence()` uses `sourceRefs` before legacy `sources/urlBlocks`.
- degraded/failed `url_read` without `sourceRefs` does not create normal answer evidence.
- view model derives answer evidence from `source_refs` on hydrated history messages.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/components/chat/answerEvidenceModel.test.ts src/components/chat/useAssistantMessageViewModel.test.tsx
```

Expected: tests fail because current code ignores `sourceRefs/status`.

- [ ] **Step 3: Implement minimal support**

Update frontend types:
- `SourceReference` with `kind: 'search' | 'url_read'`, `title`, `url`, optional `domain`, `favicon`, `tool_call_log_id`.
- `SearchBlock` optional `status`, `error_message`, `source_count`, `source_refs`.
- `UrlBlock` optional `status`, `error_message`, `source_count`, `source_refs`.

Update hydrate:
- Preserve those optional fields from server blocks.

Update answer evidence:
- Input accepts `sourceRefs?: SourceReference[]`.
- If `sourceRefs` is non-empty, build evidence from it and ignore legacy inputs to avoid duplicate/mismatched counts.
- Legacy fallback keeps old behavior.
- Failed/degraded `url_read` without `source_refs` is excluded from normal evidence.

Update view model:
- Pass source refs from the current search block and URL blocks into `deriveAnswerEvidence()`.

- [ ] **Step 4: Verify target tests pass**

Run:

```bash
npm test -- src/components/chat/answerEvidenceModel.test.ts src/components/chat/useAssistantMessageViewModel.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Verify broader affected tests**

Run:

```bash
npm test -- src/components/chat/ChatMessage.test.tsx src/components/chat/AnswerEvidence.test.tsx src/lib/chat/conversationHydration.test.ts
```

Expected: all selected tests pass. If a test file does not exist, replace it with the nearest existing hydrate/API test after checking `rg -n "conversationHydration" src`.
