# 回答依据区统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 assistant 消息里的搜索来源、URL 读取结果和参考入口收敛为一个“回答依据”区域，保留正文引用侧栏和 URL 外链能力，消除 `SourcesPanel`、`UrlCard`、底部“参考 N 篇资料”三套入口并存的问题。

**Architecture:** 新增纯数据 helper `answerEvidenceModel.ts` 将 `SearchSourceSummary[]` 和 `UrlBlock[]` 派生为统一 evidence model；新增 `AnswerEvidence.tsx` 渲染紧凑资料栏；`ChatMessage.tsx` 只负责把现有 `searchSources` 和 `activity.urlBlocks` 接入新组件，并继续把 Markdown 引用交给 `SourcesSidebar`。

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, React Testing Library, Tailwind CSS, lucide-react。

---

## 执行原则

- [ ] 不启动本地 Fusion dev server，不运行 `npm run dev`、`npm run dev:next`、`next dev` 或任何本地 API 服务。
- [ ] 先写测试，再写实现；每个 worker 的变更要能独立跑对应测试。
- [ ] 只改前端展示层和测试，不改后端 schema、SSE、Redux store、Dexie、Markdown 引用解析。
- [ ] 不删除旧组件文件，除非确认没有引用且删除不会扩大范围；第一阶段只从 `ChatMessage` 接入路径移除旧入口。
- [ ] 所有提交信息使用中文，并包含 `Co-Authored-By: Codex <noreply@anthropic.com>`。

## Subagent-Driven 分工

- [ ] Worker A：实现 `answerEvidenceModel.ts` 和 `AnswerEvidence.tsx`，覆盖 helper 与组件测试。
- [ ] Worker B：接入 `ChatMessage.tsx`，更新 `ChatMessage.test.tsx` 回归用例。
- [ ] Main agent：审查两个 worker 的 diff，合并冲突，跑完整验证，提交并推送。

---

## Task 1: 新增 answerEvidenceModel 纯数据 helper

**Files:**

- `src/components/chat/answerEvidenceModel.ts`
- `src/components/chat/answerEvidenceModel.test.ts`

### 1.1 先写 helper 测试

- [ ] 新增 `src/components/chat/answerEvidenceModel.test.ts`，内容如下：

```ts
import { describe, expect, it } from 'vitest';
import { deriveAnswerEvidence } from './answerEvidenceModel';
import type { SearchSourceSummary, UrlBlock } from '@/types/conversation';

const searchSources: SearchSourceSummary[] = [
  { title: 'Semafor AI Standards', url: 'https://www.semafor.com/article/ai-standards', favicon: 'https://www.semafor.com/favicon.ico' },
  { title: 'Let Data Science G7', url: 'https://letsdatascience.com/news/g7-ai', favicon: 'https://letsdatascience.com/favicon.ico' },
];

const urlBlocks: UrlBlock[] = [
  { type: 'url_read', id: 'url-1', url: 'https://www.example.com/post/1', title: 'Example Post', favicon: 'https://www.example.com/favicon.ico' },
  { type: 'url_read', id: 'url-2', url: 'https://docs.example.com/guide', title: 'Guide' },
];

describe('deriveAnswerEvidence', () => {
  it('无搜索来源和 URL 读取时返回 null', () => {
    expect(deriveAnswerEvidence({ searchSources: [], urlBlocks: [] })).toBeNull();
  });

  it('把搜索来源转换成 search_source evidence items', () => {
    const evidence = deriveAnswerEvidence({ searchSources, urlBlocks: [] });

    expect(evidence?.summary).toBe('回答依据 · 搜索 2 条');
    expect(evidence?.searchCount).toBe(2);
    expect(evidence?.urlCount).toBe(0);
    expect(evidence?.items[0]).toMatchObject({
      id: 'search-0',
      kind: 'search_source',
      sourceIndex: 0,
      title: 'Semafor AI Standards',
      url: 'https://www.semafor.com/article/ai-standards',
      domain: 'semafor.com',
    });
  });

  it('把 URL 读取 block 转换成 url_read evidence items', () => {
    const evidence = deriveAnswerEvidence({ searchSources: [], urlBlocks });

    expect(evidence?.summary).toBe('回答依据 · 读取 2 个网页');
    expect(evidence?.searchCount).toBe(0);
    expect(evidence?.urlCount).toBe(2);
    expect(evidence?.items[0]).toMatchObject({
      id: 'url-url-1',
      kind: 'url_read',
      title: 'Example Post',
      url: 'https://www.example.com/post/1',
      domain: 'example.com',
    });
  });

  it('搜索来源和 URL 读取同时存在时生成组合摘要', () => {
    const evidence = deriveAnswerEvidence({ searchSources, urlBlocks });

    expect(evidence?.summary).toBe('回答依据 · 搜索 2 条 · 读取 2 个网页');
    expect(evidence?.totalCount).toBe(4);
    expect(evidence?.hasSearchSources).toBe(true);
  });

  it('domain 解析失败时回退到原始 URL', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [{ title: 'Bad URL', url: 'not a url' }],
      urlBlocks: [{ type: 'url_read', id: 'bad-url', url: 'also bad' }],
    });

    expect(evidence?.items[0].domain).toBe('not a url');
    expect(evidence?.items[1].domain).toBe('also bad');
  });

  it('有 URL 读取时预览至少保留一个 URL item', () => {
    const evidence = deriveAnswerEvidence({
      previewLimit: 3,
      searchSources: [
        ...searchSources,
        { title: 'Source 3', url: 'https://source3.example.com' },
        { title: 'Source 4', url: 'https://source4.example.com' },
      ],
      urlBlocks: [urlBlocks[0]],
    });

    expect(evidence?.previewItems).toHaveLength(3);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(2);
    expect(evidence?.previewItems.some(item => item.kind === 'url_read')).toBe(true);
  });

  it('只有 URL 读取超过预览上限时统计隐藏网页数量', () => {
    const evidence = deriveAnswerEvidence({
      previewLimit: 3,
      searchSources: [],
      urlBlocks: [
        ...urlBlocks,
        { type: 'url_read', id: 'url-3', url: 'https://third.example.com', title: 'Third' },
        { type: 'url_read', id: 'url-4', url: 'https://fourth.example.com', title: 'Fourth' },
      ],
    });

    expect(evidence?.previewItems).toHaveLength(3);
    expect(evidence?.hiddenUrlCount).toBe(1);
  });
});
```

### 1.2 实现 helper

- [ ] 新增 `src/components/chat/answerEvidenceModel.ts`，内容如下：

```ts
import type { SearchSourceSummary, UrlBlock } from '@/types/conversation';

export type AnswerEvidenceKind = 'search_source' | 'url_read';

export interface AnswerEvidenceItem {
  id: string;
  kind: AnswerEvidenceKind;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  sourceIndex?: number;
}

export interface AnswerEvidenceModel {
  items: AnswerEvidenceItem[];
  previewItems: AnswerEvidenceItem[];
  searchCount: number;
  urlCount: number;
  totalCount: number;
  hiddenUrlCount: number;
  summary: string;
  hasSearchSources: boolean;
}

interface DeriveAnswerEvidenceInput {
  searchSources: SearchSourceSummary[];
  urlBlocks: UrlBlock[];
  previewLimit?: number;
}

export function deriveAnswerEvidence(input: DeriveAnswerEvidenceInput): AnswerEvidenceModel | null {
  const previewLimit = Math.max(1, input.previewLimit ?? 3);
  const searchItems = input.searchSources.map(toSearchItem);
  const urlItems = input.urlBlocks.map(toUrlItem);
  const items = [...searchItems, ...urlItems];

  if (items.length === 0) {
    return null;
  }

  const previewItems = pickPreviewItems(searchItems, urlItems, previewLimit);
  const visibleUrlCount = previewItems.filter(item => item.kind === 'url_read').length;

  return {
    items,
    previewItems,
    searchCount: searchItems.length,
    urlCount: urlItems.length,
    totalCount: items.length,
    hiddenUrlCount: Math.max(0, urlItems.length - visibleUrlCount),
    summary: buildSummary(searchItems.length, urlItems.length),
    hasSearchSources: searchItems.length > 0,
  };
}

function toSearchItem(source: SearchSourceSummary, index: number): AnswerEvidenceItem {
  return {
    id: `search-${index}`,
    kind: 'search_source',
    title: normalizeTitle(source.title, source.url),
    url: source.url,
    domain: getDomain(source.url),
    favicon: source.favicon,
    sourceIndex: index,
  };
}

function toUrlItem(block: UrlBlock): AnswerEvidenceItem {
  return {
    id: `url-${block.id}`,
    kind: 'url_read',
    title: normalizeTitle(block.title, block.url),
    url: block.url,
    domain: getDomain(block.url),
    favicon: block.favicon,
  };
}

function pickPreviewItems(
  searchItems: AnswerEvidenceItem[],
  urlItems: AnswerEvidenceItem[],
  limit: number,
): AnswerEvidenceItem[] {
  if (searchItems.length === 0) {
    return urlItems.slice(0, limit);
  }

  if (urlItems.length === 0) {
    return searchItems.slice(0, limit);
  }

  if (limit === 1) {
    return [urlItems[0]];
  }

  return [
    ...searchItems.slice(0, limit - 1),
    urlItems[0],
  ].slice(0, limit);
}

function buildSummary(searchCount: number, urlCount: number): string {
  const parts: string[] = ['回答依据'];

  if (searchCount > 0) {
    parts.push(`搜索 ${searchCount} 条`);
  }

  if (urlCount > 0) {
    parts.push(`读取 ${urlCount} 个网页`);
  }

  return parts.join(' · ');
}

function normalizeTitle(title: string | undefined, fallback: string): string {
  const normalized = title?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
```

### 1.3 验证 Task 1

- [ ] 运行：

```bash
npm test -- src/components/chat/answerEvidenceModel.test.ts
```

**Expected:** `answerEvidenceModel.test.ts` 全部通过。

- [ ] 提交：

```bash
git add src/components/chat/answerEvidenceModel.ts src/components/chat/answerEvidenceModel.test.ts
git commit -m "feat: 添加回答依据数据派生" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

## Task 2: 新增 AnswerEvidence 展示组件

**Files:**

- `src/components/chat/AnswerEvidence.tsx`
- `src/components/chat/AnswerEvidence.test.tsx`

### 2.1 先写组件测试

- [ ] 新增 `src/components/chat/AnswerEvidence.test.tsx`，内容如下：

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnswerEvidence from './AnswerEvidence';
import { deriveAnswerEvidence } from './answerEvidenceModel';
import type { SearchSourceSummary, UrlBlock } from '@/types/conversation';

const sources: SearchSourceSummary[] = [
  { title: 'Global AI Standards Forum', url: 'https://www.semafor.com/article/g7-ai', favicon: 'https://www.semafor.com/favicon.ico' },
  { title: 'AI CEOs Attend G7', url: 'https://letsdatascience.com/news/g7-ai' },
  { title: '第三条来源', url: 'https://third.example.com' },
  { title: '第四条来源', url: 'https://fourth.example.com' },
];

const urls: UrlBlock[] = [
  { type: 'url_read', id: 'url-1', url: 'https://www.example.com/article', title: 'Example Article' },
  { type: 'url_read', id: 'url-2', url: 'https://docs.example.com/guide', title: 'Guide' },
  { type: 'url_read', id: 'url-3', url: 'https://third.example.com/page', title: 'Third Page' },
  { type: 'url_read', id: 'url-4', url: 'https://fourth.example.com/page', title: 'Fourth Page' },
];

describe('AnswerEvidence', () => {
  it('没有 evidence 时不渲染', () => {
    const { container } = render(
      <AnswerEvidence evidence={null} onSourceClick={vi.fn()} onOpenSources={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('渲染搜索来源摘要并支持打开对应来源', () => {
    const onSourceClick = vi.fn();
    const evidence = deriveAnswerEvidence({ searchSources: sources.slice(0, 1), urlBlocks: [] });

    render(
      <AnswerEvidence evidence={evidence} onSourceClick={onSourceClick} onOpenSources={vi.fn()} />,
    );

    expect(screen.getByText('回答依据 · 搜索 1 条')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看来源：Global AI Standards Forum' }));
    expect(onSourceClick).toHaveBeenCalledWith(0);
  });

  it('渲染 URL 读取摘要和外部链接', () => {
    const evidence = deriveAnswerEvidence({ searchSources: [], urlBlocks: urls.slice(0, 1) });

    render(
      <AnswerEvidence evidence={evidence} onSourceClick={vi.fn()} onOpenSources={vi.fn()} />,
    );

    expect(screen.getByText('回答依据 · 读取 1 个网页')).toBeTruthy();
    const link = screen.getByRole('link', { name: '打开网页：Example Article' });
    expect(link).toHaveAttribute('href', 'https://www.example.com/article');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('搜索来源和 URL 读取同时存在时渲染组合摘要', () => {
    const evidence = deriveAnswerEvidence({ searchSources: sources.slice(0, 2), urlBlocks: urls.slice(0, 1) });

    render(
      <AnswerEvidence evidence={evidence} onSourceClick={vi.fn()} onOpenSources={vi.fn()} />,
    );

    expect(screen.getByText('回答依据 · 搜索 2 条 · 读取 1 个网页')).toBeTruthy();
    expect(screen.getByRole('link', { name: '打开网页：Example Article' })).toBeTruthy();
  });

  it('存在更多搜索来源时点击查看全部打开来源侧栏', () => {
    const onOpenSources = vi.fn();
    const evidence = deriveAnswerEvidence({ searchSources: sources, urlBlocks: [] });

    render(
      <AnswerEvidence evidence={evidence} onSourceClick={vi.fn()} onOpenSources={onOpenSources} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看全部参考资料' }));
    expect(onOpenSources).toHaveBeenCalledTimes(1);
  });

  it('只有 URL 读取超出预览上限时显示隐藏网页数量，不打开空侧栏', () => {
    const evidence = deriveAnswerEvidence({ searchSources: [], urlBlocks: urls });

    render(
      <AnswerEvidence evidence={evidence} onSourceClick={vi.fn()} onOpenSources={vi.fn()} />,
    );

    expect(screen.getByText('另有 1 个网页')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '查看全部参考资料' })).toBeNull();
  });

  it('长标题保留 title 并使用 truncate', () => {
    const longTitle = '这是一个非常非常长的来源标题，用来验证桌面端回答依据条目的单行截断行为';
    const evidence = deriveAnswerEvidence({
      searchSources: [{ title: longTitle, url: 'https://long.example.com/path' }],
      urlBlocks: [],
    });

    render(
      <AnswerEvidence evidence={evidence} onSourceClick={vi.fn()} onOpenSources={vi.fn()} />,
    );

    expect(screen.getByTitle(longTitle)).toHaveClass('truncate');
  });
});
```

### 2.2 实现组件

- [ ] 新增 `src/components/chat/AnswerEvidence.tsx`，内容如下：

```tsx
'use client';

import React from 'react';
import { ExternalLink, FileSearch, Globe2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnswerEvidenceItem, AnswerEvidenceModel } from './answerEvidenceModel';

interface AnswerEvidenceProps {
  evidence: AnswerEvidenceModel | null;
  onSourceClick: (index: number) => void;
  onOpenSources: () => void;
}

const itemClass = cn(
  'group/evidence flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left',
  'transition-colors duration-fast hover:bg-muted/60',
);

const AnswerEvidence: React.FC<AnswerEvidenceProps> = ({
  evidence,
  onSourceClick,
  onOpenSources,
}) => {
  if (!evidence || evidence.totalCount === 0) {
    return null;
  }

  const showOpenAll = evidence.hasSearchSources && evidence.totalCount > evidence.previewItems.length;

  return (
    <div className="mb-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        <FileSearch className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{evidence.summary}</span>
        {showOpenAll ? (
          <button
            type="button"
            aria-label="查看全部参考资料"
            onClick={onOpenSources}
            className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            查看全部 {evidence.totalCount} 条
          </button>
        ) : null}
        {!evidence.hasSearchSources && evidence.hiddenUrlCount > 0 ? (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/80">
            另有 {evidence.hiddenUrlCount} 个网页
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 flex-col gap-1">
        {evidence.previewItems.map(item => (
          <EvidenceRow
            key={item.id}
            item={item}
            onSourceClick={onSourceClick}
          />
        ))}
      </div>
    </div>
  );
};

interface EvidenceRowProps {
  item: AnswerEvidenceItem;
  onSourceClick: (index: number) => void;
}

const EvidenceRow: React.FC<EvidenceRowProps> = ({ item, onSourceClick }) => {
  if (item.kind === 'url_read') {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开网页：${item.title}`}
        className={cn(itemClass, 'no-underline')}
      >
        <EvidenceIcon item={item} />
        <EvidenceText item={item} />
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover/evidence:opacity-100" />
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={`查看来源：${item.title}`}
      onClick={() => {
        if (typeof item.sourceIndex === 'number') {
          onSourceClick(item.sourceIndex);
        }
      }}
      className={itemClass}
    >
      <EvidenceIcon item={item} />
      <EvidenceText item={item} />
    </button>
  );
};

const EvidenceIcon: React.FC<{ item: AnswerEvidenceItem }> = ({ item }) => {
  if (item.favicon) {
    return (
      <img
        src={item.favicon}
        alt=""
        className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  const Icon = item.kind === 'search_source' ? Search : Globe2;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />;
};

const EvidenceText: React.FC<{ item: AnswerEvidenceItem }> = ({ item }) => (
  <span className="flex min-w-0 flex-1 items-center gap-2">
    <span className="max-w-[120px] shrink-0 truncate text-[11px] font-medium text-foreground/80">
      {item.domain}
    </span>
    <span title={item.title} className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
      {item.title}
    </span>
  </span>
);

export default AnswerEvidence;
```

### 2.3 验证 Task 2

- [ ] 运行：

```bash
npm test -- src/components/chat/answerEvidenceModel.test.ts src/components/chat/AnswerEvidence.test.tsx
```

**Expected:** helper 和组件测试全部通过。

- [ ] 提交：

```bash
git add src/components/chat/AnswerEvidence.tsx src/components/chat/AnswerEvidence.test.tsx
git commit -m "feat: 添加回答依据组件" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

## Task 3: 接入 ChatMessage 并移除分散入口

**Files:**

- `src/components/chat/ChatMessage.tsx`
- `src/components/chat/ChatMessage.test.tsx`

### 3.1 先更新 ChatMessage 回归测试

- [ ] 在 `src/components/chat/ChatMessage.test.tsx` 现有 mock 区域，`ProviderIcon` mock 后、`import ChatMessage` 前加入旧组件哨兵 mock：

```tsx
vi.mock('./SourcesPanel', () => ({
  default: () => <div data-testid="old-sources-panel">旧来源入口</div>,
}));

vi.mock('./UrlCard', () => ({
  default: () => <div data-testid="old-url-card">旧 URL 卡片</div>,
}));
```

- [ ] 在 `describe('ChatMessage', () => {` 对应的测试套件内新增这些测试：

```tsx
it('搜索结果通过 AnswerEvidence 展示，不再渲染旧 SourcesPanel 和底部参考入口', () => {
  render(
    <ChatMessage
      message={{
        id: 'assistant-1',
        role: 'assistant',
        content: [
          {
            type: 'search',
            id: 'search-1',
            query: 'Global AI Standards Forum',
            sources: [
              {
                title: 'Global AI Standards Forum G7 functions governance',
                url: 'https://www.semafor.com/article/g7-ai',
              },
            ],
          },
          { type: 'text', id: 'text-1', text: '这是联网回答。[1]' },
        ],
        timestamp: 1,
        chatId: 'chat-1',
      }}
    />,
  );

  expect(screen.getByText('回答依据 · 搜索 1 条')).toBeTruthy();
  expect(screen.getByRole('button', { name: '查看来源：Global AI Standards Forum G7 functions governance' })).toBeTruthy();
  expect(screen.queryByTestId('old-sources-panel')).toBeNull();
  expect(screen.queryByText(/参考 \d+ 篇资料/)).toBeNull();
});

it('URL 读取结果通过 AnswerEvidence 展示，不再渲染旧 UrlCard', () => {
  render(
    <ChatMessage
      message={{
        id: 'assistant-1',
        role: 'assistant',
        content: [
          {
            type: 'url_read',
            id: 'url-1',
            url: 'https://www.example.com/article',
            title: 'Example Article',
          },
          { type: 'text', id: 'text-1', text: '已读取页面并回答。' },
        ],
        timestamp: 1,
        chatId: 'chat-1',
      }}
    />,
  );

  expect(screen.getByText('回答依据 · 读取 1 个网页')).toBeTruthy();
  expect(screen.getByRole('link', { name: '打开网页：Example Article' })).toHaveAttribute('href', 'https://www.example.com/article');
  expect(screen.queryByTestId('old-url-card')).toBeNull();
});

it('正文 Markdown 引用仍能打开来源侧栏', () => {
  render(
    <ChatMessage
      message={{
        id: 'assistant-1',
        role: 'assistant',
        content: [
          {
            type: 'search',
            id: 'search-1',
            query: 'AI Standards',
            sources: [
              {
                title: 'AI Standards Source',
                url: 'https://source.example.com/article',
              },
            ],
          },
          { type: 'text', id: 'text-1', text: '引用来源[1]。' },
        ],
        timestamp: 1,
        chatId: 'chat-1',
      }}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '查看参考资料 1：AI Standards Source' }));
  expect(screen.getByText('参考资料')).toBeTruthy();
  expect(screen.getAllByText('AI Standards Source').length).toBeGreaterThan(0);
});

it('thinking 文本提到搜索时不生成回答依据区', () => {
  selectorState.stream.messageId = 'assistant-1';
  selectorState.stream.textBlocks = {};
  selectorState.stream.thinkingBlocks = { 'blk_t1': '我需要搜索资料，但还没有真实 search block。' };
  selectorState.stream.blockOrder = ['blk_t1'];
  selectorState.stream.blockTypes = { 'blk_t1': 'thinking' };
  selectorState.stream.currentRun = null;

  render(
    <ChatMessage
      message={{
        id: 'assistant-1',
        role: 'assistant',
        content: [],
        timestamp: 1,
        chatId: 'chat-1',
      }}
      isStreaming
      isLastMessage
    />,
  );

  expect(screen.queryByText(/回答依据/)).toBeNull();

  selectorState.stream.messageId = null;
  selectorState.stream.thinkingBlocks = {};
  selectorState.stream.blockOrder = [];
  selectorState.stream.blockTypes = {};
});
```

### 3.2 修改 ChatMessage 接入

- [ ] 在 `src/components/chat/ChatMessage.tsx` 中移除旧入口 import：

```diff
-import SourcesPanel from './SourcesPanel';
 import SourcesSidebar from './SourcesSidebar';
-import UrlCard from './UrlCard';
+import AnswerEvidence from './AnswerEvidence';
+import { deriveAnswerEvidence } from './answerEvidenceModel';
```

- [ ] 在 `searchSources` 的 `useMemo` 后新增 evidence 派生：

```ts
  const answerEvidence = useMemo(
    () => deriveAnswerEvidence({
      searchSources,
      urlBlocks: activity.urlBlocks,
    }),
    [searchSources, activity.urlBlocks],
  );
```

- [ ] 删除历史 URL 卡片渲染区：

```tsx
                {/* 历史消息中的 URL 读取卡片 */}
                {!isCurrentlyStreaming && activity.urlBlocks.map((block) => (
                  <UrlCard
                    key={block.id}
                    url={block.url}
                    title={block.title}
                    favicon={block.favicon}
                  />
                ))}
```

- [ ] 删除搜索来源卡片渲染区：

```tsx
                {/* 搜索结果：来源卡片 */}
                {searchSources.length > 0 && (
                  <SourcesPanel sources={searchSources} />
                )}
```

- [ ] 删除底部参考资料入口：

```tsx
                {/* 参考资料入口 */}
                {!isStreaming && searchSources.length > 0 && (
                  <button
                    onClick={() => setSourcesSidebarOpen(true)}
                    className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-1"
                  >
                    参考 {searchSources.length} 篇资料
                  </button>
                )}
```

- [ ] 在 `AgentRunTimeline` 后、`MarkdownRenderer` 前插入统一入口：

```tsx
                <AnswerEvidence
                  evidence={answerEvidence}
                  onSourceClick={handleCitationClick}
                  onOpenSources={() => setSourcesSidebarOpen(true)}
                />
```

- [ ] 保留现有 `MarkdownRenderer`：

```tsx
                <MarkdownRenderer
                  content={displayText || ''}
                  className="prose-headings:border-0 prose-hr:border-border/30"
                  sources={searchSources}
                  onCitationClick={searchSources.length > 0 ? handleCitationClick : undefined}
                />
```

- [ ] 保留现有 `SourcesSidebar`，仍只在 `searchSources.length > 0` 时渲染。

### 3.3 验证 Task 3

- [ ] 运行：

```bash
npm test -- src/components/chat/answerEvidenceModel.test.ts src/components/chat/AnswerEvidence.test.tsx src/components/chat/ChatMessage.test.tsx
```

**Expected:** 新增测试和既有 `ChatMessage` 测试全部通过。

- [ ] 提交：

```bash
git add src/components/chat/ChatMessage.tsx src/components/chat/ChatMessage.test.tsx
git commit -m "feat: 接入统一回答依据区" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

## Task 4: 主 agent 审查、全量验证和推送

### 4.1 静态审查

- [ ] 检查没有残留旧入口接入：

```bash
rg "SourcesPanel|UrlCard|参考 \\{searchSources.length\\} 篇资料" src/components/chat
```

**Expected:** `SourcesPanel.tsx` 和 `UrlCard.tsx` 文件自身可以出现；`ChatMessage.tsx` 不应再 import 或 render 它们，底部“参考 N 篇资料”入口不应出现。

- [ ] 检查未启动本地服务相关命令没有被执行或加入脚本：

```bash
git diff -- src/components/chat docs/superpowers/plans/2026-06-22-answer-evidence-layer.md
```

**Expected:** diff 只包含 helper、组件、测试、ChatMessage 接入和计划文档；没有本地服务启动命令。

### 4.2 聚焦验证

- [ ] 运行回答依据相关测试：

```bash
npm test -- src/components/chat/answerEvidenceModel.test.ts src/components/chat/AnswerEvidence.test.tsx src/components/chat/ChatMessage.test.tsx
```

**Expected:** 3 个测试文件全部通过。

- [ ] 运行相关状态主线和 Agent 聚合测试，防止联网状态 UI 回退：

```bash
npm test -- src/components/chat/assistantActivity.test.ts src/components/chat/AssistantActivityStatus.test.tsx src/components/chat/agent/AgentStepCard.test.tsx src/components/chat/agent/ToolCallSummary.test.tsx
```

**Expected:** 4 个测试文件全部通过。

### 4.3 全量验证

- [ ] 运行：

```bash
npm test
```

**Expected:** 全量 Vitest 通过。

- [ ] 运行：

```bash
npm run build
```

**Expected:** Next.js build 成功；允许仅出现既有 Browserslist stale warning，不接受 TypeScript/ESLint/build error。

- [ ] 运行：

```bash
git diff --check
```

**Expected:** 无 trailing whitespace 或 patch 格式问题。

### 4.4 最终提交和推送

- [ ] 如果 Task 4 审查中有修复，单独提交：

```bash
git add src/components/chat
git commit -m "fix: 完善回答依据区回归细节" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

- [ ] 推送前确认当前分支：

```bash
git status --short --branch
```

**Expected:** 只包含本任务相关 commits ahead；历史未跟踪文档可以继续保持未跟踪，不纳入本次提交。

- [ ] 推送：

```bash
git push origin master
```

- [ ] 推送后监听 GitHub Actions：

```bash
gh run list --branch master --limit 5
gh run watch <run-id> --exit-status
```

**Expected:** Build、tests、Docker build/push、deploy、Feishu notify 全部成功。

---

## 验收清单

- [ ] 一条联网回答中只出现一个“回答依据”区域。
- [ ] 搜索来源和 URL 读取结果使用同一视觉结构展示。
- [ ] 不再同时出现 `SourcesPanel`、`UrlCard`、底部“参考 N 篇资料”三套入口。
- [ ] 点击搜索来源 item 能打开 `SourcesSidebar` 并高亮对应来源。
- [ ] 点击正文 Markdown 引用仍能打开 `SourcesSidebar` 并高亮对应来源。
- [ ] 点击 URL 读取 item 仍能在新标签打开原网页。
- [ ] thinking 文本里提到“搜索”不会生成回答依据区。
- [ ] 无 search block、无 url_read block 的普通回答不显示回答依据区。
- [ ] 未启动本地 Fusion dev server。
