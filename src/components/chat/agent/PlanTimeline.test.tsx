import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import { PlanTimeline } from './PlanTimeline';

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

describe('PlanTimeline', () => {
  it('没有 plan items 时不渲染', () => {
    const { container } = render(<PlanTimeline run={baseRun} />);
    expect(container.firstChild).toBeNull();
  });

  it('渲染计划步骤、类型和摘要', () => {
    render(<PlanTimeline run={{
      ...baseRun,
      plan: {
        planId: 'plan-r1',
        revision: 1,
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
          {
            id: 'answer',
            title: '生成回答',
            status: 'running',
            kind: 'answer',
            toolNames: [],
            evidenceItemIds: [],
          },
        ],
      },
    }} />);

    expect(screen.getByText('搜索资料')).toBeInTheDocument();
    expect(screen.getByText('搜索')).toBeInTheDocument();
    expect(screen.getByText('找到 2 条来源')).toBeInTheDocument();
    expect(screen.getByText('生成回答')).toBeInTheDocument();
    expect(screen.getByText('回答')).toBeInTheDocument();
  });
});
