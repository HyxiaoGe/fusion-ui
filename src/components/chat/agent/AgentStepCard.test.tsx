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
  });

  it('pending 形态按钮 disabled，无 chevron', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [],
      status: 'running',
    })} _isLast={true} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    // pending 没有 chevron
    expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
  });

  it('completed 步骤默认折叠头部，显示 step 编号 + 工具徽章', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({})],
      status: 'completed',
    })} _isLast={false} />);
    expect(screen.getByText(/搜索/)).toBeInTheDocument();
  });

  it('普通 success tool call：无 chevron、按钮 disabled、点击不展开', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [tc({})],
      status: 'completed',
    })} _isLast={false} />);
    // success + 非截断 = 无非冗余 detail，不应渲染 chevron
    expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    // 点击不应触发展开（即便强行点也无渲染变化）
    fireEvent.click(button);
    expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
  });

  it('failed 步骤：有 chevron + 展开后显示错误信息', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'failed', error: 'TIMEOUT: fetch 超时' })],
      status: 'failed',
    })} _isLast={false} />);
    // 失败 = 有 detail，应有 chevron
    expect(container.querySelector('svg.lucide-chevron-down')).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(screen.getByText(/TIMEOUT/)).toBeInTheDocument();
  });

  it('truncated tool call：有 chevron + 展开后显示「已截断」提示', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [tc({
        status: 'success',
        resultSummary: { kind: 'web_search', title: 'a', count: 10, truncated: true },
      })],
      status: 'completed',
    })} _isLast={false} />);
    expect(container.querySelector('svg.lucide-chevron-down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/已截断/)).toBeInTheDocument();
  });

  it('degraded tool call：有 chevron + 展开后显示降级提示', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'degraded' })],
      status: 'completed',
    })} _isLast={false} />);
    expect(container.querySelector('svg.lucide-chevron-down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    // 用 detail 独有的「降级回退」匹配，避免跟折叠态 NoResultLabel 「部分结果不可用」撞车
    expect(screen.getByText(/降级回退/)).toBeInTheDocument();
  });

  it('展开后只渲染有 detail 的 tool call（success 不出现）', () => {
    render(<AgentStepCard step={step({
      toolCalls: [
        tc({ toolCallId: 't1', toolName: 'web_search', status: 'success' }),
        tc({ toolCallId: 't2', toolName: 'url_read', arguments: { url: 'https://x' }, status: 'failed', error: 'CONN_REFUSED' }),
      ],
      status: 'completed',
    })} _isLast={false} />);
    fireEvent.click(screen.getByRole('button'));
    // 展开后应有 failed 的 error 文案
    expect(screen.getByText(/CONN_REFUSED/)).toBeInTheDocument();
    // 不应有第二个 detail（success 的）— 通过验证 ToolCallDetail border-l 容器只有 1 个
    expect(document.querySelectorAll('.border-l').length).toBe(1);
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

  it('running + 0 toolCalls + 0 contentBlockIds 显示 pending（LLM 在思考下一步）', () => {
    render(<AgentStepCard step={step({
      toolCalls: [],
      status: 'running',
      contentBlockIds: [],
    })} _isLast={true} />);
    expect(screen.getByText(/正在思考下一步/)).toBeInTheDocument();
  });

  it('running + 0 toolCalls + contentBlockIds > 0 不渲染（让正文接管 streaming）', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [],
      status: 'running',
      contentBlockIds: ['blk_1', 'blk_2'],
    })} _isLast={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('running + 0 toolCalls 时 StepNumber 显示 spinner（pending 思考）', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [],
      status: 'running',
      contentBlockIds: [],
    })} _isLast={true} />);
    // StepNumber 圆圈内有 animate-spin
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('running + 有 toolCalls 时 StepNumber 不显示 spinner（让位 ToolCallChip）', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'running' })],
      status: 'running',
    })} _isLast={true} />);
    // StepNumber 圆圈内应该是 step number "1" 不是 spinner
    expect(screen.getByText('1')).toBeInTheDocument();
    // ToolCallChip 仍可以有 spinner（chip 内 Loader2），但 StepNumber 圆圈内不该有
    // 通过 dom 结构验证：找 w-6 h-6 rounded-full 那个 div 内不含 animate-spin
    const stepNumberDiv = document.querySelector('.w-6.h-6.rounded-full');
    expect(stepNumberDiv?.querySelector('.animate-spin')).toBeNull();
  });
});
