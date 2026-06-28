import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import { RunProgressStrip } from './RunProgressStrip';

const baseRun: AgentRunState = {
  runId: 'r1',
  messageId: 'm1',
  status: 'running',
  config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
  totalSteps: 0,
  totalToolCalls: 0,
  steps: [],
  lastSequence: 1,
};

describe('RunProgressStrip', () => {
  it('没有 progress 时不渲染', () => {
    const { container } = render(<RunProgressStrip run={baseRun} />);
    expect(container.firstChild).toBeNull();
  });

  it('渲染当前 phase、label、步数和工具数', () => {
    render(<RunProgressStrip run={{
      ...baseRun,
      progress: {
        phase: 'synthesizing',
        label: '正在整理结论',
        completedSteps: 2,
        totalSteps: 4,
        completedToolCalls: 1,
        maxToolCalls: 5,
      },
    }} />);

    expect(screen.getByText('整理')).toBeInTheDocument();
    expect(screen.getByText('正在整理结论')).toBeInTheDocument();
    expect(screen.getByText('2/4 步')).toBeInTheDocument();
    expect(screen.getByText('工具 1/5')).toBeInTheDocument();
  });
});
