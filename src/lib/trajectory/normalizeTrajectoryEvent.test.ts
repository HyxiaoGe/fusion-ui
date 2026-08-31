import { describe, expect, it } from 'vitest';

import {
  normalizeTrajectoryCapabilityResolution,
  normalizeSseTrajectoryEvent,
  normalizeTrajectoryRecord,
} from './normalizeTrajectoryEvent';

const timestamp = '2026-08-22T00:00:00.000Z';

const capabilityResolution = {
  schema_version: 1,
  router_version: '2026-08-27.1',
  package_id: 'weather',
  confidence: 'high',
  resolution_mode: 'routed',
  reason_codes: ['explicit_weather_request'],
  external_tool_names: ['weather_forecast'],
  effective_plan_mode: 'off',
  include_current_date: true,
  network_boundary_required: false,
  bundle_fingerprint: `sha256:${'a'.repeat(64)}`,
};

const verifiedResearchSkill = {
  skill_id: 'verified-research',
  version: '1.0.0',
  content_sha256: 'b'.repeat(64),
  allowed_tool_names: ['web_search', 'url_read'],
  section_id: 'skill:verified-research@1.0.0',
  char_count: 321,
};

const capabilityResolutionV2 = {
  schema_version: 2,
  router_version: '2026-08-31.1',
  package_id: 'verified_web',
  confidence: 'high',
  resolution_mode: 'routed',
  reason_codes: ['verified_source_request'],
  external_tool_names: ['web_search', 'url_read'],
  effective_plan_mode: 'auto',
  include_current_date: true,
  network_boundary_required: false,
  bundle_fingerprint: `sha256:${'c'.repeat(64)}`,
  skill_resolution: {
    status: 'loaded',
    activation_source: 'capability_package',
    requested_skill_ids: ['verified-research'],
    skills: [verifiedResearchSkill],
    duration_ms: 4,
    error_code: null,
  },
};

describe('normalizeTrajectoryEvent', () => {
  it('实时与历史 run_started 只保留完整合法的能力路由对象', () => {
    const live = normalizeSseTrajectoryEvent({
      type: 'run_started',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      tools: ['weather_forecast'],
      capability_resolution: capabilityResolution,
    });
    const durable = normalizeTrajectoryRecord('run-1', {
      sequence: 0,
      event_type: 'run_started',
      schema_version: 1,
      timestamp,
      step_id: null,
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-1',
      payload: {
        type: 'run_started',
        run_id: 'run-1',
        tools: ['weather_forecast'],
        capability_resolution: capabilityResolution,
      },
    });

    expect(live?.payload.capability_resolution).toEqual(capabilityResolution);
    expect(durable?.payload.capability_resolution).toEqual(capabilityResolution);
    expect(live?.payload.capability_resolution).not.toBe(capabilityResolution);
    expect(durable).toEqual(live);
  });

  it('实时与历史 run_started 安全保留 schema v2 Skill 终态，且旧 v1 继续可读', () => {
    const live = normalizeSseTrajectoryEvent({
      type: 'run_started',
      schema_version: 1,
      run_id: 'run-v2',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'trace-v2',
      ts: Date.parse(timestamp) / 1000,
      tools: ['web_search', 'url_read'],
      capability_resolution: capabilityResolutionV2,
    });
    const durable = normalizeTrajectoryRecord('run-v2', {
      sequence: 0,
      event_type: 'run_started',
      schema_version: 1,
      timestamp,
      step_id: null,
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-v2',
      payload: {
        type: 'run_started',
        run_id: 'run-v2',
        tools: ['web_search', 'url_read'],
        capability_resolution: capabilityResolutionV2,
      },
    });

    expect(live?.payload.capability_resolution).toEqual(capabilityResolutionV2);
    expect(durable).toEqual(live);
    expect(normalizeTrajectoryCapabilityResolution(capabilityResolution)).toEqual(capabilityResolution);
  });

  it('schema v2 缺少或伪造 Skill 终态时仅丢弃能力对象，不丢弃 run_started', () => {
    const missingSkillResolution = Object.fromEntries(
      Object.entries(capabilityResolutionV2).filter(([key]) => key !== 'skill_resolution'),
    );
    const malicious = {
      ...capabilityResolutionV2,
      skill_resolution: {
        ...capabilityResolutionV2.skill_resolution,
        skills: [{ ...verifiedResearchSkill, content: '不得进入 Run config 的正文' }],
      },
    };

    for (const resolution of [missingSkillResolution, malicious]) {
      const event = normalizeSseTrajectoryEvent({
        type: 'run_started',
        schema_version: 1,
        run_id: 'run-v2-invalid',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 0,
        trace_id: 'trace-v2-invalid',
        ts: Date.parse(timestamp) / 1000,
        tools: ['web_search', 'url_read'],
        capability_resolution: resolution,
      });
      expect(event).not.toBeNull();
      expect(event?.payload).not.toHaveProperty('capability_resolution');
    }
  });

  it('接受 Skill 加载失败后的 schema v2 受控降级', () => {
    const resolution = {
      ...capabilityResolutionV2,
      package_id: 'tools_unavailable',
      resolution_mode: 'degraded',
      reason_codes: ['required_skill_unavailable'],
      external_tool_names: [],
      effective_plan_mode: 'off',
      network_boundary_required: true,
      skill_resolution: {
        status: 'load_failed',
        activation_source: 'capability_package',
        requested_skill_ids: ['verified-research'],
        skills: [],
        duration_ms: 4,
        error_code: 'skill_load_failed',
      },
    };

    expect(normalizeTrajectoryCapabilityResolution(resolution)).toEqual(resolution);
  });

  it('schema v2 延续校验 bundle fingerprint', () => {
    expect(normalizeTrajectoryCapabilityResolution({
      ...capabilityResolutionV2,
      bundle_fingerprint: 'c'.repeat(64),
    })).toBeNull();
  });

  it('schema v2 接受 verified-research 的后续稳定版本', () => {
    const nextSkill = {
      ...verifiedResearchSkill,
      version: '1.0.1',
      section_id: 'skill:verified-research@1.0.1',
    };
    const resolution = {
      ...capabilityResolutionV2,
      skill_resolution: {
        ...capabilityResolutionV2.skill_resolution,
        skills: [nextSkill],
      },
    };

    expect(normalizeTrajectoryCapabilityResolution(resolution)).toEqual(resolution);
  });

  it.each([
    ['额外字段', { ...capabilityResolution, raw_query: '北京天气' }],
    ['非法工具', { ...capabilityResolution, external_tool_names: ['update_plan'] }],
    ['超界工具', { ...capabilityResolution, external_tool_names: ['a', 'b', 'c', 'd'] }],
    ['重复理由', { ...capabilityResolution, reason_codes: ['explicit_weather_request', 'explicit_weather_request'] }],
    ['非法版本', { ...capabilityResolution, router_version: 'latest' }],
    ['非法指纹', { ...capabilityResolution, bundle_fingerprint: 'a'.repeat(64) }],
  ])('拒绝%s的能力路由对象', (_label, value) => {
    expect(normalizeTrajectoryCapabilityResolution(value)).toBeNull();
  });

  it.each([
    ['不可用工具包仍公告工具', {
      ...capabilityResolution,
      package_id: 'tools_unavailable',
      confidence: 'high',
      resolution_mode: 'degraded',
      reason_codes: ['tools_disabled'],
      external_tool_names: ['web_search'],
      effective_plan_mode: 'off',
      include_current_date: false,
      network_boundary_required: true,
    }],
    ['显式 MCP 包使用普通工具', {
      ...capabilityResolution,
      package_id: 'mcp_explicit',
      reason_codes: ['explicit_authorized_tool_alias'],
      external_tool_names: ['web_search'],
      include_current_date: false,
    }],
    ['Deep Research 缺少读取工具', {
      ...capabilityResolution,
      package_id: 'deep_research',
      reason_codes: ['deep_research_mode'],
      external_tool_names: ['web_search'],
      effective_plan_mode: 'on',
    }],
    ['天气包使用 auto 计划', { ...capabilityResolution, effective_plan_mode: 'auto' }],
    ['实时搜索缺少日期', {
      ...capabilityResolution,
      package_id: 'fresh_web',
      reason_codes: ['fresh_external_fact'],
      external_tool_names: ['web_search'],
      include_current_date: false,
    }],
    ['天气包要求网络降级边界', { ...capabilityResolution, network_boundary_required: true }],
    ['天气包使用其他原因码', { ...capabilityResolution, reason_codes: ['stable_knowledge_question'] }],
    ['天气包使用低置信度', { ...capabilityResolution, confidence: 'low' }],
    ['天气包标记为降级', { ...capabilityResolution, resolution_mode: 'degraded' }],
  ])('拒绝跨字段语义矛盾：%s', (_label, value) => {
    expect(normalizeTrajectoryCapabilityResolution(value)).toBeNull();
  });

  it('接受 API 可生成的零工具降级包与单一 MCP alias 包', () => {
    expect(normalizeTrajectoryCapabilityResolution({
      ...capabilityResolution,
      package_id: 'tools_unavailable',
      confidence: 'medium',
      resolution_mode: 'degraded',
      reason_codes: ['required_tools_unavailable'],
      external_tool_names: [],
      effective_plan_mode: 'off',
      include_current_date: true,
      network_boundary_required: true,
    })).not.toBeNull();
    expect(normalizeTrajectoryCapabilityResolution({
      ...capabilityResolution,
      package_id: 'mcp_explicit',
      reason_codes: ['explicit_authorized_tool_alias'],
      external_tool_names: ['mcp_calendar_lookup'],
      include_current_date: false,
    })).not.toBeNull();
  });

  it.each([
    ['direct', { package_id: 'direct', reason_codes: ['direct_greeting'], external_tool_names: [], include_current_date: false }],
    ['transform', { package_id: 'transform', reason_codes: ['text_transform_request'], external_tool_names: [], include_current_date: false }],
    ['date', { package_id: 'date', reason_codes: ['current_date_question'], external_tool_names: [] }],
    ['fresh_web', { package_id: 'fresh_web', reason_codes: ['fresh_external_fact'], external_tool_names: ['web_search'] }],
    ['verified_web', { package_id: 'verified_web', reason_codes: ['verified_source_request'], external_tool_names: ['web_search', 'url_read'], effective_plan_mode: 'auto' }],
    ['url_read', { package_id: 'url_read', reason_codes: ['explicit_url_read'], external_tool_names: ['url_read'], include_current_date: false }],
    ['weather', {}],
    ['place_discovery', { package_id: 'place_discovery', reason_codes: ['explicit_place_discovery'], external_tool_names: ['local_place_search'], include_current_date: false }],
    ['mobility_route', { package_id: 'mobility_route', reason_codes: ['explicit_route_task'], external_tool_names: ['route_compare'], effective_plan_mode: 'auto', include_current_date: false }],
    ['flight', { package_id: 'flight', reason_codes: ['explicit_flight_request'], external_tool_names: ['search_flights'] }],
    ['train', { package_id: 'train', reason_codes: ['explicit_train_request'], external_tool_names: ['search_trains'] }],
    ['travel_air_rail', { package_id: 'travel_air_rail', reason_codes: ['air_rail_comparison'], external_tool_names: ['search_flights', 'search_trains'], effective_plan_mode: 'auto' }],
    ['mobility_intercity', { package_id: 'mobility_intercity', confidence: 'medium', reason_codes: ['origin_destination_relation', 'intercity_locations'], external_tool_names: ['route_compare', 'search_flights', 'search_trains'], effective_plan_mode: 'auto' }],
    ['mixed_itinerary', { package_id: 'mixed_itinerary', reason_codes: ['mixed_itinerary_request'], external_tool_names: ['route_compare', 'search_flights', 'search_trains'], effective_plan_mode: 'auto' }],
    ['deep_research', { package_id: 'deep_research', reason_codes: ['deep_research_mode'], external_tool_names: ['web_search', 'url_read'], effective_plan_mode: 'on' }],
    ['knowledge_grounded', { package_id: 'knowledge_grounded', reason_codes: ['knowledge_grounded_mode'], external_tool_names: [], effective_plan_mode: 'off', include_current_date: false }],
    ['tools_unavailable', { package_id: 'tools_unavailable', resolution_mode: 'degraded', reason_codes: ['tools_disabled'], external_tool_names: [], effective_plan_mode: 'off', include_current_date: false, network_boundary_required: true }],
    ['clarification_only', { package_id: 'clarification_only', confidence: 'low', resolution_mode: 'clarification', reason_codes: ['insufficient_capability_signal'], external_tool_names: [], effective_plan_mode: 'off', include_current_date: false }],
    ['mcp_explicit', { package_id: 'mcp_explicit', reason_codes: ['explicit_authorized_tool_alias'], external_tool_names: ['mcp_calendar_lookup'], include_current_date: false }],
  ])('接受 API 契约中的合法 %s 能力包', (_packageId, overrides) => {
    expect(normalizeTrajectoryCapabilityResolution({
      ...capabilityResolution,
      ...overrides,
    })).not.toBeNull();
  });

  it.each([
    ['tools_unavailable', {
      ...capabilityResolution,
      package_id: 'tools_unavailable',
      confidence: 'high',
      resolution_mode: 'degraded',
      reason_codes: ['tools_disabled'],
      external_tool_names: ['web_search'],
      effective_plan_mode: 'off',
      include_current_date: false,
      network_boundary_required: true,
    }],
    ['mcp_explicit', {
      ...capabilityResolution,
      package_id: 'mcp_explicit',
      reason_codes: ['explicit_authorized_tool_alias'],
      external_tool_names: ['web_search'],
      include_current_date: false,
    }],
  ])('SSE 丢弃 %s 的非法跨字段组合', (_label, resolution) => {
    const event = normalizeSseTrajectoryEvent({
      type: 'run_started',
      schema_version: 1,
      run_id: 'run-invalid',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'trace-invalid',
      ts: Date.parse(timestamp) / 1000,
      tools: ['web_search'],
      capability_resolution: resolution,
    });

    expect(event).not.toBeNull();
    expect(event?.payload).not.toHaveProperty('capability_resolution');
  });

  it.each([
    ['verified_web', {
      ...capabilityResolution,
      package_id: 'verified_web',
      reason_codes: ['verified_source_request'],
      external_tool_names: ['url_read', 'web_search'],
      effective_plan_mode: 'auto',
    }],
    ['deep_research', {
      ...capabilityResolution,
      package_id: 'deep_research',
      reason_codes: ['deep_research_mode'],
      external_tool_names: ['url_read', 'web_search'],
      effective_plan_mode: 'on',
    }],
    ['travel_air_rail', {
      ...capabilityResolution,
      package_id: 'travel_air_rail',
      reason_codes: ['air_rail_comparison'],
      external_tool_names: ['search_trains', 'search_flights'],
      effective_plan_mode: 'auto',
    }],
    ['mobility_intercity', {
      ...capabilityResolution,
      package_id: 'mobility_intercity',
      confidence: 'medium',
      reason_codes: ['origin_destination_relation', 'intercity_locations'],
      external_tool_names: ['search_trains', 'route_compare'],
      effective_plan_mode: 'auto',
    }],
    ['mixed_itinerary', {
      ...capabilityResolution,
      package_id: 'mixed_itinerary',
      reason_codes: ['mixed_itinerary_request'],
      external_tool_names: ['search_trains', 'route_compare'],
      effective_plan_mode: 'auto',
    }],
  ])('normalizer 与 SSE 都拒绝倒序 %s 工具', (_label, resolution) => {
    expect(normalizeTrajectoryCapabilityResolution(resolution)).toBeNull();
    const event = normalizeSseTrajectoryEvent({
      type: 'run_started', schema_version: 1, run_id: 'run-reversed',
      parent_run_id: null, step_id: null, parent_step_id: null, tool_call_id: null,
      sequence: 0, trace_id: 'trace-reversed', ts: Date.parse(timestamp) / 1000,
      tools: resolution.external_tool_names,
      capability_resolution: resolution,
    });
    expect(event?.payload).not.toHaveProperty('capability_resolution');
  });

  it.each([
    ['verified_web', {
      ...capabilityResolution,
      package_id: 'verified_web',
      reason_codes: ['verified_source_request'],
      external_tool_names: ['url_read'],
      effective_plan_mode: 'auto',
    }],
    ['travel_air_rail', {
      ...capabilityResolution,
      package_id: 'travel_air_rail',
      reason_codes: ['air_rail_comparison'],
      external_tool_names: ['search_trains'],
      effective_plan_mode: 'auto',
    }],
    ['mobility_intercity', {
      ...capabilityResolution,
      package_id: 'mobility_intercity',
      confidence: 'medium',
      reason_codes: ['origin_destination_relation', 'intercity_locations'],
      external_tool_names: ['route_compare', 'search_trains'],
      effective_plan_mode: 'auto',
    }],
    ['mixed_itinerary', {
      ...capabilityResolution,
      package_id: 'mixed_itinerary',
      reason_codes: ['mixed_itinerary_request'],
      external_tool_names: ['route_compare', 'search_flights'],
      effective_plan_mode: 'auto',
    }],
    ['mixed_itinerary_weather_flight', {
      ...capabilityResolution,
      package_id: 'mixed_itinerary',
      reason_codes: ['mixed_itinerary_request'],
      external_tool_names: ['weather_forecast', 'search_flights'],
      effective_plan_mode: 'auto',
    }],
    ['mixed_itinerary_weather_place', {
      ...capabilityResolution,
      package_id: 'mixed_itinerary',
      reason_codes: ['mixed_itinerary_request'],
      external_tool_names: ['weather_forecast', 'local_place_search'],
      effective_plan_mode: 'auto',
    }],
    ['mixed_itinerary_weather_route', {
      ...capabilityResolution,
      package_id: 'mixed_itinerary',
      reason_codes: ['mixed_itinerary_request'],
      external_tool_names: ['weather_forecast', 'route_compare'],
      effective_plan_mode: 'auto',
    }],
  ])('normalizer 与 SSE 保留合法 %s canonical 子序列', (_label, resolution) => {
    expect(normalizeTrajectoryCapabilityResolution(resolution)).toEqual(resolution);
    const event = normalizeSseTrajectoryEvent({
      type: 'run_started', schema_version: 1, run_id: 'run-canonical',
      parent_run_id: null, step_id: null, parent_step_id: null, tool_call_id: null,
      sequence: 0, trace_id: 'trace-canonical', ts: Date.parse(timestamp) / 1000,
      tools: resolution.external_tool_names,
      capability_resolution: resolution,
    });
    expect(event?.payload.capability_resolution).toEqual(resolution);
  });

  it('缺失 schema_version 的已知 SSE 事件按 legacy 版本归一化', () => {
    const tools = ['weather'];
    const normalized = normalizeSseTrajectoryEvent({
      type: 'run_started',
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      conversation_id: 'conversation-1',
      message_id: 'message-1',
      task_id: 'task-1',
      model: 'deepseek-chat',
      tools,
    });

    expect(normalized).toEqual({
      runId: 'run-1',
      sequence: 0,
      eventType: 'run_started',
      schemaVersion: 0,
      timestamp,
      stepId: null,
      toolCallId: null,
      parentStepId: null,
      traceId: 'trace-1',
      payload: {
        conversation_id: 'conversation-1',
        message_id: 'message-1',
        task_id: 'task-1',
        model: 'deepseek-chat',
        tools: ['weather'],
      },
    });
    expect(normalized?.payload.tools).not.toBe(tools);
  });

  it('拒绝未知 schema 或不在公共 union 的 SSE 事件', () => {
    const baseEvent = {
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 1,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
    };

    expect(normalizeSseTrajectoryEvent({
      ...baseEvent,
      type: 'run_started',
      schema_version: 2,
      conversation_id: 'conversation-1',
      message_id: 'message-1',
      task_id: 'task-1',
      model: 'deepseek-chat',
      tools: [],
    })).toBeNull();
    expect(normalizeSseTrajectoryEvent({ ...baseEvent, type: 'internal_debug_event' })).toBeNull();
  });

  it('只保留事件类型 allowlist 字段且不保留原 payload 引用', () => {
    const payload = {
      tool_name: 'weather',
      status: 'success',
      duration_ms: 120,
      plan_item_id: 'plan-1',
      arguments: { api_key: 'secret' },
      internal_note: '不可进入普通用户轨迹',
    };

    const normalized = normalizeSseTrajectoryEvent({
      type: 'tool_call_completed',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: 'step-1',
      parent_step_id: null,
      tool_call_id: 'tool-1',
      sequence: 2,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      ...payload,
    });

    expect(normalized?.payload).toEqual({
      tool_name: 'weather',
      status: 'success',
      duration_ms: 120,
      plan_item_id: 'plan-1',
    });
    expect(normalized?.payload).not.toBe(payload);
  });

  it('保留 LLM 完成事件的推理 Token，同时丢弃未声明字段', () => {
    const normalized = normalizeSseTrajectoryEvent({
      type: 'llm_round_completed',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: 'step-1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 3,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      llm_round_id: 'round-1',
      status: 'success',
      input_tokens: 100,
      output_tokens: 40,
      reasoning_tokens: 24,
      duration_ms: 800,
      internal_usage_detail: { secret: true },
    });

    expect(normalized?.payload).toMatchObject({
      llm_round_id: 'round-1',
      status: 'success',
      input_tokens: 100,
      output_tokens: 40,
      reasoning_tokens: 24,
      duration_ms: 800,
    });
    expect(normalized?.payload).not.toHaveProperty('internal_usage_detail');
  });

  it('对 plan_snapshot 的嵌套项应用字段白名单、脱敏和有界列表', () => {
    const normalized = normalizeSseTrajectoryEvent({
      type: 'plan_snapshot',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 3,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      protocol_version: 2,
      plan_id: 'plan-1',
      items: Array.from({ length: 51 }, (_, index) => ({
        id: `item-${index}`,
        title: 'api_key=live-secret',
        summary: '长文本'.repeat(300),
        tool_names: Array.from({ length: 51 }, (_, toolIndex) => `token=tool-${toolIndex}`),
        arguments: { api_key: '不能进入 UI' },
        raw_tool_output: '不能进入 UI',
      })),
    });

    const items = normalized?.payload.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(50);
    expect(Object.keys(items[0]).sort()).toEqual(['id', 'summary', 'title', 'tool_names']);
    expect(items[0].title).toBe('api_key=[REDACTED]');
    expect(items[0].summary).toHaveLength(512);
    expect(items[0].tool_names).toEqual(Array(50).fill('token=[REDACTED]'));
  });

  it('对 evidence URL、嵌套未知字段和文本 secret 应用普通用户安全边界', () => {
    const normalized = normalizeSseTrajectoryEvent({
      type: 'evidence_item_upserted',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 4,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      protocol_version: 2,
      evidence: {
        id: 'evidence-1',
        title: 'authorization: Bearer live-token',
        url: 'https://example.com/guide?access_token=live-token#section',
        raw_tool_output: '不能进入 UI',
      },
    });

    expect(normalized?.payload.evidence).toEqual({
      id: 'evidence-1',
      title: 'authorization=[REDACTED]',
      url: 'https://example.com/guide',
    });
  });

  it('将 P1 record 与相同 SSE 事件归一为同一普通用户事件', () => {
    const record = {
      sequence: 2,
      event_type: 'tool_call_completed',
      schema_version: 1,
      timestamp,
      step_id: 'step-1',
      tool_call_id: 'tool-1',
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: 'tool:tool-1',
      payload: {
        type: 'tool_call_completed',
        run_id: 'run-1',
        tool_name: 'weather',
        status: 'success',
        duration_ms: 120,
        plan_item_id: 'plan-1',
        arguments: { api_key: 'secret' },
      },
    };
    const sse = {
      type: 'tool_call_completed',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: 'step-1',
      parent_step_id: null,
      tool_call_id: 'tool-1',
      sequence: 2,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      tool_name: 'weather',
      status: 'success',
      duration_ms: 120,
      plan_item_id: 'plan-1',
      arguments: { api_key: 'secret' },
    };

    expect(normalizeTrajectoryRecord('run-1', record)).toEqual(normalizeSseTrajectoryEvent(sse));
  });

  it.each([
    ['UTC 整秒', '2026-08-22T00:00:00Z', '2026-08-22T00:00:00.000Z'],
    ['六位微秒', '2026-08-22T00:00:00.123456Z', '2026-08-22T00:00:00.123Z'],
    ['带 offset', '2026-08-22T08:00:00.123+08:00', '2026-08-22T00:00:00.123Z'],
  ])('把真实 P1 %s timestamp 归一为 UTC 毫秒 ISO', (_label, durableTimestamp, expected) => {
    const normalized = normalizeTrajectoryRecord('run-1', {
      sequence: 1,
      event_type: 'step_started',
      schema_version: 1,
      timestamp: durableTimestamp,
      step_id: 'step-1',
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: 'step:step-1',
      payload: {
        type: 'step_started',
        run_id: 'run-1',
        step_number: 1,
      },
    });

    expect(normalized?.timestamp).toBe(expected);
  });

  it.each([
    ['非时间字符串', 'not-a-timestamp'],
    ['不存在的日期', '2026-02-30T00:00:00Z'],
  ])('拒绝%s的真实 P1 timestamp，不回退到当前时间', (_label, timestamp) => {
    expect(normalizeTrajectoryRecord('run-1', {
      sequence: 1,
      event_type: 'step_started',
      schema_version: 1,
      timestamp,
      step_id: 'step-1',
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: 'step:step-1',
      payload: {
        type: 'step_started',
        run_id: 'run-1',
        step_number: 1,
      },
    })).toBeNull();
  });

  it('将 P1 schema_version=0 record 与缺失版本的 SSE 归一为相同 legacy 事件', () => {
    const record = {
      sequence: 5,
      event_type: 'run_completed',
      schema_version: 0,
      timestamp,
      step_id: null,
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: null,
      payload: {
        type: 'run_completed',
        run_id: 'run-1',
        total_steps: 2,
        total_tool_calls: 1,
        finish_reason: 'stop',
      },
    };
    const sse = {
      type: 'run_completed',
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 5,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      total_steps: 2,
      total_tool_calls: 1,
      finish_reason: 'stop',
    };

    expect(normalizeTrajectoryRecord('run-1', record)).toEqual(normalizeSseTrajectoryEvent(sse));
    expect(normalizeSseTrajectoryEvent(sse)?.schemaVersion).toBe(0);
  });
});


describe('系统提示词元数据', () => {
  const base = { run_id: 'run-1', step_id: null, parent_step_id: null, tool_call_id: null, sequence: 1, trace_id: 'trace-1', ts: Date.parse(timestamp) / 1000 };
  it.each([['ready', 'available'], ['ready', 'degraded'], ['failed', null]])('实时与历史保留 %s/%s 安全元数据', (status, detail_status) => {
    const payload = { protocol_version: 2, status, detail_status, source: 'code', template_version: 'v1', section_ids: ['base'], fingerprint: 'a'.repeat(64), char_count: 123, duration_ms: 0 };
    const live = normalizeSseTrajectoryEvent({ ...base, type: 'system_prompt_prepared', ...payload, prompt: '私密偏好', sections: [{ section_id: 'user_preferences', content: '私密偏好' }] });
    expect(live?.payload).toEqual(payload);
    expect(normalizeTrajectoryRecord('run-1', { sequence: 1, event_type: 'system_prompt_prepared', timestamp, step_id: null, parent_step_id: null, tool_call_id: null, trace_id: 'trace-1', payload })).toEqual(live);
  });
  it.each(['preparing', 'unknown'])('不接受虚构状态 %s', status => {
    expect(normalizeSseTrajectoryEvent({ ...base, type: 'system_prompt_prepared', protocol_version: 2, status, source: 'code', template_version: 'v1', section_ids: [], duration_ms: 0 })).toBeNull();
  });
  it('保留后端实际固定失败文案', () => {
    const message = '系统提示词组装失败，请稍后重试。';
    expect(normalizeSseTrajectoryEvent({ ...base, type: 'system_prompt_prepared', protocol_version: 2, status: 'failed', source: 'code', template_version: 'v1', section_ids: [], duration_ms: 1, message })?.payload.message).toBe(message);
  });
  it('失败允许缺失或空元数据，不保留异常原文或非法指纹', () => {
    const payload = { protocol_version: 2, status: 'failed', source: 'code', template_version: 'v1', section_ids: [], duration_ms: 1 };
    expect(normalizeSseTrajectoryEvent({ ...base, type: 'system_prompt_prepared', ...payload, fingerprint: '私密内容', char_count: -1, message: '原始用户偏好', detail_status: '私密偏好' })?.payload).toEqual(payload);
    expect(normalizeSseTrajectoryEvent({ ...base, type: 'system_prompt_prepared', ...payload, fingerprint: null, char_count: null, message: null })?.payload).toEqual({ ...payload, fingerprint: null, char_count: null, message: null });
  });
  it('保留本次模型请求指纹，旧事件不补填', () => {
    expect(normalizeSseTrajectoryEvent({ ...base, type: 'llm_round_started', llm_round_id: 'r', system_prompt_fingerprint: 'b'.repeat(64) })?.payload.system_prompt_fingerprint).toBe('b'.repeat(64));
    expect(normalizeSseTrajectoryEvent({ ...base, type: 'llm_round_started', llm_round_id: 'old' })?.payload.system_prompt_fingerprint).toBeUndefined();
  });
});

describe('Skills 解析元数据', () => {
  const base = {
    run_id: 'run-1',
    schema_version: 1,
    step_id: null,
    parent_step_id: null,
    tool_call_id: null,
    sequence: 2,
    trace_id: 'trace-1',
    ts: Date.parse(timestamp) / 1000,
  };
  const skill = {
    skill_id: 'verified-research',
    version: '1.0.0',
    content_sha256: 'b'.repeat(64),
    allowed_tool_names: ['web_search', 'url_read'],
    section_id: 'skill:verified-research@1.0.0',
    char_count: 321,
  };

  it.each([
    ['not_selected', [], [], null],
    ['loaded', ['verified-research'], [skill], 'available'],
    ['load_failed', ['verified-research'], [], null],
  ])('实时与历史保留 %s 的安全元数据且丢弃正文', (status, requestedSkillIds, skills, detailStatus) => {
    const payload = {
      protocol_version: 2,
      status,
      activation_source: 'capability_package',
      requested_skill_ids: requestedSkillIds,
      skills,
      duration_ms: 4,
      detail_status: detailStatus,
      error_code: status === 'load_failed' ? 'skill_load_failed' : null,
    };
    const live = normalizeSseTrajectoryEvent({
      ...base,
      type: 'skills_resolved',
      ...payload,
      content: '不得进入事件的 Skill 正文',
      filesystem_path: '/private/skills/verified-research/SKILL.md',
    });
    const durable = normalizeTrajectoryRecord('run-1', {
      sequence: 2,
      event_type: 'skills_resolved',
      schema_version: 1,
      timestamp,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      trace_id: 'trace-1',
      payload,
    });

    expect(live?.payload).toEqual(payload);
    expect(durable).toEqual(live);
  });

  it.each([
    ['虚构中间态', { status: 'preparing' }],
    ['协议版本缺失', { protocol_version: undefined }],
    ['协议版本错误', { protocol_version: 1 }],
    ['非法来源', { activation_source: 'model_guess' }],
    ['loaded 缺少快照', { skills: [] }],
    ['not_selected 仍请求 Skill', { status: 'not_selected', requested_skill_ids: ['verified-research'], skills: [], detail_status: null }],
    ['正文哈希非法', { skills: [{ ...skill, content_sha256: 'latest' }] }],
    ['预发布版本不在 MVP 契约', { skills: [{ ...skill, version: '1.0.0-beta', section_id: 'skill:verified-research@1.0.0-beta' }] }],
    ['正文字符数为空', { skills: [{ ...skill, char_count: 0 }] }],
    ['正文字符数超限', { skills: [{ ...skill, char_count: 32_769 }] }],
    ['工具顺序不是 canonical', { skills: [{ ...skill, allowed_tool_names: ['url_read', 'web_search'] }] }],
    ['未知工具', { skills: [{ ...skill, allowed_tool_names: ['unknown_tool'] }] }],
    ['重复工具', { skills: [{ ...skill, allowed_tool_names: ['web_search', 'web_search'] }] }],
  ])('拒绝%s', (_label, overrides) => {
    expect(normalizeSseTrajectoryEvent({
      ...base,
      type: 'skills_resolved',
      protocol_version: 2,
      status: 'loaded',
      activation_source: 'capability_package',
      requested_skill_ids: ['verified-research'],
      skills: [skill],
      duration_ms: 4,
      detail_status: 'available',
      error_code: null,
      ...overrides,
    })).toBeNull();
  });

  it('Skill ID 长度与 API 128 字符上限一致', () => {
    const longSkillId = Array.from({ length: 64 }, () => 'a').join('-');
    const longSkill = {
      ...skill,
      skill_id: longSkillId,
      section_id: `skill:${longSkillId}@1.0.0`,
    };
    expect(longSkillId).toHaveLength(127);
    expect(normalizeSseTrajectoryEvent({
      ...base,
      type: 'skills_resolved',
      protocol_version: 2,
      status: 'loaded',
      activation_source: 'capability_package',
      requested_skill_ids: [longSkillId],
      skills: [longSkill],
      duration_ms: 4,
      detail_status: 'available',
      error_code: null,
    })).not.toBeNull();
  });

  it('load_failed 只接受公开协议中的固定错误码', () => {
    expect(normalizeSseTrajectoryEvent({
      ...base,
      type: 'skills_resolved',
      protocol_version: 2,
      status: 'load_failed',
      activation_source: 'capability_package',
      requested_skill_ids: ['verified-research'],
      skills: [],
      duration_ms: 4,
      detail_status: null,
      error_code: 'skill_file_missing',
    })).toBeNull();
  });
});
