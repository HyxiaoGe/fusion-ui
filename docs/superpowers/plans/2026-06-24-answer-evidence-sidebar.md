# 回答依据统一侧栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将旧搜索来源侧栏升级为统一“回答依据”侧栏，让搜索、URL 读取、失败、降级和中断原因能在一个入口里展开查看。

**Architecture:** 新增纯数据模型 `answerEvidenceSidebarModel` 负责从 `AnswerEvidenceModel`、`SearchBlock`、`UrlBlock[]` 派生侧栏数据；新增 `AnswerEvidenceSidebar` 负责右侧抽屉渲染；`AssistantMessage` 集成新侧栏，`AnswerEvidence` 调整入口文案和异常-only 入口。

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, lucide-react。

---

### Task 1: Sidebar 数据模型

**Files:**
- Create: `src/components/chat/answerEvidenceSidebarModel.ts`
- Test: `src/components/chat/answerEvidenceSidebarModel.test.ts`

- [x] **Step 1: Write failing tests**

Cover these cases in `answerEvidenceSidebarModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SearchBlock, UrlBlock } from '@/types/conversation';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import { deriveAnswerEvidenceSidebar } from './answerEvidenceSidebarModel';

const answerEvidence: AnswerEvidenceModel = {
  items: [
    {
      id: 'search-0',
      kind: 'search_source',
      title: '搜索来源',
      url: 'https://search.example.com/a',
      domain: 'search.example.com',
      sourceIndex: 0,
    },
    {
      id: 'url-url-1',
      kind: 'url_read',
      title: '读取来源',
      url: 'https://reader.example.com/a',
      domain: 'reader.example.com',
    },
  ],
  previewItems: [],
  searchCount: 1,
  urlCount: 1,
  totalCount: 2,
  hiddenSearchCount: 0,
  hiddenUrlCount: 0,
  summary: '回答依据 · 搜索 1 条 · 读取 1 个网页',
  hasSearchSources: true,
};

describe('deriveAnswerEvidenceSidebar', () => {
  it('uses answer evidence items as used sources', () => {
    const model = deriveAnswerEvidenceSidebar({
      answerEvidence,
      searchBlock: null,
      urlBlocks: [],
    });

    expect(model).not.toBeNull();
    expect(model?.summary).toMatchObject({
      usedCount: 2,
      searchCount: 1,
      urlCount: 1,
      issueCount: 0,
    });
    expect(model?.usedItems.map(item => item.title)).toEqual(['搜索来源', '读取来源']);
  });

  it('collects failed degraded and interrupted url blocks as issue items', () => {
    const urlBlocks: UrlBlock[] = [
      { type: 'url_read', id: 'u1', url: 'https://failed.example.com', status: 'failed', error_message: 'timeout' },
      { type: 'url_read', id: 'u2', url: 'https://degraded.example.com', status: 'degraded' },
      { type: 'url_read', id: 'u3', url: 'https://interrupted.example.com', status: 'interrupted' },
    ];

    const model = deriveAnswerEvidenceSidebar({ answerEvidence: null, searchBlock: null, urlBlocks });

    expect(model?.usedItems).toEqual([]);
    expect(model?.issueItems).toHaveLength(3);
    expect(model?.issueItems[0]).toMatchObject({
      title: 'https://failed.example.com',
      status: 'failed',
      reason: 'timeout',
    });
  });

  it('collects non-success source refs as issues and deduplicates by url', () => {
    const searchBlock: SearchBlock = {
      type: 'search',
      id: 's1',
      query: 'AI 标准',
      sources: [],
      source_refs: [
        { kind: 'url_read', title: '失败页面', url: 'https://dup.example.com', status: 'failed', error_message: 'timeout' },
        { kind: 'url_read', title: '重复失败页面', url: 'https://dup.example.com', status: 'failed', error_message: 'timeout' },
        { kind: 'search', title: '降级搜索', url: 'https://search.example.com', status: 'degraded' },
      ],
    };

    const model = deriveAnswerEvidenceSidebar({ answerEvidence: null, searchBlock, urlBlocks: [] });

    expect(model?.issueItems).toHaveLength(2);
    expect(model?.issueItems.map(item => item.title)).toEqual(['失败页面', '降级搜索']);
  });
});
```

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/components/chat/answerEvidenceSidebarModel.test.ts
```

Expected: fail because `answerEvidenceSidebarModel.ts` does not exist.

- [x] **Step 3: Implement model**

Create `deriveAnswerEvidenceSidebar(input)` with:

- `usedItems`: mapped from `answerEvidence.items`.
- `issueItems`: collected from non-success `source_refs`, failed/degraded/interrupted `SearchBlock`, and failed/degraded/interrupted `UrlBlock`.
- `summary`: `{ usedCount, searchCount, urlCount, issueCount }`.
- `isRenderable`: true when used or issue item exists.
- `null` when no used and no issue item.

- [x] **Step 4: Verify model tests pass**

Run:

```bash
npm test -- src/components/chat/answerEvidenceSidebarModel.test.ts
```

Expected: pass.

### Task 2: 统一回答依据侧栏组件

**Files:**
- Create: `src/components/chat/AnswerEvidenceSidebar.tsx`
- Test: `src/components/chat/AnswerEvidenceSidebar.test.tsx`

- [x] **Step 1: Write failing tests**

Cover:

- Renders summary, used section, issue section.
- Close button calls `onClose`.
- `highlightIndex` highlights matching search item.
- External links expose correct `href` and aria label.

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/components/chat/AnswerEvidenceSidebar.test.tsx
```

Expected: fail because component does not exist.

- [x] **Step 3: Implement component**

Build right drawer with:

- `w-[440px]`, overlay, ESC close.
- Header `回答依据`, close button aria-label `关闭回答依据`.
- Summary line: `已使用 X 条 · 搜索 Y 条 · 读取 Z 个网页`, issue chip when `issueCount > 0`.
- `已使用来源` section using search/url icons and external link button.
- `未使用或异常` section using status text and reason.
- Highlight support for used search items by `sourceIndex`.

- [x] **Step 4: Verify component tests pass**

Run:

```bash
npm test -- src/components/chat/AnswerEvidenceSidebar.test.tsx
```

Expected: pass.

### Task 3: 集成入口和回归

**Files:**
- Modify: `src/components/chat/AnswerEvidence.tsx`
- Modify: `src/components/chat/AssistantMessage.tsx`
- Modify: `src/components/chat/AssistantMessage.test.tsx`
- Modify: `src/components/chat/AnswerEvidence.test.tsx`
- Optionally delete: `src/components/chat/SourcesSidebar.tsx` if no imports remain.

- [x] **Step 1: Write failing integration tests**

Add/adjust tests:

- `AnswerEvidence` button text becomes `查看全部依据`.
- It appears when there are hidden URL items, not only hidden search items.
- `AssistantMessage` renders `AnswerEvidenceSidebar` instead of `SourcesSidebar`.
- Markdown citation opens unified sidebar and preserves highlight index.
- URL-only answer can open sidebar.

- [x] **Step 2: Verify integration tests fail**

Run:

```bash
npm test -- src/components/chat/AnswerEvidence.test.tsx src/components/chat/AssistantMessage.test.tsx
```

Expected: fail on old labels/imports/sidebar.

- [x] **Step 3: Implement integration**

- Replace `SourcesSidebar` import/usage with `AnswerEvidenceSidebar`.
- Derive sidebar model inside `AssistantMessageFrame` from `answerEvidence`, `activity.searchBlock`, `activity.urlBlocks`.
- Keep Markdown `sources` prop as `searchSources` so citation chips still map to search references.
- Pass `highlightIndex/highlightTick` to new sidebar.
- Update `AnswerEvidence` prop shape if needed to show issue-only entry.

- [x] **Step 4: Run affected tests**

Run:

```bash
npm test -- src/components/chat/answerEvidenceSidebarModel.test.ts src/components/chat/AnswerEvidenceSidebar.test.tsx src/components/chat/AnswerEvidence.test.tsx src/components/chat/AssistantMessage.test.tsx src/components/chat/ChatMessage.test.tsx src/components/chat/AssistantResponseStack.test.tsx
```

Expected: pass.

- [x] **Step 5: Static checks**

Run:

```bash
npx tsc --noEmit
```

Expected: may still fail on existing repository-wide unused/type issues; if failures touch this task's files, fix them. Also run:

```bash
npm test -- src/components/chat/answerEvidenceSidebarModel.test.ts src/components/chat/AnswerEvidenceSidebar.test.tsx src/components/chat/AnswerEvidence.test.tsx src/components/chat/AssistantMessage.test.tsx
```

Expected: pass.
