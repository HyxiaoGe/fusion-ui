import { describe, expect, it } from 'vitest';
import { parsePerformanceRunImport } from './performanceRunImport';

describe('Fusion runner 压测结果适配', () => {
  it('把当前 runner 原始 JSON 包装为 production 安全汇总并剔除定位标识', () => {
    const payload = parsePerformanceRunImport(JSON.stringify({
      schema_version: 1,
      run_id: 'perf-20260711-a1',
      account_fingerprint: 'abcdef123456',
      agent_run_ids: ['run-secret'],
      agent_trace_ids: ['trace-secret'],
      stages: [{ kind: 'sse', concurrency: 5, p95_ttft_ms: 1440, message: '不能保存正文' }],
      stopped: false,
      stop_reasons: [],
      cleanup: { conversations_deleted: 9, tokens_revoked: 2, errors: [], conversation_ids: ['conv-secret'] },
    }));

    expect(payload).toMatchObject({
      environment: 'production',
      status: 'completed',
      model_id: null,
      safe_summary: {
        stages: [{ kind: 'sse', concurrency: 5, p95_ttft_ms: 1440 }],
        cleanup: { conversations_deleted: 9, tokens_revoked: 2, errors: [] },
      },
    });
    const serialized = JSON.stringify(payload);
    for (const forbidden of ['account_fingerprint', 'agent_run_ids', 'agent_trace_ids', 'conversation_ids', 'run-secret', 'trace-secret', 'conv-secret', '不能保存正文']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('包装格式缺少 status 时默认 completed，并再次清理 safe_summary 敏感键', () => {
    const payload = parsePerformanceRunImport(JSON.stringify({
      schema_version: 1,
      run_id: 'perf-1',
      environment: 'prod',
      safe_summary: { p95_ms: 1200, access_token: 'secret-token' },
    }));

    expect(payload.status).toBe('completed');
    expect(payload.safe_summary).toEqual({ p95_ms: 1200 });
    expect(JSON.stringify(payload)).not.toContain('secret-token');
  });

  it('保留 L1-L4 安全聚合字段和全部阶段类型，并剔除敏感键与未知字段', () => {
    const payload = parsePerformanceRunImport(JSON.stringify({
      schema_version: 2,
      run_id: 'perf-20260712-l4',
      environment: 'production',
      safe_summary: {
        stages: [
          {
            scenario: 'disconnect_reconnect',
            kind: 'recovery',
            concurrency: 5,
            duration_seconds: 1800,
            elapsed_seconds: 1799.5,
            cadence_seconds: 1,
            window_seconds: 60,
            success_rate: 0.98,
            total: 50,
            successful: 49,
            failed: 1,
            duplicate_events: 0,
            lost_events: 0,
            ordering_errors: 0,
            executed_ticks: 1800,
            skipped_ticks: 2,
            flows_with_output: 49,
            output_chunks: 900,
            reasoning_chunks: 200,
            answering_chunks: 700,
            visible_chars: 12000,
            reasoning_visible_chars: 3000,
            answering_visible_chars: 9000,
            approx_tokens: 6000,
            first_output_p50_ms: 300,
            first_output_p95_ms: 900,
            first_output_max_ms: 1400,
            chunk_interval_count: 899,
            chunk_interval_p50_ms: 40,
            chunk_interval_p95_ms: 120,
            chunk_interval_max_ms: 400,
            output_window_p50_ms: 1400,
            output_window_p95_ms: 2200,
            output_window_max_ms: 3000,
            tokens_per_second: 18.5,
            tokens_per_second_p50: 17.5,
            tokens_per_second_p95: 23.5,
            tokens_per_second_max: 31.5,
            initial_events: 50,
            recovered_events: 49,
            recovery_latency_ms: 220,
            recovery_latency_p50_ms: 180,
            recovery_latency_p95_ms: 500,
            recovery_latency_max_ms: 720,
            stop_attempted: true,
            cancelled: true,
            persistence_verified: true,
            stop_attempts: 5,
            cancelled_count: 5,
            persistence_verified_count: 5,
            stop_latency_ms: 80,
            stop_latency_p50_ms: 60,
            stop_latency_p95_ms: 160,
            stop_latency_max_ms: 240,
            window_count: 30,
            consecutive_failures: 0,
            access_token: 'secret-token',
            conversation_ids: ['conv-secret'],
            future_metric: 42,
            raw_samples: [{ content: 'private-content' }],
          },
          { kind: 'http', concurrency: 1 },
          { kind: 'sse', concurrency: 1 },
          { kind: 'stop', concurrency: 1 },
          { kind: 'soak', concurrency: 1 },
        ],
      },
    }));

    expect(payload.safe_summary.stages).toEqual([
      {
        scenario: 'disconnect_reconnect',
        kind: 'recovery',
        concurrency: 5,
        duration_seconds: 1800,
        elapsed_seconds: 1799.5,
        cadence_seconds: 1,
        window_seconds: 60,
        success_rate: 0.98,
        total: 50,
        successful: 49,
        failed: 1,
        duplicate_events: 0,
        lost_events: 0,
        ordering_errors: 0,
        executed_ticks: 1800,
        skipped_ticks: 2,
        flows_with_output: 49,
        output_chunks: 900,
        reasoning_chunks: 200,
        answering_chunks: 700,
        visible_chars: 12000,
        reasoning_visible_chars: 3000,
        answering_visible_chars: 9000,
        approx_tokens: 6000,
        first_output_p50_ms: 300,
        first_output_p95_ms: 900,
        first_output_max_ms: 1400,
        chunk_interval_count: 899,
        chunk_interval_p50_ms: 40,
        chunk_interval_p95_ms: 120,
        chunk_interval_max_ms: 400,
        output_window_p50_ms: 1400,
        output_window_p95_ms: 2200,
        output_window_max_ms: 3000,
        tokens_per_second: 18.5,
        tokens_per_second_p50: 17.5,
        tokens_per_second_p95: 23.5,
        tokens_per_second_max: 31.5,
        initial_events: 50,
        recovered_events: 49,
        recovery_latency_ms: 220,
        recovery_latency_p50_ms: 180,
        recovery_latency_p95_ms: 500,
        recovery_latency_max_ms: 720,
        stop_attempted: true,
        cancelled: true,
        persistence_verified: true,
        stop_attempts: 5,
        cancelled_count: 5,
        persistence_verified_count: 5,
        stop_latency_ms: 80,
        stop_latency_p50_ms: 60,
        stop_latency_p95_ms: 160,
        stop_latency_max_ms: 240,
        window_count: 30,
        consecutive_failures: 0,
      },
      { kind: 'http', concurrency: 1 },
      { kind: 'sse', concurrency: 1 },
      { kind: 'stop', concurrency: 1 },
      { kind: 'soak', concurrency: 1 },
    ]);
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'access_token', 'secret-token', 'conversation_ids', 'conv-secret',
      'future_metric', 'raw_samples', 'private-content',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
