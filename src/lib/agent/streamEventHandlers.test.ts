import { describe, expect, it, vi } from 'vitest';
import { createAgentStreamEventHandlers } from './streamEventHandlers';

describe('createAgentStreamEventHandlers', () => {
  it('映射 v1 run_started 和 v2 progress 到 Redux action', () => {
    const dispatch = vi.fn();
    const setServerMessageId = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
      setServerMessageId,
    });

    handlers.onRunStarted?.({
      type: 'run_started',
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'r1',
      ts: 0,
      conversation_id: 'c1',
      message_id: 'm1',
      model: 'gpt',
      tools: [],
      config: {
        max_steps: 8,
        max_tool_calls: 20,
        timeout_s: 300,
        plan_mode: 'on',
        task_mode: 'deep_research',
        network_profile: 'deep_research',
        evidence_policy: 'deep_research_v1',
      },
    });
    handlers.onRunProgressUpdated?.({
      type: 'run_progress_updated',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 1,
      trace_id: 'r1',
      ts: 0,
      phase: 'planning',
      label: '正在理解问题',
      completed_steps: 0,
      total_steps: 4,
    });

    expect(setServerMessageId).toHaveBeenCalledWith('m1');
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'stream/initRun',
      payload: {
        runId: 'r1',
        messageId: 'm1',
        serverMessageId: 'm1',
        config: {
          maxSteps: 8,
          maxToolCalls: 20,
          timeoutS: 300,
          planMode: 'on',
          taskMode: 'deep_research',
          networkProfile: 'deep_research',
          evidencePolicy: 'deep_research_v1',
        },
        sequence: 0,
      },
    });
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: 'stream/updateRunProgress',
      payload: {
        runId: 'r1',
        sequence: 1,
        progress: { phase: 'planning', label: '正在理解问题', completedSteps: 0, totalSteps: 4 },
      },
    });
  });

  it('新旧 plan 事件归一化为同一 Redux 状态结构', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });
    const envelope = {
      protocol_version: 2 as const,
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      trace_id: 'r1',
      ts: 0,
    };

    handlers.onPlanSnapshot?.({
      ...envelope,
      type: 'plan_snapshot',
      sequence: 1,
      plan_id: 'plan-model',
      revision: 2,
      mode: 'on',
      source: 'model',
      reason: 'model_update',
      items: [{
        id: 'research',
        title: '研究资料',
        status: 'running',
        kind: 'other',
        tool_names: [],
        evidence_item_ids: [],
        depends_on: ['understand'],
        planned_tools: ['web_search'],
      }],
    } as Parameters<NonNullable<typeof handlers.onPlanSnapshot>>[0]);
    handlers.onPlanSnapshot?.({
      ...envelope,
      type: 'plan_snapshot',
      sequence: 2,
      plan_id: 'plan-legacy',
      revision: 1,
      items: [],
    });
    handlers.onPlanStepUpdated?.({
      ...envelope,
      type: 'plan_step_updated',
      sequence: 3,
      plan_id: 'plan-model',
      revision: 3,
      mode: 'on',
      source: 'model',
      reason: 'model_update',
      item: {
        id: 'research',
        title: '研究资料',
        status: 'completed',
        kind: 'other',
        depends_on: ['understand'],
        planned_tools: ['web_search'],
      },
    } as Parameters<NonNullable<typeof handlers.onPlanStepUpdated>>[0]);

    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'stream/applyPlanSnapshot',
      payload: {
        runId: 'r1',
        sequence: 1,
        plan: {
          planId: 'plan-model',
          revision: 2,
          mode: 'on',
          source: 'model',
          reason: 'model_update',
          items: [{
            id: 'research',
            dependsOn: ['understand'],
            plannedTools: ['web_search'],
          }],
        },
      },
    });
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: 'stream/applyPlanSnapshot',
      payload: {
        plan: {
          planId: 'plan-legacy',
          mode: 'auto',
          source: 'observed',
          reason: 'legacy_observed',
          items: [],
        },
      },
    });
    expect(dispatch.mock.calls[2][0]).toMatchObject({
      type: 'stream/updatePlanStep',
      payload: {
        planId: 'plan-model',
        revision: 3,
        mode: 'on',
        source: 'model',
        reason: 'model_update',
        item: {
          id: 'research',
          dependsOn: ['understand'],
          plannedTools: ['web_search'],
        },
      },
    });
  });

  it('inactive 时忽略所有 agent event', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => false,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onRunStarted?.({
      type: 'run_started',
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'r1',
      ts: 0,
      conversation_id: 'c1',
      message_id: 'm1',
      model: 'gpt',
      tools: [],
      config: {},
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('把 step_completed 的工具调用数传给 Redux', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onStepCompleted?.({
      type: 'step_completed',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 3,
      trace_id: 'r1',
      ts: 0,
      step_number: 1,
      tool_call_count: 1,
      duration_ms: 100,
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/finalizeStep',
      payload: {
        runId: 'r1',
        stepId: 's1',
        toolCallCount: 1,
        sequence: 3,
      },
    }));
  });

  it('把工具事件的 plan_item_id 归一化为 Redux 的 planItemId', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });
    const envelope = {
      protocol_version: 2 as const,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-route',
      trace_id: 'r1',
      ts: 0,
      plan_item_id: 'compare-routes',
    };

    handlers.onToolCallStarted?.({
      ...envelope,
      type: 'tool_call_started',
      sequence: 2,
      tool_name: 'route_compare',
      arguments: { origin: '深圳', destination: '上海' },
    });
    handlers.onToolCallCompleted?.({
      ...envelope,
      type: 'tool_call_completed',
      sequence: 3,
      tool_name: 'route_compare',
      status: 'success',
      duration_ms: 100,
      result_summary: { kind: 'route', truncated: false },
    });
    handlers.onToolResultDigest?.({
      ...envelope,
      type: 'tool_result_digest',
      sequence: 4,
      tool_name: 'route_compare',
      status: 'success',
      title: '路线比较完成',
      summary: '已比较 3 种出行方式',
      truncated: false,
    });

    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'stream/pushToolCall',
      payload: {
        toolCallId: 'tc-route',
        planItemId: 'compare-routes',
      },
    });
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: 'stream/finalizeToolCall',
      payload: {
        toolCallId: 'tc-route',
        planItemId: 'compare-routes',
      },
    });
    expect(dispatch.mock.calls[2][0]).toMatchObject({
      type: 'stream/upsertToolDigest',
      payload: {
        digest: {
          toolCallId: 'tc-route',
          planItemId: 'compare-routes',
        },
      },
    });
  });

  it('把 content_block_discarded 映射为精确的 block 撤回', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockDiscarded?.({
      type: 'content_block_discarded',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 2,
      trace_id: 'r1',
      ts: 0,
      block_id: 'tool-preamble',
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/discardContentBlock',
      payload: {
        runId: 'r1',
        blockId: 'tool-preamble',
        sequence: 2,
      },
    }));
  });

  it('映射 selected evidence event 到 Redux action', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onEvidenceItemUpserted?.({
      type: 'evidence_item_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-search',
      sequence: 3,
      trace_id: 'r1',
      ts: 0,
      evidence: {
        id: 'ev-web-1',
        kind: 'web',
        status: 'selected',
        title: '建议深读来源',
        url: 'https://example.com/report',
        domain: 'example.com',
        claim: '建议深读：官方来源',
        snippet: '来自搜索关键词：OpenAI',
        citation_index: 3,
        used_by_final_answer: false,
      },
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/upsertEvidenceItem',
      payload: expect.objectContaining({
        runId: 'r1',
        sequence: 3,
        evidence: expect.objectContaining({
          id: 'ev-web-1',
          status: 'selected',
          citationIndex: 3,
          usedByFinalAnswer: false,
        }),
      }),
    }));
  });

  it('把 content_block_upserted 的规范 content_block 写入 stream staticBlocks', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockUpserted?.({
      type: 'content_block_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-place',
      sequence: 4,
      trace_id: 'r1',
      ts: 0,
      content_block: {
        type: 'place_results',
        id: 'places-1',
        schema_version: 1,
        provider: 'amap',
        query: '烤肉',
        near: '深圳民治',
        status: 'success',
        result_count: 1,
        places: [{ provider_place_id: 'p1', name: '民治烤肉店' }],
        limitations: [],
        tool_call_log_id: 'tc-place',
      },
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/upsertStaticContentBlock',
      payload: expect.objectContaining({
        runId: 'r1',
        sequence: 4,
        block: expect.objectContaining({
          type: 'place_results',
          id: 'places-1',
          provider: 'amap',
        }),
      }),
    }));
  });

  it('把航班富结果事件规范化后写入 stream staticBlocks', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockUpserted?.({
      type: 'content_block_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-flight',
      sequence: 7,
      trace_id: 'r1',
      ts: 0,
      content_block: {
        type: 'flight_results',
        id: 'flights-1',
        schema_version: 1,
        provider: 'flyai',
        status: 'success',
        origin: '深圳',
        destination: '上海',
        departure_date: '2026-08-01',
        observed_at: '2026-07-22T15:00:00+08:00',
        result_count: 1,
        flights: [{
          option_id: 'flight-1',
          flight_no: 'CZ1234',
          departure: { city: '深圳', station_name: '深圳宝安国际机场', scheduled_at: '2026-08-01T08:30:00+08:00' },
          arrival: { city: '上海', station_name: '上海虹桥国际机场', scheduled_at: '2026-08-01T10:45:00+08:00' },
          duration_s: 8_100,
          stops: 0,
        }],
      },
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/upsertStaticContentBlock',
      payload: expect.objectContaining({
        block: expect.objectContaining({ type: 'flight_results', id: 'flights-1' }),
      }),
    }));
  });

  it('把 itinerary 富结果事件按稳定 id 写入 stream staticBlocks', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockUpserted?.({
      type: 'content_block_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-itinerary',
      sequence: 8,
      trace_id: 'r1',
      ts: 0,
      content_block: {
        type: 'itinerary_results',
        id: 'itinerary-1',
        schema_version: 1,
        provider: 'fusion',
        status: 'degraded',
        trip_type: 'one_way',
        origin: '深圳',
        destination: '上海',
        start_date: '2026-08-01',
        end_date: null,
        recommended_plan_id: null,
        plans: [{
          id: 'lowest-price',
          title: '最低参考价方案',
          status: 'partial',
          strategy: 'lowest_reference_price',
          tags: ['lowest_reference_price'],
          known_cost: { currency: 'CNY', amount_minor: 58_000 },
          known_duration_s: 8_400,
          sections: [{
            id: 'outbound',
            kind: 'outbound_transport',
            status: 'complete',
            title: '去程',
            coverage: null,
            result_refs: [{
              block_id: 'flight-outbound',
              item_ids: ['flight-1'],
            }],
          }],
        }],
        availability: [
          { journey: 'outbound', mode: 'flight', status: 'available' },
          { journey: 'destination_weather', mode: 'weather', status: 'unavailable' },
        ],
        limitations: ['未取得目的地天气'],
      },
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/upsertStaticContentBlock',
      payload: expect.objectContaining({
        runId: 'r1',
        sequence: 8,
        block: expect.objectContaining({
          type: 'itinerary_results',
          id: 'itinerary-1',
          status: 'degraded',
          plans: [expect.objectContaining({
            sections: [expect.objectContaining({
              result_refs: [{
                block_id: 'flight-outbound',
                item_ids: ['flight-1'],
              }],
            })],
          })],
        }),
      }),
    }));
  });

  it('把天气预报事件规范化后写入 stream staticBlocks', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockUpserted?.({
      type: 'content_block_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-weather',
      sequence: 8,
      trace_id: 'r1',
      ts: 0,
      content_block: {
        type: 'weather_results',
        id: 'weather-1',
        schema_version: 1,
        provider: 'amap',
        attribution: { label: '高德地图' },
        status: 'degraded',
        query: '南景新村',
        resolved_location: '龙华区',
        day_count: 1,
        forecast_days: [{
          date: '2026-07-23',
          weekday: 4,
          day_weather: '雷阵雨',
          night_weather: '雷阵雨',
          high_c: 32,
          low_c: 27,
        }],
        fetched_at: '2026-07-23T12:00:00+08:00',
        limitations: ['当前仅取得一天有效预报'],
      },
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/upsertStaticContentBlock',
      payload: expect.objectContaining({
        block: expect.objectContaining({
          type: 'weather_results',
          id: 'weather-1',
          forecast_days: [expect.objectContaining({ day_weather: '雷阵雨' })],
        }),
      }),
    }));
  });

  it('把未来版本流式结果降级为不含原始 payload 的安全占位', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockUpserted?.({
      type: 'content_block_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-future',
      sequence: 5,
      trace_id: 'r1',
      ts: 0,
      content_block: {
        type: 'future_private_result',
        id: 'future-1',
        schema_version: 4,
        secret: 'must-not-reach-redux',
      },
    });

    const action = dispatch.mock.calls[0]?.[0];
    expect(action).toEqual(expect.objectContaining({
      type: 'stream/upsertStaticContentBlock',
      payload: expect.objectContaining({
        block: {
          type: 'unsupported_result',
          id: 'future-1',
          source_type: 'future_private_result',
          source_schema_version: 4,
          reason: 'unsupported_type',
        },
      }),
    }));
    expect(JSON.stringify(action)).not.toContain('must-not-reach-redux');
  });

  it('流式链路把缺少 type 的同一损坏结果降级为与历史恢复一致的安全占位', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockUpserted?.({
      type: 'content_block_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-invalid',
      sequence: 6,
      trace_id: 'r1',
      ts: 0,
      content_block: {
        id: 'broken-1',
        schema_version: 1,
        secret: 'must-not-reach-redux',
      },
    });

    const action = dispatch.mock.calls[0]?.[0];
    expect(action).toEqual(expect.objectContaining({
      type: 'stream/upsertStaticContentBlock',
      payload: expect.objectContaining({
        block: {
          type: 'unsupported_result',
          id: 'broken-1',
          source_type: 'unknown',
          source_schema_version: 1,
          reason: 'invalid_payload',
        },
      }),
    }));
    expect(JSON.stringify(action)).not.toContain('must-not-reach-redux');
  });

  it('把 context_status_updated 作为单轮快照写入当前会话', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContextStatusUpdated?.({
      type: 'context_status_updated',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 4,
      trace_id: 'r1',
      ts: 0,
      phase: 'final',
      message_id: 'server-m1',
      status: 'trimmed',
      window_tokens: 262_144,
      estimated_tokens_before: 232_305,
      estimated_tokens_after: 192_280,
      actual_prompt_tokens: 147_811,
      removed_turns: 1,
      removed_messages: 2,
      removed_tool_transactions: 0,
      round_index: 1,
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/updateContextUsage',
      payload: expect.objectContaining({
        conversationId: 'c1',
        runId: 'r1',
        messageId: 'server-m1',
        sequence: 4,
        phase: 'final',
        usage: expect.objectContaining({
          actual_prompt_tokens: 147_811,
          round_index: 1,
        }),
      }),
    }));
  });

  it('把定位上下文请求和脱敏结果映射到当前会话的瞬态状态', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContextRequired?.({
      type: 'context_required',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 5,
      trace_id: 'r1',
      ts: 0,
      request_id: 'ctx-1',
      context_type: 'geolocation',
      purpose: 'route_origin',
      reason: '需要当前位置作为路线起点',
      expires_at: 1_721_200_120,
    });
    handlers.onContextResult?.({
      type: 'context_result',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 6,
      trace_id: 'r1',
      ts: 0,
      request_id: 'ctx-1',
      context_type: 'geolocation',
      status: 'provided',
    });

    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'stream/receiveContextRequired',
      payload: {
        conversationId: 'c1',
        runId: 'r1',
        requestId: 'ctx-1',
        purpose: 'route_origin',
        sequence: 5,
      },
    });
    expect(dispatch.mock.calls[1][0]).toEqual(expect.objectContaining({
      type: 'stream/receiveContextResult',
      payload: expect.objectContaining({
        runId: 'r1',
        requestId: 'ctx-1',
        status: 'provided',
        sequence: 6,
      }),
    }));
  });
});
