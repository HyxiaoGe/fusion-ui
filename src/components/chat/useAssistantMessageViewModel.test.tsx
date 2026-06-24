import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import type { Message, SearchSourceSummary } from '@/types/conversation';

const selectorState = {
  stream: {
    messageId: null as string | null,
    textBlocks: {} as Record<string, string>,
    thinkingBlocks: {} as Record<string, string>,
    blockOrder: [] as string[],
    blockTypes: {} as Record<string, 'text' | 'thinking'>,
    totalTextLength: 0,
    displayedTextLength: 0,
    isStreamingReasoning: false,
    isThinkingPhaseComplete: false,
    reasoningStartTime: null as number | null,
    reasoningEndTime: undefined as number | undefined,
    currentRun: null as AgentRunState | null,
    searchSources: [] as SearchSourceSummary[],
  },
};

vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (state: typeof selectorState) => unknown) => selector(selectorState),
}));

import {
  deriveStaticAssistantMessageViewModel,
  useAssistantMessageViewModel,
} from './useAssistantMessageViewModel';

function resetSelectorState() {
  Object.assign(selectorState.stream, {
    messageId: null,
    textBlocks: {},
    thinkingBlocks: {},
    blockOrder: [],
    blockTypes: {},
    totalTextLength: 0,
    displayedTextLength: 0,
    isStreamingReasoning: false,
    isThinkingPhaseComplete: false,
    reasoningStartTime: null,
    reasoningEndTime: undefined,
    currentRun: null,
    searchSources: [],
  });
}

function renderViewModel(message: Message, overrides: Partial<Parameters<typeof useAssistantMessageViewModel>[0]> = {}) {
  return renderHook(() => useAssistantMessageViewModel({
    message,
    isStreaming: false,
    isLastMessage: false,
    isLoadingQuestions: false,
    suggestedQuestionsCount: 0,
    ...overrides,
  }));
}

describe('useAssistantMessageViewModel', () => {
  beforeEach(() => {
    resetSelectorState();
  });

  it('从历史 assistant 消息内容派生正文、搜索来源和回答依据', () => {
    const source = {
      title: 'AI 标准来源',
      url: 'https://example.com/ai-standard',
    };
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [
        { type: 'search', id: 'search-1', query: 'AI 标准', sources: [source] },
        { type: 'text', id: 'text-1', text: '历史正文。[1]' },
      ],
      timestamp: 1,
    };

    const { result } = renderViewModel(message);

    expect(result.current.blocksToRender).toBe(message.content);
    expect(result.current.displayText).toBe('历史正文。[1]');
    expect(result.current.searchSources).toEqual([source]);
    expect(result.current.answerEvidence?.summary).toBe('回答依据 · 搜索 1 条');
    expect(result.current.answerEvidence?.items[0]).toEqual(
      expect.objectContaining({
        kind: 'search_source',
        title: 'AI 标准来源',
        url: 'https://example.com/ai-standard',
      }),
    );
  });

  it('历史 assistant 消息优先用统一 source_refs 派生回答依据', () => {
    const legacySource = {
      title: '旧搜索来源',
      url: 'https://legacy.example.com/search',
    };
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [
        {
          type: 'search',
          id: 'search-1',
          query: 'AI 标准',
          sources: [legacySource],
          source_refs: [
            {
              kind: 'search',
              title: '统一搜索来源',
              url: 'https://unified.example.com/search',
            },
            {
              kind: 'url_read',
              title: '统一读取来源',
              url: 'https://reader.example.com/article',
            },
          ],
        },
        {
          type: 'url_read',
          id: 'url-1',
          url: 'https://legacy.example.com/read',
          title: '旧读取来源',
        },
        { type: 'text', id: 'text-1', text: '历史正文。[1]' },
      ],
      timestamp: 1,
    };

    const { result } = renderViewModel(message);

    expect(result.current.answerEvidence?.summary).toBe('回答依据 · 搜索 1 条 · 读取 1 个网页');
    expect(result.current.answerEvidence?.items).toEqual([
      expect.objectContaining({
        kind: 'search_source',
        title: '统一搜索来源',
        url: 'https://unified.example.com/search',
      }),
      expect.objectContaining({
        kind: 'url_read',
        title: '统一读取来源',
        url: 'https://reader.example.com/article',
      }),
    ]);
  });

  it('聚合历史 assistant 消息里的多次搜索来源', () => {
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [
        {
          type: 'search',
          id: 'search-1',
          query: '第一轮搜索',
          sources: [
            { title: '第一轮来源', url: 'https://first.example.com/a' },
          ],
        },
        {
          type: 'search',
          id: 'search-2',
          query: '第二轮搜索',
          sources: [
            { title: '第二轮来源', url: 'https://second.example.com/b' },
          ],
        },
        { type: 'text', id: 'text-1', text: '聚合后回答。[1][2]' },
      ],
      timestamp: 1,
    };

    const { result } = renderViewModel(message);

    expect(result.current.searchSources).toEqual([
      { title: '第一轮来源', url: 'https://first.example.com/a' },
      { title: '第二轮来源', url: 'https://second.example.com/b' },
    ]);
    expect(result.current.answerEvidence?.summary).toBe('回答依据 · 搜索 2 条');
    expect(result.current.answerEvidence?.items.map(item => item.title)).toEqual([
      '第一轮来源',
      '第二轮来源',
    ]);
  });

  it('聚合多个 search block 的 source_refs 作为统一回答依据', () => {
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [
        {
          type: 'search',
          id: 'search-1',
          query: '第一轮搜索',
          sources: [{ title: '旧来源 1', url: 'https://legacy.example.com/one' }],
          source_refs: [
            {
              kind: 'search',
              title: '统一来源 1',
              url: 'https://ref-one.example.com',
            },
          ],
        },
        {
          type: 'search',
          id: 'search-2',
          query: '第二轮搜索',
          sources: [{ title: '旧来源 2', url: 'https://legacy.example.com/two' }],
          source_refs: [
            {
              kind: 'search',
              title: '统一来源 2',
              url: 'https://ref-two.example.com',
            },
          ],
        },
        { type: 'text', id: 'text-1', text: '聚合后回答。[1][2]' },
      ],
      timestamp: 1,
    };

    const { result } = renderViewModel(message);

    expect(result.current.searchSources).toEqual([
      { title: '统一来源 1', url: 'https://ref-one.example.com', favicon: undefined },
      { title: '统一来源 2', url: 'https://ref-two.example.com', favicon: undefined },
    ]);
    expect(result.current.answerEvidence?.items.map(item => item.title)).toEqual([
      '统一来源 1',
      '统一来源 2',
    ]);
  });

  it('静态历史消息派生不订阅 stream 状态', () => {
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [{ type: 'text', id: 'text-1', text: '历史正文' }],
      timestamp: 1,
    };

    const result = deriveStaticAssistantMessageViewModel({
      message,
      isLoadingQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(result.blocksToRender).toBe(message.content);
    expect(result.displayText).toBe('历史正文');
    expect(result.isCurrentlyStreaming).toBe(false);
  });

  it('静态历史消息同样优先用统一 source_refs 派生回答依据', () => {
    const result = deriveStaticAssistantMessageViewModel({
      message: {
        id: 'assistant-1',
        role: 'assistant',
        content: [
          {
            type: 'search',
            id: 'search-1',
            query: 'AI 标准',
            sources: [{ title: '旧搜索来源', url: 'https://legacy.example.com/search' }],
            source_refs: [
              {
                kind: 'search',
                title: '统一搜索来源',
                url: 'https://unified.example.com/search',
              },
            ],
          },
          { type: 'text', id: 'text-1', text: '历史正文。[1]' },
        ],
        timestamp: 1,
      },
      isLoadingQuestions: false,
      suggestedQuestionsCount: 0,
    });

    expect(result.answerEvidence?.summary).toBe('回答依据 · 搜索 1 条');
    expect(result.answerEvidence?.items[0]).toEqual(
      expect.objectContaining({
        kind: 'search_source',
        title: '统一搜索来源',
        url: 'https://unified.example.com/search',
      }),
    );
  });

  it('流式最后一条消息从 stream blocks 派生正文', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.textBlocks = { 'stream-text-1': '流式正文' };
    selectorState.stream.blockOrder = ['stream-text-1'];
    selectorState.stream.blockTypes = { 'stream-text-1': 'text' };
    selectorState.stream.totalTextLength = 4;
    selectorState.stream.displayedTextLength = 4;

    const { result } = renderViewModel(
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', id: 'persisted-text-1', text: '历史正文' }],
        timestamp: 1,
      },
      { isStreaming: true, isLastMessage: true },
    );

    expect(result.current.isCurrentlyStreaming).toBe(true);
    expect(result.current.blocksToRender).toEqual([
      { type: 'text', id: 'stream-text-1', text: '流式正文' },
    ]);
    expect(result.current.displayText).toBe('流式正文');
  });

  it('currentRun 不归属当前消息时不会污染 activity 状态', () => {
    selectorState.stream.currentRun = {
      runId: 'run-other',
      messageId: 'assistant-other',
      status: 'failed',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 0,
      totalToolCalls: 0,
      lastSequence: 1,
      steps: [],
      failure: { code: 'provider_error', message: 'failed' },
    };

    const { result } = renderViewModel({
      id: 'assistant-1',
      role: 'assistant',
      content: [{ type: 'text', id: 'text-1', text: '当前消息正常回答。' }],
      timestamp: 1,
    });

    expect(result.current.activity.kind).toBe('completed');
    expect(result.current.activity.issue).toBeNull();
  });

  it('thinking 文本提到搜索但没有真实工具调用时不产生来源或回答依据', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.thinkingBlocks = { 'thinking-1': '我需要搜索一下，但这里没有真实工具调用。' };
    selectorState.stream.blockOrder = ['thinking-1'];
    selectorState.stream.blockTypes = { 'thinking-1': 'thinking' };
    selectorState.stream.isStreamingReasoning = true;
    selectorState.stream.reasoningStartTime = 123;

    const { result } = renderViewModel(
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [],
        timestamp: 1,
      },
      { isStreaming: true, isLastMessage: true },
    );

    expect(result.current.activity.kind).toBe('reasoning');
    expect(result.current.displayThinking).toBe('我需要搜索一下，但这里没有真实工具调用。');
    expect(result.current.hasThinking).toBe(true);
    expect(result.current.searchSources).toEqual([]);
    expect(result.current.answerEvidence).toBeNull();
  });
});
