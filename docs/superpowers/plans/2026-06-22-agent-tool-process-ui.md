# Agent 工具过程区聚合 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Agent 工具过程区从逐个 tool call chip 改成按工具类型聚合的紧凑摘要，避免多个 `搜索` / `读取` 看起来像一排按钮。

**Architecture:** 先在 `src/lib/agent/toolCallGroups.ts` 增加纯函数，把 `ToolCallState[]` 聚合成稳定的 `ToolCallGroup[]`。再让 `ToolCallSummary` 只渲染聚合后的摘要和短详情，最后在 `AgentStepCard` 中用 groups 替换逐个 `ToolCallChip` / 单 call summary 渲染。整体只改前端展示层和测试，不改后端协议、Redux、Dexie 或 SSE。

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, lucide-react, Tailwind CSS。

---

## 文件结构

- Create: `src/lib/agent/toolCallGroups.ts`
  - 纯函数聚合层：输入 `ToolCallState[]`，输出 `ToolCallGroup[]`。
  - 负责状态合并、结果数求和、摘要文案、详情文案、默认展开策略。
- Create: `src/lib/agent/toolCallGroups.test.ts`
  - 覆盖搜索、URL 读取、未知工具、running、partial、failed、degraded、interrupted、truncated、hostname 截断等规则。
- Modify: `src/components/chat/agent/ToolCallSummary.tsx`
  - 从单个 tool call 的 `input -> result` 日志行，改成接收 `ToolCallGroup` 的聚合摘要和详情渲染。
- Modify: `src/components/chat/agent/ToolCallSummary.test.tsx`
  - 更新测试，锁定聚合摘要、详情行、长文本截断和异常文案。
- Modify: `src/components/chat/agent/AgentStepCard.tsx`
  - 使用 `groupToolCalls(step.toolCalls)` 替换逐 call `ToolCallChip` 渲染。
  - 保留 pending step、summary handoff、step number、整步展开行为。
- Modify: `src/components/chat/agent/AgentStepCard.test.tsx`
  - 更新既有断言，新增“两个搜索只显示一条摘要”“两个读取只显示一条摘要”“异常默认可见详情”等回归。
- Modify: `src/components/chat/agent/index.ts`
  - 如果 `ToolCallChip` 不再被外部使用，移除导出；如果仍有外部引用则保留。

## Task 1: 增加工具调用聚合 helper

**Files:**
- Create: `src/lib/agent/toolCallGroups.test.ts`
- Create: `src/lib/agent/toolCallGroups.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/agent/toolCallGroups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ToolCallState } from '@/types/agentRun';
import {
  groupToolCalls,
  getToolGroupStatusClass,
  type ToolCallGroup,
} from './toolCallGroups';

const tc = (over: Partial<ToolCallState>): ToolCallState => ({
  toolCallId: 't1',
  toolName: 'web_search',
  arguments: { query: 'Global AI Standards Forum' },
  status: 'success',
  startedAt: 0,
  resultSummary: { kind: 'web_search', title: '5 条结果', count: 5, truncated: false },
  ...over,
});

const findGroup = (groups: ToolCallGroup[], toolName: string) => {
  const group = groups.find(g => g.toolName === toolName);
  if (!group) throw new Error(`missing group ${toolName}`);
  return group;
};

describe('groupToolCalls', () => {
  it('多个 web_search 聚合成一条搜索摘要并累计结果数', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', arguments: { query: 'Global AI Standards Forum' }, resultSummary: { kind: 'web_search', title: '第一组', count: 5, truncated: false } }),
      tc({ toolCallId: 's2', arguments: { query: 'AI CEOs G7' }, resultSummary: { kind: 'web_search', title: '第二组', count: 5, truncated: false } }),
    ]);

    expect(groups).toHaveLength(1);
    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('success');
    expect(search.count).toBe(2);
    expect(search.resultCount).toBe(10);
    expect(search.summary).toBe('搜索 2 次 · 共 10 条结果');
    expect(search.hasExpandableDetails).toBe(true);
    expect(search.shouldShowDetailsByDefault).toBe(false);
    expect(search.details.map(d => d.primary)).toEqual(['Global AI Standards Forum', 'AI CEOs G7']);
  });

  it('多个 url_read 聚合成一条网页读取摘要并提取 hostname', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'u1', toolName: 'url_read', arguments: { url: 'https://www.semafor.com/article/06/17/2026/ai-ceos-talk-global-standards-at-g7' }, resultSummary: { kind: 'url_read', title: 'AI CEOs pitch G7 leaders', truncated: false } }),
      tc({ toolCallId: 'u2', toolName: 'url_read', arguments: { url: 'https://letsdatascience.com/news/ai-ceos-attend-g7-pitch-global-standards-f3bc1bca' }, resultSummary: { kind: 'url_read', title: 'AI CEOs Attend G7', truncated: false } }),
    ]);

    expect(groups).toHaveLength(1);
    const read = findGroup(groups, 'url_read');
    expect(read.summary).toBe('读取 2 个网页');
    expect(read.details.map(d => d.primary)).toEqual(['www.semafor.com', 'letsdatascience.com']);
    expect(read.details.map(d => d.secondary)).toEqual(['AI CEOs pitch G7 leaders', 'AI CEOs Attend G7']);
  });

  it('同组存在成功和失败时显示 partial 并默认展开详情', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', status: 'success' }),
      tc({ toolCallId: 's2', status: 'failed', resultSummary: undefined, error: 'TIMEOUT: fetch 超时' }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('partial');
    expect(search.summary).toBe('搜索 2 次 · 1 次失败');
    expect(search.hasExpandableDetails).toBe(true);
    expect(search.shouldShowDetailsByDefault).toBe(true);
    expect(search.details[1].secondary).toBe('TIMEOUT: fetch 超时');
  });

  it('running 优先于其他状态并显示正在搜索', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', status: 'success' }),
      tc({ toolCallId: 's2', status: 'running', resultSummary: undefined, arguments: { query: 'OpenAI latest model' } }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('running');
    expect(search.summary).toBe('正在搜索 · 2 个查询');
    expect(search.shouldShowDetailsByDefault).toBe(true);
  });

  it('全部失败时显示失败摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', status: 'failed', resultSummary: undefined, error: 'SERVICE_UNAVAILABLE' }),
      tc({ toolCallId: 's2', status: 'failed', resultSummary: undefined, error: 'TIMEOUT' }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('failed');
    expect(search.summary).toBe('搜索失败 · 2 个查询');
    expect(search.shouldShowDetailsByDefault).toBe(true);
  });

  it('degraded 状态显示降级摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'u1', toolName: 'url_read', status: 'degraded', arguments: { url: 'https://example.com/a' }, resultSummary: undefined }),
    ]);

    const read = findGroup(groups, 'url_read');
    expect(read.status).toBe('degraded');
    expect(read.summary).toBe('网页读取降级 · 已跳过部分页面');
    expect(read.shouldShowDetailsByDefault).toBe(true);
  });

  it('interrupted 状态显示已中断摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'u1', toolName: 'url_read', status: 'interrupted', arguments: { url: 'https://example.com/a' }, resultSummary: undefined }),
    ]);

    const read = findGroup(groups, 'url_read');
    expect(read.status).toBe('interrupted');
    expect(read.summary).toBe('网页读取已中断 · 1 个目标');
    expect(read.shouldShowDetailsByDefault).toBe(true);
  });

  it('未知工具按 toolName 聚合并显示调用工具摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'x1', toolName: 'calculator', arguments: { expression: '1+1' }, resultSummary: { kind: 'calculator', title: '2', truncated: false } }),
      tc({ toolCallId: 'x2', toolName: 'calculator', arguments: { expression: '2+2' }, resultSummary: { kind: 'calculator', title: '4', truncated: false } }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].toolName).toBe('calculator');
    expect(groups[0].kind).toBe('other');
    expect(groups[0].summary).toBe('调用 2 个工具');
  });

  it('截断结果让成功组可展开但不默认展开', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', resultSummary: { kind: 'web_search', title: '部分结果', count: 5, truncated: true } }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.hasExpandableDetails).toBe(true);
    expect(search.shouldShowDetailsByDefault).toBe(false);
    expect(search.details[0].truncated).toBe(true);
  });

  it('状态 class 使用语义色且覆盖所有 group 状态', () => {
    expect(getToolGroupStatusClass('success')).toContain('text-muted-foreground');
    expect(getToolGroupStatusClass('running')).toContain('text-info');
    expect(getToolGroupStatusClass('partial')).toContain('text-warn');
    expect(getToolGroupStatusClass('degraded')).toContain('text-warn');
    expect(getToolGroupStatusClass('failed')).toContain('text-danger');
    expect(getToolGroupStatusClass('interrupted')).toContain('text-muted-foreground');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/lib/agent/toolCallGroups.test.ts
```

Expected: FAIL，原因是 `src/lib/agent/toolCallGroups.ts` 不存在。

- [ ] **Step 3: 写最小实现**

Create `src/lib/agent/toolCallGroups.ts`:

```ts
import type { ToolCallState, ToolCallStatus } from '@/types/agentRun';
import { getToolMeta } from './toolRegistry';

export type ToolCallGroupKind = 'web_search' | 'url_read' | 'other';
export type ToolCallGroupStatus =
  | 'running'
  | 'success'
  | 'partial'
  | 'degraded'
  | 'failed'
  | 'interrupted';

export interface ToolCallGroupDetail {
  id: string;
  primary: string;
  secondary?: string;
  status: ToolCallStatus;
  truncated: boolean;
  fullValue?: string;
}

export interface ToolCallGroup {
  id: string;
  kind: ToolCallGroupKind;
  toolName: string;
  label: string;
  count: number;
  resultCount: number;
  status: ToolCallGroupStatus;
  summary: string;
  details: ToolCallGroupDetail[];
  hasExpandableDetails: boolean;
  shouldShowDetailsByDefault: boolean;
}

export function groupToolCalls(calls: ToolCallState[]): ToolCallGroup[] {
  const buckets = new Map<string, ToolCallState[]>();

  calls.forEach(call => {
    const id = getGroupId(call.toolName);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(call);
    else buckets.set(id, [call]);
  });

  return Array.from(buckets.entries()).map(([id, groupCalls]) => {
    const first = groupCalls[0];
    const meta = getToolMeta(first.toolName);
    const kind = getGroupKind(first.toolName);
    const status = deriveGroupStatus(groupCalls);
    const resultCount = groupCalls.reduce((sum, call) => sum + (call.resultSummary?.count ?? 0), 0);
    const details = groupCalls.map(toGroupDetail);
    const hasExpandableDetails = shouldHaveExpandableDetails(groupCalls, status);

    return {
      id,
      kind,
      toolName: first.toolName,
      label: meta.label,
      count: groupCalls.length,
      resultCount,
      status,
      summary: buildSummary(kind, status, groupCalls.length, resultCount, countByStatus(groupCalls, 'failed')),
      details,
      hasExpandableDetails,
      shouldShowDetailsByDefault: status !== 'success',
    };
  });
}

export function getToolGroupStatusClass(status: ToolCallGroupStatus): string {
  switch (status) {
    case 'running':
      return 'text-info';
    case 'partial':
    case 'degraded':
      return 'text-warn';
    case 'failed':
      return 'text-danger';
    case 'success':
    case 'interrupted':
      return 'text-muted-foreground';
    default: {
      void (status as never);
      return 'text-muted-foreground';
    }
  }
}

function getGroupId(toolName: string): string {
  if (toolName === 'web_search') return 'web_search';
  if (toolName === 'url_read') return 'url_read';
  return `other:${toolName}`;
}

function getGroupKind(toolName: string): ToolCallGroupKind {
  if (toolName === 'web_search') return 'web_search';
  if (toolName === 'url_read') return 'url_read';
  return 'other';
}

function deriveGroupStatus(calls: ToolCallState[]): ToolCallGroupStatus {
  if (calls.some(call => call.status === 'running')) return 'running';
  const statuses = new Set(calls.map(call => call.status));
  if (statuses.size > 1) return 'partial';
  const status = calls[0]?.status;
  if (status === 'success') return 'success';
  if (status === 'degraded') return 'degraded';
  if (status === 'failed') return 'failed';
  if (status === 'interrupted') return 'interrupted';
  return 'success';
}

function countByStatus(calls: ToolCallState[], status: ToolCallStatus): number {
  return calls.filter(call => call.status === status).length;
}

function buildSummary(
  kind: ToolCallGroupKind,
  status: ToolCallGroupStatus,
  count: number,
  resultCount: number,
  failedCount: number,
): string {
  if (kind === 'web_search') {
    if (status === 'running') return `正在搜索 · ${count} 个查询`;
    if (status === 'partial') return `搜索 ${count} 次 · ${failedCount} 次失败`;
    if (status === 'failed') return `搜索失败 · ${count} 个查询`;
    if (status === 'degraded') return '搜索降级 · 已跳过外部结果';
    if (status === 'interrupted') return `搜索已中断 · ${count} 个查询`;
    return resultCount > 0 ? `搜索 ${count} 次 · 共 ${resultCount} 条结果` : `搜索 ${count} 次`;
  }

  if (kind === 'url_read') {
    if (status === 'running') return `正在读取网页 · ${count} 个目标`;
    if (status === 'partial') return `读取 ${count} 个网页 · ${failedCount} 个失败`;
    if (status === 'failed') return `网页读取失败 · ${count} 个目标`;
    if (status === 'degraded') return '网页读取降级 · 已跳过部分页面';
    if (status === 'interrupted') return `网页读取已中断 · ${count} 个目标`;
    return `读取 ${count} 个网页`;
  }

  if (status === 'running') return `正在调用工具 · ${count} 个任务`;
  if (status === 'partial') return `调用 ${count} 个工具 · ${failedCount} 个失败`;
  if (status === 'failed') return `工具调用失败 · ${count} 个任务`;
  if (status === 'degraded') return '工具调用降级 · 已跳过部分结果';
  if (status === 'interrupted') return `工具调用已中断 · ${count} 个任务`;
  return `调用 ${count} 个工具`;
}

function toGroupDetail(call: ToolCallState): ToolCallGroupDetail {
  const target = getTarget(call);
  const resultTitle = call.resultSummary?.title;
  return {
    id: call.toolCallId,
    primary: target.short,
    secondary: call.error || resultTitle || getStatusText(call.status),
    status: call.status,
    truncated: call.resultSummary?.truncated === true,
    fullValue: target.full,
  };
}

function getTarget(call: ToolCallState): { short: string; full: string } {
  if (call.toolName === 'web_search') {
    const query = String(call.arguments.query ?? '').trim() || '未命名查询';
    return { short: query, full: query };
  }

  if (call.toolName === 'url_read') {
    const rawUrl = String(call.arguments.url ?? '').trim() || '未命名网页';
    return { short: getHostname(rawUrl), full: rawUrl };
  }

  const summarized = getToolMeta(call.toolName).summarize(call.arguments).trim();
  const value = summarized || call.toolName;
  return { short: value, full: value };
}

function getHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname || rawUrl;
  } catch {
    return rawUrl;
  }
}

function getStatusText(status: ToolCallStatus): string | undefined {
  switch (status) {
    case 'running':
      return '进行中';
    case 'failed':
      return '未完成';
    case 'degraded':
      return '部分结果不可用';
    case 'interrupted':
      return '已中断';
    case 'success':
      return undefined;
    default: {
      void (status as never);
      return undefined;
    }
  }
}

function shouldHaveExpandableDetails(calls: ToolCallState[], status: ToolCallGroupStatus): boolean {
  if (calls.length > 1) return true;
  if (status !== 'success') return true;
  return calls.some(call => call.resultSummary?.truncated === true);
}
```

- [ ] **Step 4: 运行 helper 测试确认通过**

Run:

```bash
npm test -- src/lib/agent/toolCallGroups.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交 helper**

Run:

```bash
git add src/lib/agent/toolCallGroups.ts src/lib/agent/toolCallGroups.test.ts
git commit -m "feat: 添加工具调用聚合 helper" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 2: 改造工具摘要渲染组件

**Files:**
- Modify: `src/components/chat/agent/ToolCallSummary.test.tsx`
- Modify: `src/components/chat/agent/ToolCallSummary.tsx`

- [ ] **Step 1: 替换组件测试为聚合组测试**

Replace `src/components/chat/agent/ToolCallSummary.test.tsx` with:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolCallSummary } from './ToolCallSummary';
import type { ToolCallGroup } from '@/lib/agent/toolCallGroups';

const group = (over: Partial<ToolCallGroup>): ToolCallGroup => ({
  id: 'web_search',
  kind: 'web_search',
  toolName: 'web_search',
  label: '搜索',
  count: 2,
  resultCount: 10,
  status: 'success',
  summary: '搜索 2 次 · 共 10 条结果',
  details: [
    { id: 's1', primary: 'Global AI Standards Forum', secondary: '5 条结果', status: 'success', truncated: false, fullValue: 'Global AI Standards Forum' },
    { id: 's2', primary: 'AI CEOs G7', secondary: '5 条结果', status: 'success', truncated: false, fullValue: 'AI CEOs G7' },
  ],
  hasExpandableDetails: true,
  shouldShowDetailsByDefault: false,
  ...over,
});

describe('ToolCallSummary', () => {
  it('summary 模式显示聚合文案，不逐个重复工具名', () => {
    render(<ToolCallSummary group={group({})} mode="summary" />);
    expect(screen.getByText('搜索 2 次 · 共 10 条结果')).toBeInTheDocument();
    expect(screen.queryByText('Global AI Standards Forum')).not.toBeInTheDocument();
  });

  it('details 模式显示 query 和结果摘要', () => {
    render(<ToolCallSummary group={group({})} mode="details" />);
    expect(screen.getByText('Global AI Standards Forum')).toBeInTheDocument();
    expect(screen.getByText('AI CEOs G7')).toBeInTheDocument();
    expect(screen.getAllByText('5 条结果')).toHaveLength(2);
  });

  it('url_read details 展示 hostname 和标题', () => {
    render(<ToolCallSummary group={group({
      id: 'url_read',
      kind: 'url_read',
      toolName: 'url_read',
      label: '读取',
      summary: '读取 2 个网页',
      details: [
        { id: 'u1', primary: 'www.semafor.com', secondary: 'AI CEOs pitch G7 leaders', status: 'success', truncated: false, fullValue: 'https://www.semafor.com/article/06/17/2026/ai-ceos-talk-global-standards-at-g7' },
        { id: 'u2', primary: 'letsdatascience.com', secondary: 'AI CEOs Attend G7', status: 'success', truncated: false, fullValue: 'https://letsdatascience.com/news/ai-ceos-attend-g7-pitch-global-standards-f3bc1bca' },
      ],
    })} mode="details" />);

    expect(screen.getByText('www.semafor.com')).toBeInTheDocument();
    expect(screen.getByText('letsdatascience.com')).toBeInTheDocument();
    expect(screen.getByText('AI CEOs pitch G7 leaders')).toBeInTheDocument();
  });

  it('failed summary 使用失败语义并显示失败详情', () => {
    render(<ToolCallSummary group={group({
      status: 'failed',
      summary: '搜索失败 · 2 个查询',
      details: [
        { id: 's1', primary: 'Global AI Standards Forum', secondary: 'TIMEOUT', status: 'failed', truncated: false, fullValue: 'Global AI Standards Forum' },
      ],
    })} mode="details" />);

    expect(screen.getByText('Global AI Standards Forum')).toBeInTheDocument();
    expect(screen.getByText('TIMEOUT')).toBeInTheDocument();
  });

  it('running summary 显示 spinner 和运行中文案', () => {
    const { container } = render(<ToolCallSummary group={group({
      status: 'running',
      summary: '正在搜索 · 2 个查询',
    })} mode="summary" />);

    expect(screen.getByText('正在搜索 · 2 个查询')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('truncated detail 显示截断提示', () => {
    render(<ToolCallSummary group={group({
      details: [
        { id: 's1', primary: 'Global AI Standards Forum', secondary: '部分结果', status: 'success', truncated: true, fullValue: 'Global AI Standards Forum' },
      ],
    })} mode="details" />);

    expect(screen.getByText(/截断/)).toBeInTheDocument();
  });

  it('长文本节点保留 truncate 和 min-w-0 class', () => {
    const longText = '一段非常非常非常长的搜索关键词'.repeat(20);
    const { container } = render(<ToolCallSummary group={group({
      details: [
        { id: 's1', primary: longText, secondary: longText, status: 'success', truncated: false, fullValue: longText },
      ],
    })} mode="details" />);

    const truncateSpans = container.querySelectorAll('span.truncate');
    expect(truncateSpans.length).toBeGreaterThanOrEqual(2);
    truncateSpans.forEach(el => {
      expect(el.className).toMatch(/min-w-0/);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/agent/ToolCallSummary.test.tsx
```

Expected: FAIL，原因是 `ToolCallSummary` 仍接收 `call`，不接收 `group` 和 `mode`。

- [ ] **Step 3: 改造组件实现**

Replace `src/components/chat/agent/ToolCallSummary.tsx` with:

```tsx
'use client';

import { Loader2 } from 'lucide-react';
import type { ToolCallGroup } from '@/lib/agent/toolCallGroups';
import { getToolGroupStatusClass } from '@/lib/agent/toolCallGroups';

interface ToolCallSummaryProps {
  group: ToolCallGroup;
  mode: 'summary' | 'details';
}

export function ToolCallSummary({ group, mode }: ToolCallSummaryProps) {
  if (mode === 'details') {
    return <ToolCallDetails group={group} />;
  }

  return (
    <div
      data-testid={`tool-call-group-${group.id}`}
      className={`flex items-center gap-1.5 text-xs min-w-0 ${getToolGroupStatusClass(group.status)}`}
    >
      {group.status === 'running' && (
        <Loader2 className="w-3 h-3 animate-spin shrink-0 motion-reduce:animate-none" aria-hidden="true" />
      )}
      <span className="truncate min-w-0">{group.summary}</span>
    </div>
  );
}

function ToolCallDetails({ group }: { group: ToolCallGroup }) {
  return (
    <div className="space-y-1">
      {group.details.slice(0, 3).map(detail => (
        <div key={detail.id} className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
          <span
            className="truncate min-w-0 text-foreground/80"
            title={detail.fullValue}
          >
            {detail.primary}
          </span>
          {detail.secondary && (
            <>
              <span className="shrink-0 text-muted-foreground/70">·</span>
              <span className="truncate min-w-0" title={detail.secondary}>
                {detail.secondary}
              </span>
            </>
          )}
          {detail.truncated && (
            <span className="shrink-0 text-warn">（截断）</span>
          )}
        </div>
      ))}
      {group.details.length > 3 && (
        <div className="text-xs text-muted-foreground">
          还有 {group.details.length - 3} 个目标未展示
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 运行组件测试确认通过**

Run:

```bash
npm test -- src/components/chat/agent/ToolCallSummary.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 提交组件改造**

Run:

```bash
git add src/components/chat/agent/ToolCallSummary.tsx src/components/chat/agent/ToolCallSummary.test.tsx
git commit -m "feat: 聚合渲染工具调用摘要" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 3: 接入 AgentStepCard 并更新交互测试

**Files:**
- Modify: `src/components/chat/agent/AgentStepCard.test.tsx`
- Modify: `src/components/chat/agent/AgentStepCard.tsx`
- Modify: `src/components/chat/agent/index.ts`

- [ ] **Step 1: 更新 AgentStepCard 测试**

Modify `src/components/chat/agent/AgentStepCard.test.tsx` with these targeted changes:

```tsx
it('completed 步骤默认显示聚合工具摘要', () => {
  render(<AgentStepCard step={step({
    toolCalls: [tc({})],
    status: 'completed',
  })} _isLast={false} />);
  expect(screen.getByText(/搜索 1 次/)).toBeInTheDocument();
});

it('普通 success 单工具：无 chevron、按钮 disabled、点击不展开', () => {
  const { container } = render(<AgentStepCard step={step({
    toolCalls: [tc({})],
    status: 'completed',
  })} _isLast={false} />);

  expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
});

it('两个 web_search 只渲染一条聚合搜索摘要', () => {
  render(<AgentStepCard step={step({
    toolCalls: [
      tc({ toolCallId: 's1', arguments: { query: 'Global AI Standards Forum' }, resultSummary: { kind: 'web_search', title: '第一组', count: 5, truncated: false } }),
      tc({ toolCallId: 's2', arguments: { query: 'AI CEOs G7' }, resultSummary: { kind: 'web_search', title: '第二组', count: 5, truncated: false } }),
    ],
    status: 'completed',
  })} _isLast={false} />);

  expect(screen.getByText('搜索 2 次 · 共 10 条结果')).toBeInTheDocument();
  expect(screen.getByText(/搜索/)).toBeInTheDocument();
  expect(screen.queryByText('Global AI Standards Forum')).not.toBeInTheDocument();
});

it('两个 url_read 只渲染一条聚合读取摘要', () => {
  render(<AgentStepCard step={step({
    toolCalls: [
      tc({ toolCallId: 'u1', toolName: 'url_read', arguments: { url: 'https://www.semafor.com/a' }, resultSummary: { kind: 'url_read', title: 'Semafor', truncated: false } }),
      tc({ toolCallId: 'u2', toolName: 'url_read', arguments: { url: 'https://letsdatascience.com/b' }, resultSummary: { kind: 'url_read', title: 'Data Science', truncated: false } }),
    ],
    status: 'completed',
  })} _isLast={false} />);

  expect(screen.getByText('读取 2 个网页')).toBeInTheDocument();
  expect(screen.queryByText('www.semafor.com')).not.toBeInTheDocument();
});

it('多工具组展开后显示聚合详情', () => {
  render(<AgentStepCard step={step({
    toolCalls: [
      tc({ toolCallId: 's1', arguments: { query: 'Global AI Standards Forum' }, resultSummary: { kind: 'web_search', title: '第一组', count: 5, truncated: false } }),
      tc({ toolCallId: 's2', arguments: { query: 'AI CEOs G7' }, resultSummary: { kind: 'web_search', title: '第二组', count: 5, truncated: false } }),
      tc({ toolCallId: 'u1', toolName: 'url_read', arguments: { url: 'https://www.semafor.com/a' }, resultSummary: { kind: 'url_read', title: 'Semafor', truncated: false } }),
    ],
    status: 'completed',
  })} _isLast={false} />);

  fireEvent.click(screen.getByRole('button'));

  expect(screen.getByText('Global AI Standards Forum')).toBeInTheDocument();
  expect(screen.getByText('AI CEOs G7')).toBeInTheDocument();
  expect(screen.getByText('www.semafor.com')).toBeInTheDocument();
});

it('failed 工具组默认展开并显示错误信息', () => {
  render(<AgentStepCard step={step({
    toolCalls: [tc({ status: 'failed', resultSummary: undefined, error: 'TIMEOUT: fetch 超时' })],
    status: 'failed',
  })} _isLast={false} />);

  expect(screen.getByText(/搜索失败/)).toBeInTheDocument();
  expect(screen.getByText(/TIMEOUT/)).toBeInTheDocument();
});

it('running + 有 toolCalls 时 StepNumber 不显示 spinner，工具组显示 spinner', () => {
  const { container } = render(<AgentStepCard step={step({
    toolCalls: [tc({ status: 'running', resultSummary: undefined })],
    status: 'running',
  })} _isLast={true} />);

  expect(screen.getByText('1')).toBeInTheDocument();
  const stepNumberDiv = document.querySelector('.w-6.h-6.rounded-full');
  expect(stepNumberDiv?.querySelector('.animate-spin')).toBeNull();
  expect(container.querySelector('[data-testid="tool-call-group-web_search"] .animate-spin')).toBeInTheDocument();
});
```

Keep existing pending / content handoff tests unchanged:

```tsx
it('running + 0 toolCalls 渲染 pending 形态「正在思考下一步」', () => {
  render(<AgentStepCard step={step({
    toolCalls: [],
    status: 'running',
  })} _isLast={true} />);
  expect(screen.getByText(/正在思考下一步/)).toBeInTheDocument();
});

it('running + 0 toolCalls + contentBlockIds > 0 不渲染（让正文接管 streaming）', () => {
  const { container } = render(<AgentStepCard step={step({
    toolCalls: [],
    status: 'running',
    contentBlockIds: ['blk_1', 'blk_2'],
  })} _isLast={true} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/agent/AgentStepCard.test.tsx
```

Expected: FAIL，原因是 `AgentStepCard` 仍逐个渲染 `ToolCallChip` 和单 call summary。

- [ ] **Step 3: 接入聚合 helper 和 summary 组件**

Modify `src/components/chat/agent/AgentStepCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, CheckCircle2, AlertCircle, Square } from 'lucide-react';
import type { AgentStepState } from '@/types/agentRun';
import { STEP_STATUS_TREATMENT } from '@/lib/agent/statusTreatment';
import { STEP_NUMBER_COLOR_CLASSES } from '@/lib/agent/colorClasses';
import { groupToolCalls } from '@/lib/agent/toolCallGroups';
import { ToolCallSummary } from './ToolCallSummary';

export function AgentStepCard({ step, _isLast }: { step: AgentStepState; _isLast: boolean }) {
  void _isLast;

  if (step.status === 'running'
      && step.toolCalls.length === 0
      && step.contentBlockIds.length > 0) {
    return null;
  }

  const hasContent = step.contentBlockIds.length > 0;
  const isPending = step.status === 'running'
    && step.toolCalls.length === 0
    && !hasContent;
  const groups = groupToolCalls(step.toolCalls);
  const groupHasDetails = groups.some(group => group.hasExpandableDetails);
  const defaultExpanded = groups.some(group => group.shouldShowDetailsByDefault);
  const [overrideExpanded, setOverrideExpanded] = useState<boolean | null>(null);
  const expanded = overrideExpanded ?? defaultExpanded;
  const canExpand = !isPending && groupHasDetails;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 w-full min-w-0">
      <button
        type="button"
        onClick={() => canExpand && setOverrideExpanded(!expanded)}
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors duration-fast disabled:cursor-default disabled:hover:bg-transparent"
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={canExpand ? (expanded ? '收起工具详情' : '查看工具详情') : undefined}
        disabled={!canExpand}
      >
        <StepNumber n={step.stepNumber} status={step.status} hasToolCalls={step.toolCalls.length > 0} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {isPending ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">步骤 {step.stepNumber} ·</span>
              <span className="text-foreground/80">
                {step.status === 'running' ? '正在思考下一步…' : '无产出'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {groups.map(group => (
                  <ToolCallSummary key={group.id} group={group} mode="summary" />
                ))}
                {step.status === 'interrupted' && groups.every(group => group.status !== 'interrupted') && (
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted/30">已中断</span>
                )}
              </div>
            </div>
          )}
        </div>
        {canExpand && (
          <ChevronDown className={`w-4 h-4 mt-1 text-muted-foreground transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`} />
        )}
      </button>

      {canExpand && expanded && (
        <div className="px-3 pb-2 pt-1 space-y-2">
          {groups.filter(group => group.hasExpandableDetails).map(group => (
            <ToolCallSummary key={group.id} group={group} mode="details" />
          ))}
        </div>
      )}
    </div>
  );
}

function StepNumber({ n, status, hasToolCalls }: { n: number; status: AgentStepState['status']; hasToolCalls: boolean }) {
  const treatment = STEP_STATUS_TREATMENT[status];
  const colorClass = STEP_NUMBER_COLOR_CLASSES[treatment.color];
  const showSpinner = status === 'running' && !hasToolCalls;
  return (
    <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs ${colorClass}`}>
      {showSpinner ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
        : status === 'completed' ? <CheckCircle2 className="w-3 h-3" />
        : status === 'failed' ? <AlertCircle className="w-3 h-3" />
        : status === 'interrupted' ? <Square className="w-3 h-3" />
        : <span>{n}</span>}
    </div>
  );
}
```

- [ ] **Step 4: 处理导出**

Check external usage:

```bash
rg -n "ToolCallChip|ToolCallSummary" src
```

If `ToolCallChip` is only exported from `src/components/chat/agent/index.ts` and no longer imported elsewhere, remove this line from `src/components/chat/agent/index.ts`:

```ts
export { ToolCallChip } from './ToolCallChip';
```

Keep `ToolCallChip.tsx` itself unless no test/build imports require it. This avoids mixing UI cleanup with behavior change.

- [ ] **Step 5: 运行 AgentStepCard 测试确认通过**

Run:

```bash
npm test -- src/components/chat/agent/AgentStepCard.test.tsx
```

Expected: PASS。

- [ ] **Step 6: 提交接入改造**

Run:

```bash
git add src/components/chat/agent/AgentStepCard.tsx src/components/chat/agent/AgentStepCard.test.tsx src/components/chat/agent/index.ts
git commit -m "feat: 聚合展示 agent 工具过程" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 4: 集成回归与最终校验

**Files:**
- Modify only if tests expose a real issue:
  - `src/components/chat/agent/AgentRunTimeline.test.tsx`
  - `src/components/chat/agent/AgentRunTimeline.tsx`
  - `src/components/chat/ChatMessage.test.tsx`

- [ ] **Step 1: 跑 agent 相关测试**

Run:

```bash
npm test -- src/lib/agent/toolCallGroups.test.ts src/components/chat/agent/ToolCallSummary.test.tsx src/components/chat/agent/AgentStepCard.test.tsx src/components/chat/agent/AgentRunTimeline.test.tsx
```

Expected: PASS。

- [ ] **Step 2: 跑聊天状态主线相关测试**

Run:

```bash
npm test -- src/components/chat/assistantActivity.test.ts src/components/chat/AssistantActivityStatus.test.tsx src/components/chat/ChatMessage.test.tsx src/components/chat/SuggestedQuestions.test.tsx
```

Expected: PASS。

- [ ] **Step 3: 跑完整测试**

Run:

```bash
npm test
```

Expected: PASS。

- [ ] **Step 4: 跑生产构建**

Run:

```bash
npm run build
```

Expected: PASS。允许出现 Browserslist stale warning；不允许 TypeScript、Next.js 编译或测试失败。

- [ ] **Step 5: 检查空白和本地服务禁令**

Run:

```bash
git diff --check
rg -n "next dev|npm run dev|dev:next|localhost:3000|127.0.0.1:3000" docs/superpowers/plans/2026-06-22-agent-tool-process-ui.md src/lib/agent src/components/chat/agent
```

Expected:

- `git diff --check` 无输出。
- `rg` 只允许命中计划文档里的禁令描述；实现代码不应出现本地启动命令。

- [ ] **Step 6: 最终提交或确认无需提交**

If Task 4 only runs verification and no files changed:

```bash
git status -sb
```

Expected: no unstaged implementation changes except unrelated pre-existing untracked docs.

If Task 4 fixes a real regression, commit only touched files:

```bash
git add <changed-files>
git commit -m "fix: 补齐工具过程聚合回归" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Subagent-Driven 执行建议

- Subagent A: 执行 Task 1，产出纯 helper 和 helper 测试。
- Main agent review A:
  - 检查 `groupToolCalls` 是否只依赖结构化数据。
  - 检查 `interrupted` 是否被显式覆盖。
  - 检查摘要文案是否与 spec 一致。
- Subagent B: 执行 Task 2，产出聚合摘要组件和组件测试。
- Main agent review B:
  - 检查 summary 模式不泄露完整 query / URL。
  - 检查 details 模式不使用卡片套卡片。
  - 检查 running / failed / degraded 可见。
- Subagent C: 执行 Task 3，接入 `AgentStepCard` 并更新回归测试。
- Main agent review C:
  - 检查不再逐个渲染重复 `ToolCallChip`。
  - 检查 pending step、content handoff、step number 行为未破坏。
  - 检查异常默认可见，成功详情默认折叠。
- Main agent: 执行 Task 4 最终验证，必要时做小修复并提交。

## 不做事项

- 不启动本地 Fusion dev server。
- 不改后端 schema。
- 不改 Redux store shape。
- 不改 Dexie schema。
- 不重写 Sources / URL 卡片。
- 不删除历史组件，除非确认没有任何导入且删除不扩大范围。
