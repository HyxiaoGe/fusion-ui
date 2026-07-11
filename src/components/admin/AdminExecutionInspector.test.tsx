import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AdminExecutionInspector from './AdminExecutionInspector';

describe('AdminExecutionInspector', () => {
  it('展示 Agent run、step 和脱敏工具安全投影', () => {
    render(<AdminExecutionInspector
      runs={[{
        id: 'run-1', status: 'completed', model_id: 'gpt-5', provider: 'openai',
        message_id: 'msg-1', user_id: 'user-1', total_steps: 1, total_tool_calls: 1, total_duration_ms: 1234, limit_reason: null,
        config: { max_steps: 8 }, error: null, created_at: '2026-07-11T10:00:00Z',
        progress: { phase: 'answering', label: '正在组织回答', completed_steps: 1, total_steps: 1 },
        steps: [{ id: 'step-1', step_number: 1, status: 'completed', tool_calls_count: 1, tool_names: ['web_search'], duration_ms: 900, created_at: '2026-07-11T10:00:00Z', tool_calls: [] }],
      }]}
      toolCalls={[{
        id: 'tool-1', message_id: 'msg-1', trace_id: 'run-1', step_number: 1, tool_name: 'web_search',
        status: 'success', duration_ms: 800, arguments: { query: 'Fusion' },
        result_preview: { count: 3, api_key: '[REDACTED]' }, error: null,
        model_id: 'gpt-5', provider: 'openai', redacted_fields: ['result_preview.api_key'], created_at: '2026-07-11T10:00:00Z',
      }]}
    />);

    expect(screen.getByText('run-1')).toBeInTheDocument();
    expect(screen.getByText('步骤 1')).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText(/\[REDACTED\]/)).toBeInTheDocument();
    expect(screen.getByText('进度安全投影')).toBeInTheDocument();
    expect(screen.getByText(/正在组织回答/)).toBeInTheDocument();
  });

  it('空执行记录不渲染误导性容器', () => {
    const { container } = render(<AdminExecutionInspector runs={[]} toolCalls={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
