import { describe, expect, it } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import type { ContentBlock } from '@/types/conversation';
import { deriveAssistantActivity } from './assistantActivity';

function makeRun(overrides: Partial<AgentRunState>): AgentRunState {
  return {
    runId: 'run-1',
    messageId: 'assistant-1',
    status: 'running',
    config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
    totalSteps: 1,
    totalToolCalls: 0,
    steps: [],
    lastSequence: 1,
    ...overrides,
  };
}

describe('deriveAssistantActivity', () => {
  it('does not infer search from thinking text', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'thinking',
        id: 'think-1',
        thinking: '我应该搜索一下，但这里没有真实 tool_call。',
      },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: blocks,
      currentRun: null,
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('reasoning');
    expect(activity.tool).toBeNull();
    expect(activity.searchBlock).toBeNull();
    expect(activity.shouldShowSources).toBe(false);
  });

  it('prioritizes a running web_search tool over reasoning', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', id: 'think-1', thinking: '正在判断是否需要搜索。' },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: blocks,
      currentRun: makeRun({
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'running',
            startedAt: 1,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: 'AI 异常检测' },
                status: 'running',
                startedAt: 1,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('tool_running');
    expect(activity.tool?.kind).toBe('web_search');
    expect(activity.tool?.target).toBe('AI 异常检测');
    expect(activity.shouldSuppressReasoning).toBe(true);
  });

  it('derives url_read running state with hostname target', () => {
    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: [],
      currentRun: makeRun({
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'running',
            startedAt: 1,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'url_read',
                arguments: { url: 'https://example.com/path?q=1' },
                status: 'running',
                startedAt: 1,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('tool_running');
    expect(activity.tool?.kind).toBe('url_read');
    expect(activity.tool?.target).toBe('example.com');
  });

  it.each([
    {
      toolName: 'local_place_search',
      arguments: { query: '烤肉', location: '深圳民治' },
      label: '正在搜索附近地点',
      target: '深圳民治 · 烤肉',
    },
    {
      toolName: 'route_compare',
      arguments: { origin: '民治地铁站', destination: '星河 WORLD' },
      label: '正在比较路线',
      target: '民治地铁站 → 星河 WORLD',
    },
  ])('为稳定工具 $toolName 派生可区分的实时状态', ({ toolName, arguments: args, label, target }) => {
    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: [],
      currentRun: makeRun({
        steps: [{
          stepId: 'step-1',
          stepNumber: 1,
          status: 'running',
          startedAt: 1,
          contentBlockIds: [],
          toolCalls: [{
            toolCallId: 'tool-1',
            toolName,
            arguments: args,
            status: 'running',
            startedAt: 1,
          }],
        }],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('tool_running');
    expect(activity.tool).toMatchObject({ kind: 'other', toolName, label, target });
  });

  it('prioritizes answering over reasoning once text is visible', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', id: 'think-1', thinking: '推理内容' },
      { type: 'text', id: 'text-1', text: '正文已经开始输出' },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: blocks,
      currentRun: null,
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('answering');
    expect(activity.hasText).toBe(true);
    expect(activity.hasThinking).toBe(true);
  });

  it('keeps completed as the primary state while suggestions are loading', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', id: 'text-1', text: '回答完成' },
    ];

    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: blocks,
      currentRun: makeRun({ status: 'completed' }),
      messageStatus: null,
      isLoadingSuggestedQuestions: true,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('completed');
    expect(activity.suggestionState).toBe('loading');
  });

  it('surfaces degraded search as a completed-state issue', () => {
    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [{ type: 'text', id: 'text-1', text: '基于已有信息回答。' }],
      currentRun: makeRun({
        status: 'completed',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'completed',
            startedAt: 1,
            completedAt: 2,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: 'AI 新闻' },
                status: 'degraded',
                error: 'timeout',
                startedAt: 1,
                completedAt: 2,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('completed');
    expect(activity.issue?.kind).toBe('degraded');
    expect(activity.issue?.toolKind).toBe('web_search');
  });

  it('does not keep an old failed search issue after the same query succeeds later', () => {
    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [
        {
          type: 'search',
          id: 'search-1',
          query: 'AI 新闻',
          sources: [{ title: 'AI 新闻来源', url: 'https://example.com/ai' }],
        },
        { type: 'text', id: 'text-1', text: '基于最新搜索结果回答。' },
      ],
      currentRun: makeRun({
        status: 'completed',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'completed',
            startedAt: 1,
            completedAt: 2,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: 'AI 新闻' },
                status: 'failed',
                error: 'timeout',
                startedAt: 1,
                completedAt: 2,
              },
            ],
          },
          {
            stepId: 'step-2',
            stepNumber: 2,
            status: 'completed',
            startedAt: 3,
            completedAt: 4,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-2',
                toolName: 'web_search',
                arguments: { query: 'AI 新闻' },
                status: 'success',
                startedAt: 3,
                completedAt: 4,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.issue).toBeNull();
    expect(activity.shouldShowSources).toBe(true);
  });

  it('uses the latest search block for sources and empty-result issue decisions', () => {
    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [
        { type: 'search', id: 'search-1', query: '第一轮搜索', sources: [] },
        {
          type: 'search',
          id: 'search-2',
          query: '第二轮搜索',
          sources: [{ title: '第二轮来源', url: 'https://example.com/second' }],
        },
        { type: 'text', id: 'text-1', text: '基于第二轮搜索回答。' },
      ],
      currentRun: null,
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.searchBlock?.query).toBe('第二轮搜索');
    expect(activity.issue).toBeNull();
    expect(activity.shouldShowSources).toBe(true);
  });

  it('ignores an old failed search when the latest search query has sources', () => {
    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [
        { type: 'search', id: 'search-1', query: '旧搜索', sources: [] },
        {
          type: 'search',
          id: 'search-2',
          query: '最新搜索',
          sources: [{ title: '最新来源', url: 'https://example.com/latest' }],
        },
      ],
      currentRun: makeRun({
        status: 'completed',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'completed',
            startedAt: 1,
            completedAt: 2,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: '旧搜索' },
                status: 'failed',
                error: 'timeout',
                startedAt: 1,
                completedAt: 2,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.issue).toBeNull();
    expect(activity.shouldShowSources).toBe(true);
    expect(activity.searchBlock?.query).toBe('最新搜索');
  });

  it('uses empty issue for the latest empty search instead of an old failed query', () => {
    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [
        { type: 'search', id: 'search-1', query: '旧搜索', sources: [] },
        { type: 'search', id: 'search-2', query: '最新搜索', sources: [] },
      ],
      currentRun: makeRun({
        status: 'completed',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'completed',
            startedAt: 1,
            completedAt: 2,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: '旧搜索' },
                status: 'failed',
                error: 'timeout',
                startedAt: 1,
                completedAt: 2,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.issue?.kind).toBe('empty');
    expect(activity.issue?.title).toBe('未找到可用搜索结果');
    expect(activity.searchBlock?.query).toBe('最新搜索');
  });

  it('prioritizes a failed url_read issue over an empty latest search block', () => {
    const activity = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [
        { type: 'search', id: 'search-1', query: '最新搜索', sources: [] },
      ],
      currentRun: makeRun({
        status: 'completed',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'completed',
            startedAt: 1,
            completedAt: 2,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'url_read',
                arguments: { url: 'https://example.com/missing' },
                status: 'failed',
                error: '404',
                startedAt: 1,
                completedAt: 2,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.issue?.toolKind).toBe('url_read');
    expect(activity.issue?.title).toBe('网页暂时无法读取');
    expect(activity.issue?.detail).toBe('未使用该页面内容');
  });

  it('failed and interrupted override tool and text states', () => {
    const failed = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [{ type: 'text', id: 'text-1', text: '部分正文' }],
      currentRun: makeRun({
        status: 'failed',
        failure: { code: 'provider_error', message: 'upstream failed' },
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'running',
            startedAt: 1,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'web_search',
                arguments: { query: '仍在运行的搜索' },
                status: 'running',
                startedAt: 1,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    const interrupted = deriveAssistantActivity({
      isStreaming: false,
      isCurrentlyStreaming: false,
      contentBlocks: [{ type: 'text', id: 'text-1', text: '部分正文' }],
      currentRun: makeRun({
        status: 'interrupted',
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'running',
            startedAt: 1,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'url_read',
                arguments: { url: 'https://example.com/running' },
                status: 'running',
                startedAt: 1,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(failed.kind).toBe('failed');
    expect(failed.tool).toBeNull();
    expect(interrupted.kind).toBe('interrupted');
    expect(interrupted.tool).toBeNull();
  });

  it('falls back to the raw url when url_read target cannot be parsed', () => {
    const activity = deriveAssistantActivity({
      isStreaming: true,
      isCurrentlyStreaming: true,
      contentBlocks: [],
      currentRun: makeRun({
        steps: [
          {
            stepId: 'step-1',
            stepNumber: 1,
            status: 'running',
            startedAt: 1,
            contentBlockIds: [],
            toolCalls: [
              {
                toolCallId: 'tool-1',
                toolName: 'url_read',
                arguments: { url: 'not a valid url' },
                status: 'running',
                startedAt: 1,
              },
            ],
          },
        ],
      }),
      messageStatus: null,
      isLoadingSuggestedQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(activity.kind).toBe('tool_running');
    expect(activity.tool?.kind).toBe('url_read');
    expect(activity.tool?.target).toBe('not a valid url');
  });
});
