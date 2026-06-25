import { describe, expect, it } from 'vitest';
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
    expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
  });

  it('completed 步骤默认显示聚合工具摘要', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({})],
      status: 'completed',
    })} _isLast={false} />);
    expect(screen.getByText(/搜索 1 次/)).toBeInTheDocument();
  });

  it('普通 success 单工具：无 chevron、按钮 disabled、点击不展开', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [tc({})],
      status: 'completed',
    })} _isLast={false} />);

    expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
  });

  it('成功工具步骤使用低权重容器和紧凑按钮样式', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [tc({})],
      status: 'completed',
    })} _isLast={false} />);

    expect(container.firstElementChild).toHaveClass(
      'rounded-md',
      'border',
      'border-border/30',
      'bg-transparent',
      'w-full',
      'min-w-0',
    );
    expect(screen.getByRole('button')).toHaveClass(
      'w-full',
      'flex',
      'items-start',
      'gap-2',
      'px-2.5',
      'py-1.5',
      'text-left',
      'hover:bg-muted/20',
      'transition-colors',
      'duration-fast',
      'disabled:cursor-default',
      'disabled:hover:bg-transparent',
    );
  });

  it('两个 web_search 只渲染一条聚合搜索摘要', () => {
    render(<AgentStepCard step={step({
      toolCalls: [
        tc({ toolCallId: 's1', arguments: { query: 'Global AI Standards Forum' }, resultSummary: { kind: 'web_search', title: '第一组', count: 5, truncated: false } }),
        tc({ toolCallId: 's2', arguments: { query: 'AI CEOs G7' }, resultSummary: { kind: 'web_search', title: '第二组', count: 5, truncated: false } }),
      ],
      status: 'completed',
    })} _isLast={false} />);

    expect(screen.getByText('搜索 2 次 · 共 10 条结果')).toBeInTheDocument();
    expect(screen.queryByText('Global AI Standards Forum')).not.toBeInTheDocument();
  });

  it('两个 url_read 只渲染一条聚合读取摘要', () => {
    render(<AgentStepCard step={step({
      toolCalls: [
        tc({ toolCallId: 'u1', toolName: 'url_read', arguments: { url: 'https://www.semafor.com/a' }, resultSummary: { kind: 'url_read', title: 'Semafor', truncated: false } }),
        tc({ toolCallId: 'u2', toolName: 'url_read', arguments: { url: 'https://letsdatascience.com/b' }, resultSummary: { kind: 'url_read', title: 'Data Science', truncated: false } }),
      ],
      status: 'completed',
    })} _isLast={false} />);

    expect(screen.getByText('读取 2 个网页')).toBeInTheDocument();
    expect(screen.queryByText('www.semafor.com')).not.toBeInTheDocument();
  });

  it('多工具组展开后显示聚合详情', () => {
    render(<AgentStepCard step={step({
      toolCalls: [
        tc({ toolCallId: 's1', arguments: { query: 'Global AI Standards Forum' }, resultSummary: { kind: 'web_search', title: '第一组', count: 5, truncated: false } }),
        tc({ toolCallId: 's2', arguments: { query: 'AI CEOs G7' }, resultSummary: { kind: 'web_search', title: '第二组', count: 5, truncated: false } }),
        tc({ toolCallId: 'u1', toolName: 'url_read', arguments: { url: 'https://www.semafor.com/a' }, resultSummary: { kind: 'url_read', title: 'Semafor', truncated: false } }),
      ],
      status: 'completed',
    })} _isLast={false} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Global AI Standards Forum')).toBeInTheDocument();
    expect(screen.getByText('AI CEOs G7')).toBeInTheDocument();
    expect(screen.getByText('www.semafor.com')).toBeInTheDocument();
  });

  it('failed 工具组默认展开但不显示内部错误信息', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'failed', resultSummary: undefined, error: 'reader-service 读取超时，已降级跳过' })],
      status: 'failed',
    })} _isLast={false} />);

    expect(screen.getByText(/搜索未取得可用结果/)).toBeInTheDocument();
    expect(screen.getByText(/部分搜索结果未能使用/)).toBeInTheDocument();
    expect(screen.queryByText(/reader-service/)).not.toBeInTheDocument();
  });

  it('truncated tool call：默认折叠，展开后显示截断提示', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({
        status: 'success',
        resultSummary: { kind: 'web_search', title: 'a', count: 10, truncated: true },
      })],
      status: 'completed',
    })} _isLast={false} />);

    expect(screen.queryByText(/截断/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/截断/)).toBeInTheDocument();
  });

  it('degraded tool call 默认展开并显示部分可用摘要', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'degraded', resultSummary: undefined })],
      status: 'completed',
    })} _isLast={false} />);

    expect(screen.getByText(/搜索部分可用/)).toBeInTheDocument();
    expect(screen.getByText(/部分搜索结果未能使用/)).toBeInTheDocument();
  });

  it('interrupted 步骤显示中断摘要', () => {
    render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'interrupted', resultSummary: undefined })],
      status: 'interrupted',
    })} _isLast={false} />);

    expect(screen.getByText('搜索已中断 · 1 个查询')).toBeInTheDocument();
    expect(screen.getAllByText('搜索已中断').length).toBeGreaterThanOrEqual(1);
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
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('running + 有 toolCalls 时 StepNumber 不显示 spinner，工具组显示 spinner', () => {
    const { container } = render(<AgentStepCard step={step({
      toolCalls: [tc({ status: 'running', resultSummary: undefined })],
      status: 'running',
    })} _isLast={true} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    const stepNumberDiv = document.querySelector('.w-6.h-6.rounded-full');
    expect(stepNumberDiv?.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelector('[data-testid="tool-call-group-web_search"] .animate-spin')).toBeInTheDocument();
  });
});
