import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrajectoryRunSummary, TrajectorySpan } from '@/types/trajectory';
import { TrajectoryTimeline } from './TrajectoryTimeline';

function run(
  runId: string,
  startedAt: string,
  durationMs: number,
  status = 'completed',
): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: `${runId}-answer`,
    turn_message_id: `${runId}-user`,
    attempt_index: 0,
    status,
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 1,
    duration_ms: durationMs,
    started_at: startedAt,
    ended_at: new Date(Date.parse(startedAt) + durationMs).toISOString(),
  };
}

function span(overrides: Partial<TrajectorySpan> = {}): TrajectorySpan {
  return {
    span_id: 'span-root',
    kind: 'llm',
    name: '生成回答',
    parent_span_id: null,
    start_sequence: 1,
    end_sequence: 3,
    started_at: '2026-08-23T00:00:00.000Z',
    ended_at: '2026-08-23T00:00:00.600Z',
    duration_ms: 600,
    status: 'completed',
    terminal_source: 'event',
    inferred_reason: null,
    ttft_ms: 120,
    record_sequences: [1, 2, 3],
    ...overrides,
  };
}

describe('TrajectoryTimeline', () => {
  it('会话 run 摘要带仅按各 run 自身耗时分配宽度，不计 turn 间等待', () => {
    render(
      <TrajectoryTimeline
        runs={[
          run('run-1', '2026-08-23T00:00:00.000Z', 100),
          run('run-2', '2026-08-23T00:10:00.000Z', 200),
        ]}
        selectedRunId="run-2"
        spans={[]}
      />,
    );

    const first = screen.getByTestId('trajectory-run-band-run-1');
    const second = screen.getByTestId('trajectory-run-band-run-2');
    expect(first.style.width).toBe('33.33333333333333%');
    expect(second.style.width).toBe('66.66666666666666%');
    expect(screen.getByText('执行总耗时 300 毫秒')).toBeInTheDocument();
    expect(screen.queryByText(/等待/)).not.toBeInTheDocument();
  });

  it('run 摘要与 span 同时使用文字状态和图标语义，不只依赖颜色', () => {
    render(
      <TrajectoryTimeline
        runs={[
          run('run-1', '2026-08-23T00:00:00.000Z', 600),
          run('run-2', '2026-08-23T00:00:02.000Z', 300, 'failed'),
        ]}
        selectedRunId="run-1"
        spans={[span()]}
      />,
    );

    expect(screen.getByRole('button', { name: /运行 1.*已完成.*600 毫秒/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /运行 2.*失败.*300 毫秒/ }))
      .toBeInTheDocument();
    expect(screen.getByText('已完成', { selector: '[data-run-status]' })).toBeInTheDocument();
  });

  it('用当前 run 自身区间绘制 span，并提供可见的阶段列表作为真相视图', () => {
    const child = span({
      span_id: 'span-child',
      kind: 'tool',
      name: '搜索资料',
      parent_span_id: 'span-root',
      start_sequence: 2,
      end_sequence: 2,
      started_at: '2026-08-23T00:00:00.200Z',
      ended_at: '2026-08-23T00:00:00.500Z',
      duration_ms: 300,
      ttft_ms: null,
      record_sequences: [2],
    });
    const onSelectSpan = vi.fn();
    render(
      <TrajectoryTimeline
        runs={[run('run-1', '2026-08-23T00:00:00.000Z', 600)]}
        selectedRunId="run-1"
        selectedSpanId="span-child"
        spans={[span(), child]}
        onSelectSpan={onSelectSpan}
      />,
    );

    const visual = screen.getByTestId('trajectory-span-span-child');
    expect(visual.style.left).toBe('33.33333333333333%');
    expect(visual.style.width).toBe('50%');

    const list = screen.getByRole('list', { name: '当前运行阶段列表' });
    expect(within(list).getByText('首次输出 120 毫秒')).toBeInTheDocument();
    const childButton = within(list).getByRole('button', {
      name: /搜索资料.*已完成.*300 毫秒.*父级 生成回答/,
    });
    expect(childButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(childButton);
    expect(onSelectSpan).toHaveBeenCalledWith(child);
  });

  it('切换 selected run 时只展示传入的当前 run spans，空数据预留稳定区域', () => {
    const { rerender } = render(
      <TrajectoryTimeline
        runs={[run('run-1', '2026-08-23T00:00:00.000Z', 600)]}
        selectedRunId="run-1"
        spans={[span()]}
      />,
    );
    expect(screen.getAllByText('生成回答')).not.toHaveLength(0);

    rerender(
      <TrajectoryTimeline
        runs={[run('run-1', '2026-08-23T00:00:00.000Z', 600)]}
        selectedRunId={null}
        spans={[]}
      />,
    );
    expect(screen.getByText('选择一次运行查看阶段时间线')).toBeInTheDocument();
    expect(screen.getByTestId('trajectory-span-region')).toHaveClass('min-h-40');
  });
});
