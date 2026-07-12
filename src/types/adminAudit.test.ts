import { describe, expect, it } from 'vitest';
import type {
  AdminAgentRunRecord,
  AdminConversationSummary,
  AdminFileRecord,
  AdminMessageRecord,
  AdminPerformanceRunDetail,
  AdminPerformanceRunSummary,
  AdminToolCallRecord,
  AdminUserSummary,
} from './adminAudit';

const toolFixture = {
  id: 'tool-1', message_id: 'message-1', trace_id: 'run-1', step_number: 1,
  tool_name: 'web_search', status: 'success', duration_ms: 42,
  model_id: 'gpt-5', provider: 'openai', arguments: { query: 'Fusion' },
  result_preview: { count: 3 }, error: null, redacted_fields: ['arguments.api_key'],
  created_at: '2026-07-11T10:00:00Z',
} satisfies AdminToolCallRecord;

describe('管理员审计后端 DTO 契约', () => {
  it('锁定用户、对话、消息、Agent、工具和文件的 snake_case 字段', () => {
    const user = {
      id: 'user-1', username: 'sean', nickname: null, email_masked: 's***@example.com',
      is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
      conversation_count: 1, message_count: 2, tool_call_count: 3,
      input_tokens: 10, output_tokens: 20,
    } satisfies AdminUserSummary;
    const conversation = {
      id: 'conv-1', title: '会话', model_id: 'gpt-5', created_at: null, updated_at: null,
      user: { id: user.id, username: user.username, nickname: user.nickname, email_masked: user.email_masked },
      message_count: 2, tool_call_count: 3, file_count: 1,
      input_tokens: 10, output_tokens: 20, latest_agent_status: 'completed',
    } satisfies AdminConversationSummary;
    const message = {
      id: 'message-1', role: 'assistant', content: [{ type: 'text', id: 'b1', text: '回答' }],
      model_id: 'gpt-5', usage: { input_tokens: 10, output_tokens: 20 },
      suggested_questions: [], created_at: null,
    } satisfies AdminMessageRecord;
    const run = {
      id: 'run-1', message_id: message.id, user_id: user.id, model_id: 'gpt-5', provider: 'openai',
      config: { max_steps: 8 }, total_steps: 1, total_tool_calls: 1, total_duration_ms: 42,
      status: 'completed', limit_reason: null, error: null, created_at: null, progress: null,
      steps: [{
        id: 'step-1', step_number: 1, status: 'completed', tool_calls_count: 1,
        tool_names: ['web_search'], duration_ms: 42, created_at: null, tool_calls: [toolFixture],
      }],
    } satisfies AdminAgentRunRecord;
    const file = {
      id: 'file-1', original_filename: 'report.pdf', mimetype: 'application/pdf', size: 100,
      status: 'processed', width: null, height: null, created_at: null,
    } satisfies AdminFileRecord;
    const performanceSummary = {
      run_id: 'perf-1', environment: 'production', model_id: null, status: 'completed', schema_version: 2,
      started_at: null, finished_at: null, created_at: '2026-07-12T00:00:00Z',
    } satisfies AdminPerformanceRunSummary;
    const performanceDetail = {
      ...performanceSummary,
      imported_by_user_id: 'admin-1',
      safe_summary: { stages: [{ kind: 'sse', p95_ttft_ms: 900 }], resources: null },
    } satisfies AdminPerformanceRunDetail;

    expect({ user, conversation, message, run, toolFixture, file, performanceSummary, performanceDetail }).toMatchObject({
      user: { input_tokens: 10 },
      conversation: { output_tokens: 20 },
      run: { total_duration_ms: 42 },
      toolFixture: { trace_id: 'run-1', step_number: 1 },
      file: { original_filename: 'report.pdf', mimetype: 'application/pdf' },
      performanceSummary: { run_id: 'perf-1' },
      performanceDetail: { safe_summary: { resources: null } },
    });
  });
});
