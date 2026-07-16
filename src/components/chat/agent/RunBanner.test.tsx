import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunBanner } from './RunBanner';
import type { AgentRunState } from '@/types/agentRun';

const baseConfig = { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 };

const run = (over: Partial<AgentRunState>): AgentRunState => ({
  runId: 'r1',
  messageId: 'm1',
  status: 'completed',
  config: baseConfig,
  totalSteps: 0,
  totalToolCalls: 0,
  steps: [],
  lastSequence: 0,
  ...over,
});

describe('RunBanner', () => {
  it('completed 不显示 banner', () => {
    const { container } = render(<RunBanner run={run({})} onRetry={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('failed 显示 danger banner + 重试按钮', () => {
    const onRetry = vi.fn();
    render(<RunBanner run={run({
      status: 'failed',
      failure: { code: 'PROVIDER_OFFLINE', message: 'OpenAI 上游断流' },
    })} onRetry={onRetry} />);
    expect(screen.getByText(/运行失败/)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI 上游断流/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/重试运行/));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('interrupted 显示 neutral banner（不显示恢复按钮，按 contract §7 不做）', () => {
    render(<RunBanner run={run({ status: 'interrupted', steps: [{
      stepId: 's1', stepNumber: 1, status: 'interrupted', toolCalls: [], contentBlockIds: [], startedAt: 0,
    }] })} onRetry={vi.fn()} />);
    expect(screen.getByText(/已中断/)).toBeInTheDocument();
    expect(screen.getByText(/已完成 1 步/)).toBeInTheDocument();
    // contract §7: 恢复 step 不做按钮
    expect(screen.queryByText(/^恢复$/)).not.toBeInTheDocument();
  });

  it.each(['max_steps', 'max_tool_calls'] as const)(
    'limit_reached + %s 显示统一普通用户文案且不泄露内部限制',
    reason => {
      const { container } = render(<RunBanner run={run({
        status: 'limit_reached',
        limitReachedReason: reason,
      })} onRetry={vi.fn()} />);

      expect(screen.getByText('本次检索已达到安全上限')).toBeInTheDocument();
      expect(screen.getByText('当前结果可能未完整覆盖你的问题，可以继续查找。')).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/max_steps|max_tool_calls|最大步数|工具调用|停止规划|停止调工具|工具预算|\b8\b|\b20\b/);
    },
  );

  it('limit_reached + timeout 显示普通用户文案且不走旧重试按钮', () => {
    const onRetry = vi.fn();
    const { container } = render(<RunBanner run={run({
      status: 'limit_reached',
      limitReachedReason: 'timeout',
    })} onRetry={onRetry} />);
    expect(screen.getByText('本次检索用时较长，已结束当前检索')).toBeInTheDocument();
    expect(screen.getByText('当前结果可能未完整覆盖你的问题，可以继续查找。')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/timeout|300|运行超时|停止规划|工具预算/);
    expect(screen.queryByText(/重新提问/)).not.toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('incomplete 显示部分完成 banner + 重试按钮', () => {
    const onRetry = vi.fn();
    render(<RunBanner run={run({ status: 'incomplete' })} onRetry={onRetry} />);
    expect(screen.getByText(/回答可能不完整/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/重新提问/));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('failed 但 onRetry 未传时不显示重试按钮（contract §7 不做 fake CTA）', () => {
    render(<RunBanner run={run({
      status: 'failed',
      failure: { code: 'X', message: 'fail' },
    })} />);
    expect(screen.queryByText(/重试运行/)).not.toBeInTheDocument();
  });

  it('limit_reached + timeout 但 onContinue 未传时不显示「继续查」按钮（contract §7 不做 fake CTA）', () => {
    render(<RunBanner run={run({
      status: 'limit_reached',
      limitReachedReason: 'timeout',
    })} />);
    expect(screen.getByText('本次检索用时较长，已结束当前检索')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续查' })).not.toBeInTheDocument();
  });

  it.each(['max_steps', 'max_tool_calls', 'timeout'] as const)(
    'limit_reached + %s 显示继续查按钮',
    reason => {
      const onContinue = vi.fn();
      render(<RunBanner run={run({
        status: 'limit_reached',
        limitReachedReason: reason,
      })} onContinue={onContinue} />);

      fireEvent.click(screen.getByRole('button', { name: '继续查' }));

      expect(onContinue).toHaveBeenCalledTimes(1);
    },
  );
});
