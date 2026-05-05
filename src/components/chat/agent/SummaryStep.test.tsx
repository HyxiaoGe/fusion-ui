import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryStep } from './SummaryStep';
import type { AgentStepState } from '@/types/agentRun';

const summaryStep = (over: Partial<AgentStepState>): AgentStepState => ({
  stepId: 's_summary',
  stepNumber: 4,
  status: 'completed',
  toolCalls: [],
  contentBlockIds: ['blk_1'],
  startedAt: 0,
  ...over,
});

describe('SummaryStep', () => {
  it('completed summary step 显示「整理答复」+ 步骤号', () => {
    render(<SummaryStep step={summaryStep({})} _isLast={true} />);
    expect(screen.getByText(/步骤 4/)).toBeInTheDocument();
    expect(screen.getByText(/整理答复/)).toBeInTheDocument();
  });

  it('running summary step 显示「正在整理答复」（无工具 spinner）', () => {
    render(<SummaryStep step={summaryStep({ status: 'running', contentBlockIds: [] })} _isLast={true} />);
    expect(screen.getByText(/正在整理答复/)).toBeInTheDocument();
    // 不应该有工具相关文本
    expect(screen.queryByText(/搜索/)).not.toBeInTheDocument();
    expect(screen.queryByText(/读取/)).not.toBeInTheDocument();
  });

  it('summary step 没有 ToolCallChip / ToolCallDetail', () => {
    render(<SummaryStep step={summaryStep({})} _isLast={true} />);
    expect(screen.queryByText(/参数/)).not.toBeInTheDocument();
  });

  it('interrupted summary step 显示「整理被中断」', () => {
    render(<SummaryStep step={summaryStep({ status: 'interrupted', contentBlockIds: [] })} _isLast={true} />);
    expect(screen.getByText(/整理被中断/)).toBeInTheDocument();
  });

  it('failed summary step 显示「整理失败」', () => {
    render(<SummaryStep step={summaryStep({ status: 'failed', contentBlockIds: [] })} _isLast={true} />);
    expect(screen.getByText(/整理失败/)).toBeInTheDocument();
  });
});
