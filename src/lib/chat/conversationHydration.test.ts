import { describe, expect, it } from 'vitest';

import {
  buildChatFromServerConversation,
  getConversationHydrationView,
  parseServerTimestamp,
  shouldHydrateConversation,
} from './conversationHydration';

describe('conversationHydration', () => {
  it('从最新 assistant message usage.context 恢复上下文状态，旧历史保持兼容', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-context',
      title: 'Context chat',
      model_id: 'kimi-k2.5',
      messages: [
        {
          id: 'assistant-old',
          role: 'assistant',
          content: [{ type: 'text', id: 'old', text: '旧消息' }],
          usage: { input_tokens: 10, output_tokens: 2 },
        },
        {
          id: 'assistant-new',
          role: 'assistant',
          content: [{ type: 'text', id: 'new', text: '新消息' }],
          usage: {
            input_tokens: 147_811,
            output_tokens: 20,
            context: {
              status: 'trimmed',
              window_tokens: 262_144,
              estimated_tokens_before: 232_305,
              estimated_tokens_after: 192_280,
              actual_prompt_tokens: 147_811,
              removed_turns: 1,
              removed_messages: 2,
              removed_tool_transactions: 0,
              round_index: 1,
            },
          },
        },
      ],
    });

    expect(chat.messages[0].usage).toEqual({ input_tokens: 10, output_tokens: 2 });
    expect(chat.messages[1].usage?.context).toMatchObject({
      status: 'trimmed',
      actual_prompt_tokens: 147_811,
      removed_turns: 1,
    });
  });
  it('parses plain database timestamps as utc values', () => {
    expect(parseServerTimestamp('2026-03-14 21:30:00')).toBe(new Date('2026-03-14T21:30:00Z').getTime());
  });

  it('强刷水合时保留服务端 sequence 顺序，不再按异常时间戳反转消息', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-server-order',
      title: 'Server ordered chat',
      model_id: 'deepseek-chat',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          sequence: 41,
          content: [{ type: 'text', id: 'blk_u1', text: '用户问题' }],
          created_at: '2026-07-13T23:17:10',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          sequence: 42,
          content: [{ type: 'text', id: 'blk_a1', text: '助手回答' }],
          created_at: '2026-07-13T15:17:17',
        },
      ],
    });

    expect(chat.messages.map((message) => ({ id: message.id, sequence: message.sequence }))).toEqual([
      { id: 'user-1', sequence: 41 },
      { id: 'assistant-1', sequence: 42 },
    ]);
  });

  it('兼容没有 sequence 的旧响应并原样消费服务端数组顺序', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-legacy-order',
      title: 'Legacy ordered chat',
      model_id: 'deepseek-chat',
      messages: [
        {
          id: 'user-legacy',
          role: 'user',
          content: [{ type: 'text', id: 'blk_u', text: '旧用户消息' }],
          created_at: '2026-07-13T23:17:10',
        },
        {
          id: 'assistant-legacy',
          role: 'assistant',
          content: [{ type: 'text', id: 'blk_a', text: '旧助手消息' }],
          created_at: '2026-07-13T15:17:17',
        },
      ],
    });

    expect(chat.messages.map((message) => message.id)).toEqual(['user-legacy', 'assistant-legacy']);
    expect(chat.messages.every((message) => message.sequence === undefined)).toBe(true);
  });

  it('requests hydration for missing or empty local chats', () => {
    expect(shouldHydrateConversation(null)).toBe(true);
    expect(shouldHydrateConversation({ messages: [] })).toBe(true);
    expect(shouldHydrateConversation({ messages: [{ id: 'msg-1' }] as any[] })).toBe(false);
  });

  it('treats empty-shell chats with server errors as a hydration error state', () => {
    expect(
      getConversationHydrationView({
        chatId: 'chat-1',
        chat: { messages: [] },
        isLoadingServerChat: false,
        serverError: '加载聊天数据失败',
      })
    ).toBe('error');
  });

  it('treats empty-shell chats without errors as loading until hydrated', () => {
    expect(
      getConversationHydrationView({
        chatId: 'chat-1',
        chat: { messages: [] },
        isLoadingServerChat: false,
        serverError: null,
      })
    ).toBe('loading');
  });

  it('hydrates assistant thinking blocks from content', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-1',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      created_at: '2026-03-14T08:00:00Z',
      updated_at: '2026-03-14T08:02:00Z',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [
            { type: 'thinking', id: 'blk_t1', thinking: 'thinking...' },
            { type: 'text', id: 'blk_a1', text: 'world' },
          ],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
    });
    expect(chat.messages[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: [
        { type: 'thinking', id: 'blk_t1', thinking: 'thinking...' },
        { type: 'text', id: 'blk_a1', text: 'world' },
      ],
      isReasoningVisible: false,
    });
  });

  it('hydrates assistant messages without thinking blocks', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-2',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'blk_a1', text: 'world' }],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages[1]).toMatchObject({
      id: 'assistant-1',
      isReasoningVisible: undefined,
    });
  });

  it('preserves all content blocks in the hydrated messages', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-3',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [
            { type: 'thinking', id: 'blk_t1', thinking: 'deep thought' },
            { type: 'text', id: 'blk_a1', text: 'world' },
          ],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(chat.messages[1].content).toHaveLength(2);
    expect(chat.messages[1].content[0]).toMatchObject({ type: 'thinking', thinking: 'deep thought' });
    expect(chat.messages[1].content[1]).toMatchObject({ type: 'text', text: 'world' });
  });

  it('未来富结果不会让历史消息变空，也不会把原始 payload 带入页面', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-future-result',
      title: 'Future result chat',
      model_id: 'qwen-max-latest',
      messages: [{
        id: 'assistant-future',
        role: 'assistant',
        content: [{
          type: 'future_private_result',
          id: 'future-1',
          schema_version: 8,
          access_token: 'should-never-reach-ui-state',
        }],
      }],
    });

    expect(chat.messages[0].content).toEqual([{
      type: 'unsupported_result',
      id: 'future-1',
      source_type: 'future_private_result',
      source_schema_version: 8,
      reason: 'unsupported_type',
    }]);
    expect(JSON.stringify(chat.messages[0].content)).not.toContain('should-never-reach-ui-state');
  });

  it('历史恢复把缺少 type 的损坏结果降级为安全占位', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-invalid-result',
      title: 'Invalid result chat',
      model_id: 'qwen-max-latest',
      messages: [{
        id: 'assistant-invalid',
        role: 'assistant',
        content: [{
          id: 'broken-1',
          schema_version: 1,
          secret: 'must-not-reach-ui-state',
        }],
      }],
    });

    expect(chat.messages[0].content).toEqual([{
      type: 'unsupported_result',
      id: 'broken-1',
      source_type: 'unknown',
      source_schema_version: 1,
      reason: 'invalid_payload',
    }]);
    expect(JSON.stringify(chat.messages[0].content)).not.toContain('must-not-reach-ui-state');
  });

  it('强刷后恢复地点与路线结果块，并保留可选字段的安全缺省', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-results',
      title: '地图结果',
      model_id: 'qwen-max-latest',
      messages: [{
        id: 'assistant-results',
        role: 'assistant',
        content: [
          {
            type: 'place_results',
            id: 'places-1',
            schema_version: 1,
            provider: 'amap',
            query: '烤肉',
            near: '深圳民治',
            status: 'success',
            result_count: 1,
            places: [{
              provider_place_id: 'p1',
              name: '民治烤肉店',
              photos: [{ url: 'https://img.example.com/place.jpg' }],
              platform_url: 'https://www.amap.com/place/p1',
            }],
            limitations: ['不包含实时排队信息'],
            tool_call_log_id: 'tc-place',
          },
          {
            type: 'route_results',
            id: 'routes-1',
            schema_version: 1,
            provider: 'amap',
            status: 'degraded',
            origin: { label: '民治地铁站' },
            destination: { label: '星河 WORLD', city: '深圳' },
            routes: [{ mode: 'driving', distance_m: 6200, duration_s: 1100 }],
            unavailable_modes: ['transit'],
            limitations: [],
            tool_call_log_id: 'tc-route',
          },
          { type: 'text', id: 'answer-1', text: '推荐如下。' },
        ],
      }],
    });

    expect(chat.messages[0].content).toEqual([
      expect.objectContaining({
        type: 'place_results',
        id: 'places-1',
        places: [expect.objectContaining({ name: '民治烤肉店' })],
      }),
      expect.objectContaining({
        type: 'route_results',
        id: 'routes-1',
        status: 'degraded',
        unavailable_modes: ['transit'],
      }),
      { type: 'text', id: 'answer-1', text: '推荐如下。' },
    ]);
  });

  it('强刷后恢复航班和高铁富结果及安全预订动作', () => {
    const common = {
      schema_version: 1,
      provider: 'flyai',
      attribution: { label: '飞猪旅行' },
      status: 'success',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
      result_count: 1,
    };
    const chat = buildChatFromServerConversation({
      id: 'chat-travel-results',
      title: '跨城出行结果',
      model_id: 'qwen-max-latest',
      messages: [{
        id: 'assistant-travel-results',
        role: 'assistant',
        content: [
          {
            ...common,
            type: 'flight_results',
            id: 'flights-1',
            origin: '深圳',
            destination: '上海',
            flights: [{
              option_id: 'flight-1',
              flight_no: 'CZ1234',
              departure: { city: '深圳', station_name: '深圳宝安国际机场', scheduled_at: '2026-08-01T08:30:00+08:00' },
              arrival: { city: '上海', station_name: '上海虹桥国际机场', scheduled_at: '2026-08-01T10:45:00+08:00' },
              duration_s: 8_100,
              stops: 0,
              actions: [{ kind: 'open_external', label: '安全预订', url: 'https://a.feizhu.com/flight/1' }],
            }],
          },
          {
            ...common,
            type: 'train_results',
            id: 'trains-1',
            origin: '深圳北',
            destination: '广州南',
            trains: [{
              option_id: 'train-1',
              train_no: 'G100',
              departure: { city: '深圳', station_name: '深圳北站', scheduled_at: '2026-08-01T09:00:00+08:00' },
              arrival: { city: '广州', station_name: '广州南站', scheduled_at: '2026-08-01T09:32:00+08:00' },
              duration_s: 1_920,
              stops: 0,
              actions: [],
            }],
          },
        ],
      }],
    });

    expect(chat.messages[0].content).toEqual([
      expect.objectContaining({ type: 'flight_results', flights: [expect.objectContaining({ flight_no: 'CZ1234' })] }),
      expect.objectContaining({ type: 'train_results', trains: [expect.objectContaining({ train_no: 'G100' })] }),
    ]);
  });

  it('强刷后同时保留失败搜索状态和可用地点结果，供活动状态按整体结果派生', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-partial-results',
      title: '部分工具结果',
      model_id: 'qwen-max-latest',
      messages: [{
        id: 'assistant-results',
        role: 'assistant',
        content: [
          {
            type: 'search',
            id: 'search-1',
            query: '深圳民治烤肉',
            status: 'failed',
            sources: [],
            source_count: 0,
          },
          {
            type: 'place_results',
            id: 'places-1',
            schema_version: 1,
            provider: 'amap',
            query: '深圳民治烤肉',
            status: 'success',
            result_count: 1,
            places: [{ provider_place_id: 'p1', name: '民治烤肉店' }],
          },
          { type: 'text', id: 'answer-1', text: '推荐如下。' },
        ],
      }],
    });

    expect(chat.messages[0].content).toEqual([
      expect.objectContaining({
        type: 'search',
        status: 'failed',
        sources: [],
      }),
      expect.objectContaining({
        type: 'place_results',
        status: 'success',
        places: [expect.objectContaining({ name: '民治烤肉店' })],
      }),
      { type: 'text', id: 'answer-1', text: '推荐如下。' },
    ]);
  });

  it('preserves file thumbnail metadata while hydrating file blocks', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-files',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [
            {
              type: 'file',
              id: 'file-block-1',
              file_id: 'file-1',
              filename: 'diagram.png',
              mime_type: 'image/png',
              thumbnail_url: 'https://cdn.example.com/thumbs/file-1.png',
              width: 640,
              height: 360,
            },
          ],
          created_at: '2026-03-14T08:00:00Z',
        },
      ],
    });

    expect(chat.messages[0].content).toEqual([
      {
        type: 'file',
        id: 'file-block-1',
        file_id: 'file-1',
        filename: 'diagram.png',
        mime_type: 'image/png',
        thumbnail_url: 'https://cdn.example.com/thumbs/file-1.png',
        width: 640,
        height: 360,
      },
    ]);
  });

  it('hydrates network source metadata from search and url_read blocks', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-4',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [
            {
              type: 'search',
              id: 'search-1',
              query: 'AI 标准',
              tool_call_log_id: 'tc-search',
              sources: [{ title: '旧搜索来源', url: 'https://legacy.example.com' }],
              status: 'success',
              source_count: 1,
              source_refs: [
                {
                  kind: 'search',
                  title: '统一搜索来源',
                  url: 'https://unified.example.com/search',
                  tool_call_log_id: 'tc-search',
                },
              ],
            },
            {
              type: 'url_read',
              id: 'url-1',
              url: 'https://reader.example.com/article',
              title: '读取来源',
              status: 'degraded',
              error_message: 'timeout',
              source_count: 0,
              source_refs: [],
            },
          ],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages[0].content).toEqual([
      expect.objectContaining({
        type: 'search',
        status: 'success',
        source_count: 1,
        source_refs: [
          expect.objectContaining({
            kind: 'search',
            title: '统一搜索来源',
            url: 'https://unified.example.com/search',
            tool_call_log_id: 'tc-search',
          }),
        ],
      }),
      expect.objectContaining({
        type: 'url_read',
        status: 'degraded',
        error_message: 'timeout',
        source_count: 0,
        source_refs: [],
      }),
    ]);
  });

  it('preserves search provider metadata while hydrating search blocks', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-5',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [
            {
              type: 'search',
              id: 'search-1',
              query: 'AI 标准',
              sources: [{ title: '来源', url: 'https://example.com' }],
              requested_provider: 'firecrawl',
              result_provider: 'brave',
              fallback_used: true,
              provider_chain: ['firecrawl', 'brave'],
            },
          ],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages[0].content[0]).toMatchObject({
      type: 'search',
      requested_provider: 'firecrawl',
      result_provider: 'brave',
      fallback_used: true,
      provider_chain: ['firecrawl', 'brave'],
    });
  });

  it('hydrates latest agent run summary from assistant messages', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-6',
      title: 'Server chat',
      model_id: 'deepseek-chat',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'blk_a1', text: '触顶回答' }],
          created_at: '2026-03-14T08:00:02Z',
          agent_run: {
            run_id: 'run-1',
            status: 'limit_reached',
            config: { max_steps: 3, max_tool_calls: 5, timeout_s: 60 },
            total_steps: 3,
            total_tool_calls: 5,
            limit_reason: 'max_steps',
          },
        } as any,
      ],
    });

    expect(chat.messages[0].agent_run).toMatchObject({
      runId: 'run-1',
      messageId: 'assistant-1',
      serverMessageId: 'assistant-1',
      status: 'limit_reached',
      config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
      totalSteps: 3,
      totalToolCalls: 5,
      limitReachedReason: 'max_steps',
      steps: [],
    });
  });

  it('hydrates agent progress snapshot from assistant messages', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-7',
      title: 'Server chat',
      model_id: 'deepseek-chat',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'blk_a1', text: '带进度的回答' }],
          created_at: '2026-03-14T08:00:02Z',
          agent_run: {
            run_id: 'run-1',
            status: 'completed',
            progress: {
              run_id: 'run-1',
              message_id: 'assistant-1',
              status: 'completed',
              progress: {
                phase: 'synthesizing',
                label: '正在整理结论',
                completed_steps: 2,
                total_steps: 3,
                completed_tool_calls: 1,
                max_tool_calls: 5,
              },
              plan: {
                plan_id: 'plan-run-1',
                revision: 2,
                items: [
                  {
                    id: 'search',
                    title: '搜索资料',
                    status: 'completed',
                    kind: 'search',
                    summary: '找到 2 条来源',
                    tool_names: ['web_search'],
                    evidence_item_ids: ['ev-1'],
                  },
                ],
              },
              tool_digests: [
                {
                  tool_call_id: 'tc-1',
                  tool_name: 'web_search',
                  status: 'success',
                  title: '搜索资料',
                  summary: '找到 2 条来源',
                  key_findings: ['G7 讨论 AI 标准'],
                  source_refs: ['https://example.com/news'],
                  truncated: false,
                },
              ],
              evidence: [
                {
                  id: 'ev-1',
                  kind: 'web',
                  status: 'read_success',
                  title: '新闻来源',
                  url: 'https://example.com/news',
                  domain: 'example.com',
                  claim: 'G7 讨论 AI 标准',
                  snippet: '来源摘要',
                  used_by_final_answer: true,
                },
              ],
            },
          },
        } as any,
      ],
    });

    expect(chat.messages[0].agent_run).toMatchObject({
      runId: 'run-1',
      protocolVersion: 2,
      progress: {
        phase: 'synthesizing',
        label: '正在整理结论',
        completedSteps: 2,
        totalSteps: 3,
        completedToolCalls: 1,
        maxToolCalls: 5,
      },
      plan: {
        planId: 'plan-run-1',
        revision: 2,
        items: [
          {
            id: 'search',
            title: '搜索资料',
            status: 'completed',
            kind: 'search',
            summary: '找到 2 条来源',
            toolNames: ['web_search'],
            evidenceItemIds: ['ev-1'],
          },
        ],
      },
      toolDigests: [
        {
          toolCallId: 'tc-1',
          toolName: 'web_search',
          status: 'success',
          title: '搜索资料',
          summary: '找到 2 条来源',
          keyFindings: ['G7 讨论 AI 标准'],
          sourceRefs: ['https://example.com/news'],
          truncated: false,
        },
      ],
      evidence: [
        {
          id: 'ev-1',
          kind: 'web',
          status: 'read_success',
          title: '新闻来源',
          url: 'https://example.com/news',
          domain: 'example.com',
          claim: 'G7 讨论 AI 标准',
          snippet: '来源摘要',
          usedByFinalAnswer: true,
        },
      ],
    });
  });
});
