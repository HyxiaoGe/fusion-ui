import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RunHeader } from './RunHeader';
import type { AgentRunState } from '@/types/agentRun';

const baseConfig = { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 };

const run = (over: Partial<AgentRunState>): AgentRunState => ({
  runId: 'r1',
  messageId: 'm1',
  status: 'running',
  config: baseConfig,
  totalSteps: 0,
  totalToolCalls: 0,
  steps: [],
  lastSequence: 0,
  ...over,
});

describe('RunHeader', () => {
  it('显示 已用 N 步 + status 标签（不再常驻 maxSteps）', () => {
    render(<RunHeader run={run({ status: 'completed', steps: [
      { stepId: 's1', stepNumber: 1, status: 'completed', toolCalls: [], contentBlockIds: [], startedAt: 1_000_000 },
      { stepId: 's2', stepNumber: 2, status: 'completed', toolCalls: [], contentBlockIds: [], startedAt: 1_002_000 },
    ] })} />);
    expect(screen.getByText(/已用/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/已完成/)).toBeInTheDocument();
    // maxSteps（baseConfig.maxSteps=8）不应出现在 header 里——只在 limit_reached banner 展示
    expect(screen.queryByText(/\/ 8/)).not.toBeInTheDocument();
  });

  it('hydration 只有 run summary 时用 totalSteps 兜底显示已用步数', () => {
    render(<RunHeader run={run({
      status: 'completed',
      totalSteps: 2,
      steps: [],
    })} />);

    expect(screen.getByText(/已用/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('running 状态秒数实时跳（fake timer 1s 后秒数 +1）', () => {
    vi.useFakeTimers();
    const startTime = 1_000_000;
    vi.setSystemTime(startTime);

    const runningRun = run({
      status: 'running',
      steps: [{ stepId: 's1', stepNumber: 1, status: 'running', toolCalls: [], contentBlockIds: [], startedAt: startTime }],
    });
    render(<RunHeader run={runningRun} />);

    // 初始秒数 0.0s …
    expect(screen.getByText(/0\.0s …/)).toBeInTheDocument();

    // 推进 1500ms：interval 在 1000ms 时触发，setNow(Date.now()) 取到 startTime+1000
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // interval 触发一次，秒数跳到 1.0s（Date.now() 在 1000ms 时刻 = startTime+1000）
    expect(screen.getByText(/1\.0s …/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('non-running 状态不开 timer，秒数固定（用 lastStep.completedAt）', () => {
    const finishedRun = run({
      status: 'completed',
      steps: [{
        stepId: 's1', stepNumber: 1, status: 'completed',
        toolCalls: [], contentBlockIds: [],
        startedAt: 1_000_000, completedAt: 1_003_500,
      }],
    });
    render(<RunHeader run={finishedRun} />);
    // 应该显示 3.5s（不带 …）
    expect(screen.getByText(/3\.5s/)).toBeInTheDocument();
  });

  it('无 startedAt 时不渲染 RunDuration', () => {
    render(<RunHeader run={run({ status: 'running', steps: [] })} />);
    // 不应找到秒数文本
    expect(screen.queryByText(/s …/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\ds$/)).not.toBeInTheDocument();
  });

  it('running 状态显示 pulse dot 不显示 button-like spinner', () => {
    render(<RunHeader run={run({
      status: 'running',
      steps: [{ stepId: 's1', stepNumber: 1, status: 'running', toolCalls: [], contentBlockIds: [], startedAt: 1_000_000 }],
    })} />);
    expect(screen.getByText(/运行中/)).toBeInTheDocument();
    // 不应有 button-like border + bg（找外层 inline-flex 容器）
    const tag = screen.getByText(/运行中/).closest('span.inline-flex');
    expect(tag?.className).not.toMatch(/border/);
    expect(tag?.className).not.toMatch(/bg-info\/10/);
  });

  it('completed 状态保留 button-like 标签 + check icon', () => {
    render(<RunHeader run={run({
      status: 'completed',
      steps: [{ stepId: 's1', stepNumber: 1, status: 'completed', toolCalls: [], contentBlockIds: [], startedAt: 1_000_000, completedAt: 1_005_000 }],
    })} />);
    expect(screen.getByText(/已完成/)).toBeInTheDocument();
    // 「已完成」文字在内层 <span>，需要找外层容器（inline-flex span）
    const tag = screen.getByText(/已完成/).closest('span.inline-flex');
    expect(tag?.className).toMatch(/border/);
    expect(tag?.className).toMatch(/bg-success\/10/);
  });
});
