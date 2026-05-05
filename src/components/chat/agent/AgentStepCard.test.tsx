import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentStepCard } from './AgentStepCard';
import type { AgentStepState, ToolCallState } from '@/types/agentRun';

const tc = (over: Partial<ToolCallState>): ToolCallState => ({
  toolCallId: 't1',
  toolName: 'web_search',
  arguments: { query: 'GPT 5.5' },
  status: 'success',
  startedAt: 0,
  ...over,
});

const step = (over: Partial<AgentStepState>): AgentStepState => ({
  stepId: 's1',
  stepNumber: 1,
  status: 'completed',
  toolCalls: [],
  contentBlockIds: [],
  startedAt: 0,
  ...over,
});

describe('AgentStepCard', () => {
  it('running + 0 toolCalls 渲染 pending 形态「正在思考下一步」', () => {
    render(<AgentStepCard step={step({
      toolCalls: [],
      status: 'running',
    })} _isLast={true} />);
    expect(screen.getByText(/正在思考下一步/)).toBeInTheDocument();
    // pending 形态不应显示参数 detail
    expect(screen.queryByText(/参数/)).not.toBeInTheDocument();
  });

  it('pending 形态按钮 disabled，点击不展开', () => {
    render(<AgentStepCard step={step({
      toolCalls: [],
      status: 'running',
    })} _isLast={true} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.queryByText(/参数/)).not.toBeInTheDocument();
  });

  it('completed 步骤默认折叠头部，显示 step 编号 + 工具徽章', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({})],
      status: 'completed',
    })} _isLast={false} />);
    expect(screen.getByText(/搜索/)).toBeInTheDocument();
    // step 编号通过 StepNumber 显示——但 completed 时 StepNumber 显示 check icon 不是数字
    // 所以只断言工具徽章
  });

  it('running 步骤默认折叠，点击后显示参数', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'running' })],
      status: 'running',
    })} _isLast={true} />);
    // 默认折叠，找不到「参数」详情
    expect(screen.queryByText(/参数/)).not.toBeInTheDocument();
    // 点击头部展开
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/参数/)).toBeInTheDocument();
  });

  it('failed 步骤显示警示色 + 错误信息', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'failed', error: 'TIMEOUT: fetch 超时' })],
      status: 'failed',
    })} _isLast={false} />);
    const head = screen.getByRole('button');
    fireEvent.click(head);
    expect(screen.getByText(/TIMEOUT/)).toBeInTheDocument();
  });

  it('点击头部切换展开 / 折叠', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({})],
      status: 'completed',
    })} _isLast={false} />);
    expect(screen.queryByText(/参数/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/参数/)).toBeInTheDocument();
  });

  it('多 tool call 并行 running 全部显示徽章', () => {
    render(<AgentStepCard step={step({
      toolCalls: [
        tc({ toolCallId: 't1', toolName: 'web_search', status: 'running' }),
        tc({ toolCallId: 't2', toolName: 'url_read', arguments: { url: 'https://x' }, status: 'running' }),
      ],
      status: 'running',
    })} _isLast={true} />);
    expect(screen.getByText(/搜索/)).toBeInTheDocument();
    expect(screen.getByText(/读取/)).toBeInTheDocument();
  });

  it('interrupted 步骤显示中断标识', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'interrupted' })],
      status: 'interrupted',
    })} _isLast={false} />);
    // 折叠态头部就有 「已中断」徽章
    expect(screen.getByText(/已中断/)).toBeInTheDocument();
  });

  it('degraded tool call 显示「部分降级」徽章', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'degraded' })],
      status: 'completed',
    })} _isLast={false} />);
    expect(screen.getByText(/部分降级/)).toBeInTheDocument();
  });
});
