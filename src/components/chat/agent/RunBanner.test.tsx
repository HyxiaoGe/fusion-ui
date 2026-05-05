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
    // contract §7: 恢复 step 不做按钮
    expect(screen.queryByText(/^恢复$/)).not.toBeInTheDocument();
  });

  it('limit_reached + max_steps reason 显示 max_steps 文案', () => {
    render(<RunBanner run={run({
      status: 'limit_reached',
      limitReachedReason: 'max_steps',
    })} onRetry={vi.fn()} />);
    expect(screen.getByText(/最大步数/)).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });

  it('limit_reached + max_tool_calls reason 显示工具调用文案', () => {
    render(<RunBanner run={run({
      status: 'limit_reached',
      limitReachedReason: 'max_tool_calls',
    })} onRetry={vi.fn()} />);
    expect(screen.getByText(/工具调用/)).toBeInTheDocument();
  });

  it('limit_reached + timeout reason 显示超时文案 + 重试按钮', () => {
    const onRetry = vi.fn();
    render(<RunBanner run={run({
      status: 'limit_reached',
      limitReachedReason: 'timeout',
    })} onRetry={onRetry} />);
    expect(screen.getByText(/超时/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/重新提问/));
    expect(onRetry).toHaveBeenCalled();
  });
});
