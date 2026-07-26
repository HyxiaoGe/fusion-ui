import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ToolCallState } from '@/types/agentRun';
import { ToolCallDetail } from './ToolCallDetail';

const call = (overrides: Partial<ToolCallState> = {}): ToolCallState => ({
  toolCallId: 'tool-1',
  toolName: 'url_read',
  arguments: { url: 'https://example.com/a' },
  status: 'failed',
  error: 'reader-service 读取超时，已降级跳过',
  startedAt: 1,
  completedAt: 2,
  ...overrides,
});

describe('ToolCallDetail', () => {
  it('未使用详情不展示内部失败原因', () => {
    render(<ToolCallDetail call={call()} />);

    expect(screen.getByText('未使用')).toBeInTheDocument();
    expect(screen.getByText('网页暂时无法读取')).toBeInTheDocument();
    expect(screen.queryByText(/reader-service/)).not.toBeInTheDocument();
  });

  it('参数修正中不显示部分结果不可用', () => {
    render(<ToolCallDetail call={call({
      status: 'degraded',
      error: undefined,
      resultSummary: {
        kind: 'weather',
        truncated: false,
        repair_state: 'retrying',
        repair_id: 'repair_0123456789abcdef',
      },
    })} />);

    expect(screen.getByText('参数校验未通过，正在自动修正后重试')).toBeInTheDocument();
    expect(screen.queryByText('部分结果暂时无法使用')).not.toBeInTheDocument();
  });
});
