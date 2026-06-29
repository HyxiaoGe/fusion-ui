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

  it('真实 url_read 只把成功读取计入读取数，失败读取进入跳过数', () => {
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
    expect(model.summary).toBe('执行过程 · 读取 1 个网页');
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
    expect(model.summary).toBe('执行过程 · 搜索 2 次 · 读取 1 个网页');
    expect(model.searchCandidateCount).toBe(7);
    expect(model.skippedReadCount).toBe(1);
    expect(model.groups).toHaveLength(0);
  });
});
