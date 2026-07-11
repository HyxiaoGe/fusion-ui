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
});
