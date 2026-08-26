import React, { act } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentRunState } from '@/types/agentRun';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import type { TrajectoryBadgeStatus } from '@/lib/trajectory/TrajectoryCellProjection';
import TrajectoryStatusLine from './TrajectoryStatusLine';

function run(overrides: Partial<AgentRunState> = {}): AgentRunState {
  return {
    runId: 'run-1',
    messageId: 'assistant-1',
    status: 'completed',
    config: { maxSteps: 8, maxToolCalls: 16, timeoutS: 300 },
    totalSteps: 1,
    totalToolCalls: 1,
    steps: [{
      stepId: 'step-1',
      stepNumber: 1,
      status: 'completed',
      toolCalls: [],
      contentBlockIds: [],
      startedAt: 1_000,
      completedAt: 2_500,
    }],
    lastSequence: 4,
    ...overrides,
  };
}

function summary(overrides: Partial<TrajectoryRunSummary> = {}): TrajectoryRunSummary {
  return {
    run_id: 'run-1', message_id: 'assistant-1', turn_message_id: 'user-1',
    attempt_index: 1, status: 'completed', trajectory_status: 'complete',
    total_steps: 4, total_tool_calls: 2, duration_ms: 19_038,
    started_at: '2026-08-26T02:27:58.000Z', ended_at: '2026-08-26T02:28:17.038Z',
    llm_detail_schema_version: 1, llm_round_count: 4,
    ...overrides,
  };
}

describe('TrajectoryStatusLine', () => {
  afterEach(() => vi.useRealTimers());

  it('历史消息没有步骤时使用同一运行的服务端耗时，摘要补齐后更新', () => {
    const historicalRun = run({ steps: [] });
    const view = render(<TrajectoryStatusLine run={historicalRun} trajectoryStatus="complete" />);
    expect(screen.getByText('耗时未知')).toBeInTheDocument();

    view.rerender(<TrajectoryStatusLine run={historicalRun} trajectoryStatus="complete" runSummary={summary()} />);
    expect(screen.getByText('耗时 19.04 秒')).toBeInTheDocument();
  });

  it('服务端总耗时优先于局部步骤时间且零毫秒合法', () => {
    const view = render(<TrajectoryStatusLine run={run()} trajectoryStatus="complete" runSummary={summary()} />);
    expect(screen.getByText('耗时 19.04 秒')).toBeInTheDocument();
    view.rerender(<TrajectoryStatusLine run={run()} trajectoryStatus="complete" runSummary={summary({ duration_ms: 0 })} />);
    expect(screen.getByText('耗时 0 毫秒')).toBeInTheDocument();
  });

  it('没有总耗时但有合法起止时间时可恢复历史计时', () => {
    render(<TrajectoryStatusLine run={run({ steps: [] })} trajectoryStatus="complete" runSummary={summary({ duration_ms: null })} />);
    expect(screen.getByText('耗时 19.04 秒')).toBeInTheDocument();
  });

  it('不借用另一个 attempt 的总耗时', () => {
    render(<TrajectoryStatusLine run={run({ steps: [] })} trajectoryStatus="complete" runSummary={summary({ run_id: 'run-2' })} />);
    expect(screen.getByText('耗时未知')).toBeInTheDocument();
  });

  it('终态摘要缺结束时间时不继续按当前时间计时', () => {
    render(<TrajectoryStatusLine run={run({ steps: [] })} trajectoryStatus="complete" runSummary={summary({ duration_ms: null, ended_at: null })} />);
    expect(screen.getByText('耗时未知')).toBeInTheDocument();
  });

  it('运行中只有服务端起点也能递增计时', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-08-26T02:28:00.000Z'));
    render(<TrajectoryStatusLine run={run({ status: 'running', steps: [] })} trajectoryStatus="recording" runSummary={summary({ status: 'running', duration_ms: null, ended_at: null })} />);
    expect(screen.getByText('耗时 2 秒')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('耗时 3 秒')).toBeInTheDocument();
  });

  it('running 耗时持续更新但不会把整行作为周期 live announcement', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_500);
    const { unmount } = render(
      <TrajectoryStatusLine
        run={run({ status: 'running', steps: [{
          stepId: 'step-1',
          stepNumber: 1,
          status: 'running',
          toolCalls: [],
          contentBlockIds: [],
          startedAt: 1_000,
        }] })}
        trajectoryStatus="recording"
      />,
    );

    const statusLine = screen.getByRole('group', { name: 'Agent 运行状态' });
    const duration = within(statusLine).getByText('耗时 1.5 秒');
    expect(duration).toHaveTextContent('耗时 1.5 秒');
    expect(duration).toHaveAccessibleName('Agent 运行耗时 1.5 秒');
    expect(duration).toHaveAttribute('aria-live', 'off');
    expect(statusLine.querySelector('[aria-live="polite"], [aria-live="assertive"]')).toBeNull();

    act(() => vi.advanceTimersByTime(2_000));

    expect(duration).toHaveTextContent('耗时 3.5 秒');
    expect(duration).toHaveAccessibleName('Agent 运行耗时 3.5 秒');
    expect(statusLine.querySelector('[aria-live="polite"], [aria-live="assertive"]')).toBeNull();
    unmount();
    vi.useRealTimers();
  });

  it('固定展示状态点及名称、耗时、独立轨迹 badge 和查看轨迹入口', () => {
    const onInspect = vi.fn();
    render(
      <TrajectoryStatusLine
        run={run()}
        trajectoryStatus="complete"
        onInspect={onInspect}
      />,
    );

    const statusLine = screen.getByRole('group', { name: 'Agent 运行状态' });
    expect(statusLine).toHaveTextContent('Agent 已完成');
    expect(statusLine).toHaveTextContent('耗时 1.5 秒');
    expect(statusLine).toHaveTextContent('轨迹完整');
    expect(within(statusLine).getByTestId('agent-status-dot')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(within(statusLine).getByRole('button', { name: '查看轨迹' }));
    expect(onInspect).toHaveBeenCalledTimes(1);
  });

  it('多个异常并存时只展示最高优先级的 run failure，且不泄漏旧过程内容与 run actions', () => {
    render(
      <TrajectoryStatusLine
        run={run({
          status: 'failed',
          failure: { code: 'provider_down', message: '模型服务暂时不可用' },
          plan: {
            planId: 'plan-1',
            revision: 1,
            items: [{
              id: 'private-plan',
              title: '不要展示的计划',
              status: 'failed',
              kind: 'search',
              toolNames: ['web_search'],
              evidenceItemIds: ['evidence-1'],
            }],
          },
          evidence: [{
            id: 'evidence-1',
            kind: 'web',
            status: 'candidate',
            title: '不要展示的依据',
            claim: '内部依据',
            usedByFinalAnswer: false,
          }],
          steps: [{
            stepId: 'step-1',
            stepNumber: 1,
            status: 'failed',
            contentBlockIds: [],
            startedAt: 1_000,
            completedAt: 2_000,
            toolCalls: [{
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: {},
              status: 'degraded',
              error: '次级工具异常',
              startedAt: 1_200,
              completedAt: 1_800,
            }],
          }],
        })}
        trajectoryStatus="degraded"
        onInspect={vi.fn()}
      />,
    );

    const statusLine = screen.getByRole('group', { name: 'Agent 运行状态' });
    expect(statusLine).toHaveTextContent('模型服务暂时不可用');
    expect(statusLine).not.toHaveTextContent('次级工具异常');
    expect(statusLine).not.toHaveTextContent('不要展示的计划');
    expect(statusLine).not.toHaveTextContent('不要展示的依据');
    expect(statusLine).not.toHaveTextContent(/Token|TTFT|步骤|工具列表|Evidence/i);
    expect(within(statusLine).queryByRole('button', { name: /重试|继续|展开|详情/ })).toBeNull();
  });

  it.each([
    ['recording', '轨迹记录中'],
    ['complete', '轨迹完整'],
    ['degraded', '轨迹降级'],
    ['truncated', '轨迹已截断'],
    ['legacy', '历史未记录轨迹'],
    ['summary-only', '仅运行摘要'],
    ['unknown', '轨迹状态未知'],
  ] as Array<[TrajectoryBadgeStatus, string]>)('轨迹状态 %s 使用独立文字 badge %s', (status, label) => {
    render(<TrajectoryStatusLine run={run()} trajectoryStatus={status} />);

    expect(screen.getByText(label)).toHaveAttribute('data-trajectory-badge', status);
  });

  it('没有时间锚点时仍明确展示耗时未知，状态不只依赖颜色', () => {
    render(
      <TrajectoryStatusLine
        run={run({ status: 'interrupted', steps: [] })}
        trajectoryStatus="summary-only"
      />,
    );

    const statusLine = screen.getByRole('group', { name: 'Agent 运行状态' });
    expect(statusLine).toHaveTextContent('Agent 已中断');
    expect(statusLine).toHaveTextContent('耗时未知');
  });
});
