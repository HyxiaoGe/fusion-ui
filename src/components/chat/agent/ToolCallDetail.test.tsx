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
});
