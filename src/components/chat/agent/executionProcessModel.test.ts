import { describe, expect, it } from 'vitest';
import type { AgentEvidenceItem, AgentRunState, AgentToolDigest, ToolCallState } from '@/types/agentRun';
import { buildExecutionProcessModel } from './executionProcessModel';

const baseConfig = { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 };

function run(overrides: Partial<AgentRunState> = {}): AgentRunState {
  return {
    runId: 'r1',
    messageId: 'm1',
    status: 'completed',
    config: baseConfig,
    totalSteps: 0,
    totalToolCalls: 0,
    steps: [],
    lastSequence: 10,
    ...overrides,
  };
}

function toolCall(overrides: Partial<ToolCallState> = {}): ToolCallState {
  return {
    toolCallId: 'tc-1',
    toolName: 'web_search',
    arguments: { query: 'SpaceX 估值 上市 2026年' },
    status: 'success',
    resultSummary: { kind: 'search', count: 5, truncated: false },
    startedAt: 1_000,
    completedAt: 1_500,
    ...overrides,
  };
}

function digest(overrides: Partial<AgentToolDigest> = {}): AgentToolDigest {
  return {
    toolCallId: 'tc-1',
    toolName: 'web_search',
    status: 'success',
    title: '搜索完成',
    summary: '保留 5 条候选结果，供后续回答筛选。',
    keyFindings: [],
    sourceRefs: [],
    truncated: false,
    ...overrides,
  };
}

function evidence(overrides: Partial<AgentEvidenceItem> = {}): AgentEvidenceItem {
  return {
    id: 'ev-1',
    kind: 'web',
    status: 'used',
    title: '来源标题',
    url: 'https://example.com/news',
    domain: 'example.com',
    claim: '来源摘要',
    usedByFinalAnswer: true,
    ...overrides,
  };
}

describe('executionProcessModel 场景矩阵', () => {
  it('plan/progress/evidence-only 不构成可展示执行过程', () => {
    const model = buildExecutionProcessModel(run({
      protocolVersion: 2,
      progress: {
        phase: 'answering',
        label: '已完成回答整理',
        completedSteps: 1,
        totalSteps: 1,
      },
      plan: {
        planId: 'plan-r1',
        revision: 1,
        items: [
          {
            id: 'search',
            title: '搜索：iPhone为什么要换USB-C接口',
            status: 'completed',
            kind: 'search',
            summary: '工具：联网搜索；预算：最多 4 次搜索，每次 3-10 条结果',
            toolNames: ['web_search'],
            evidenceItemIds: ['ev-1'],
          },
        ],
      },
      evidence: [evidence()],
    }));

    expect(model.isRenderable).toBe(false);
    expect(model.summary).toBe('执行过程');
    expect(model.searchCount).toBe(0);
    expect(model.readCount).toBe(0);
    expect(model.groups).toHaveLength(0);
  });

  it('真实 web_search tool call 才计入搜索过程、关键词和候选结果', () => {
    const model = buildExecutionProcessModel(
      run({
        totalSteps: 1,
        totalToolCalls: 1,
        steps: [{
          stepId: 's1',
          stepNumber: 1,
          status: 'completed',
          toolCalls: [toolCall()],
          contentBlockIds: [],
          startedAt: 1_000,
          completedAt: 2_000,
        }],
      }),
      { searchQueries: ['SpaceX 估值 上市 2026年', 'SpaceX IPO'] },
    );

    expect(model.isRenderable).toBe(true);
    expect(model.summary).toBe('执行过程 · 搜索 1 次');
    expect(model.searchCount).toBe(1);
    expect(model.searchCandidateCount).toBe(5);
    expect(model.searchQueries).toEqual(['SpaceX 估值 上市 2026年', 'SpaceX IPO']);
    expect(model.groups.map(group => group.kind)).toEqual(['web_search']);
  });

  it('真实 url_read 同时展示成功读取数和跳过数', () => {
    const model = buildExecutionProcessModel(run({
      totalSteps: 1,
      totalToolCalls: 3,
      steps: [{
        stepId: 's1',
        stepNumber: 1,
        status: 'completed',
        toolCalls: [
          toolCall({
            toolCallId: 'read-ok',
            toolName: 'url_read',
            arguments: { url: 'https://example.com/a' },
            resultSummary: { kind: 'webpage', count: 1, truncated: false },
          }),
          toolCall({
            toolCallId: 'read-degraded',
            toolName: 'url_read',
            arguments: { url: 'https://example.com/b' },
            status: 'degraded',
            resultSummary: undefined,
            error: 'reader-service 返回 HTTP 502',
          }),
          toolCall({
            toolCallId: 'read-failed',
            toolName: 'url_read',
            arguments: { url: 'https://example.com/c' },
            status: 'failed',
            resultSummary: undefined,
            error: 'timeout',
          }),
        ],
        contentBlockIds: [],
        startedAt: 1_000,
        completedAt: 2_000,
      }],
    }));

    expect(model.isRenderable).toBe(true);
    expect(model.summary).toBe('执行过程 · 读取 1 个网页 · 跳过 2 个网页');
    expect(model.readCount).toBe(1);
    expect(model.skippedReadCount).toBe(2);
    expect(model.groups.map(group => group.kind)).toEqual(['url_read']);
  });

  it('历史 digest-only 按真实摘要聚合搜索和读取，不依赖 plan', () => {
    const model = buildExecutionProcessModel(run({
      toolDigests: [
        digest({ toolCallId: 'search-1', summary: '保留 2 条候选结果，供后续回答筛选。' }),
        digest({ toolCallId: 'search-2', summary: '保留 5 条候选结果，供后续回答筛选。' }),
        digest({ toolCallId: 'read-ok', toolName: 'url_read', status: 'success', summary: '已读取网页内容。' }),
        digest({ toolCallId: 'read-skip', toolName: 'url_read', status: 'degraded', summary: '网页暂时无法读取。' }),
      ],
    }));

    expect(model.isRenderable).toBe(true);
    expect(model.summary).toBe('执行过程 · 搜索 2 次 · 读取 1 个网页 · 跳过 1 个网页');
    expect(model.searchCandidateCount).toBe(7);
    expect(model.skippedReadCount).toBe(1);
    expect(model.groups).toHaveLength(0);
  });

  it('历史未知 MCP digest-only 仍可渲染且不暴露内部 alias', () => {
    const internalAlias = 'mcp__learn__microsoft_docs_search';
    const model = buildExecutionProcessModel(run({
      toolDigests: [
        digest({
          toolCallId: 'mcp-1',
          toolName: internalAlias,
          title: `${internalAlias} 已完成`,
          summary: `${internalAlias} 返回了可用结果`,
        }),
      ],
    }));

    expect(model.isRenderable).toBe(true);
    expect(model.externalToolCount).toBe(1);
    expect(model.summary).toBe('执行过程 · 调用 1 个外部工具');
    expect(model.digestRows).toEqual([
      expect.objectContaining({
        id: 'mcp-1',
        kind: 'other',
        title: '外部工具',
        summary: '外部工具已完成。',
      }),
    ]);
    expect(JSON.stringify(model)).not.toContain(internalAlias);
  });

  it.each(['failed', 'degraded'] as const)('历史 MCP %s digest 不显示技术术语或旧上游错误', (status) => {
    const model = buildExecutionProcessModel(run({
      toolDigests: [digest({
        toolCallId: 'external-failed',
        toolName: 'mcp_3xYzSafeToken',
        status,
        title: '高德地图 / maps_text_search',
        summary: status === 'failed'
          ? 'MCP 工具暂时不可用'
          : 'upstream 429 quota response',
      })],
    }));

    expect(model.digestRows[0]).toMatchObject({
      title: '高德地图 / maps_text_search',
      summary: '部分外部工具结果未能使用。',
    });
    expect(JSON.stringify(model)).not.toMatch(/MCP|upstream|quota/i);
  });

  it('实时 MCP 调用和同一 digest 按 toolCallId 去重计数', () => {
    const model = buildExecutionProcessModel(run({
      steps: [{
        stepId: 's1',
        stepNumber: 1,
        status: 'completed',
        toolCalls: [toolCall({
          toolCallId: 'mcp-1',
          toolName: 'mcp__learn__microsoft_docs_search',
          arguments: { query: 'Responses API' },
          resultSummary: { kind: 'mcp', title: '找到 2 篇官方文档', truncated: false },
        })],
        contentBlockIds: [],
        startedAt: 1_000,
        completedAt: 2_000,
      }],
      toolDigests: [digest({
        toolCallId: 'mcp-1',
        toolName: 'mcp__learn__microsoft_docs_search',
        title: 'Microsoft Learn 文档检索',
        summary: '找到 2 篇官方文档。',
      })],
    }));

    expect(model.externalToolCount).toBe(1);
    expect(model.summary).toBe('执行过程 · 调用 1 个外部工具');
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].kind).toBe('other');
  });

  it('只有不可读网页时仍构成可查看执行过程', () => {
    const model = buildExecutionProcessModel(run({
      totalSteps: 1,
      totalToolCalls: 1,
      steps: [{
        stepId: 's1',
        stepNumber: 1,
        status: 'completed',
        toolCalls: [
          toolCall({
            toolCallId: 'read-failed',
            toolName: 'url_read',
            arguments: { url: 'https://example.com/fail' },
            status: 'failed',
            resultSummary: undefined,
            error: 'reader-service 返回 HTTP 502',
          }),
        ],
        contentBlockIds: [],
        startedAt: 1_000,
        completedAt: 2_000,
      }],
    }));

    expect(model.isRenderable).toBe(true);
    expect(model.summary).toBe('执行过程 · 跳过 1 个网页');
    expect(model.readCount).toBe(0);
    expect(model.skippedReadCount).toBe(1);
    expect(model.groups).toHaveLength(0);
  });

  it('selected/read_success evidence 都作为可展示搜索来源', () => {
    const model = buildExecutionProcessModel(run({
      toolDigests: [
        digest({
          sourceRefs: ['ev-selected', 'ev-read'],
          summary: '保留 2 条候选结果，供后续回答筛选。',
        }),
      ],
      evidence: [
        evidence({
          id: 'ev-selected',
          status: 'selected',
          title: '建议深读来源',
          url: 'https://example.com/selected',
          usedByFinalAnswer: false,
        }),
        evidence({
          id: 'ev-read',
          status: 'read_success',
          title: '已深读来源',
          url: 'https://example.com/read',
          usedByFinalAnswer: false,
        }),
        evidence({
          id: 'ev-discarded',
          status: 'discarded',
          title: '不展示来源',
          url: 'https://example.com/discarded',
          usedByFinalAnswer: false,
        }),
      ],
    }));

    expect(model.searchSources.map(source => source.id)).toEqual(['ev-selected', 'ev-read']);
    expect(model.searchCandidateCount).toBe(2);
  });
});
