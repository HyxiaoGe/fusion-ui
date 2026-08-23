import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import { TrajectoryOverview } from './TrajectoryOverview';

function run(runId: string, durationMs = 1_000): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: `${runId}-answer`,
    turn_message_id: `${runId}-question`,
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 1,
    duration_ms: durationMs,
    started_at: '2026-08-24T00:00:00.000Z',
    ended_at: new Date(Date.parse('2026-08-24T00:00:00.000Z') + durationMs).toISOString(),
  };
}

function event(
  sequence: number,
  eventType: string,
  overrides: Partial<NormalizedTrajectoryEvent> = {},
): NormalizedTrajectoryEvent {
  return {
    runId: 'run-a',
    sequence,
    eventType,
    schemaVersion: 1,
    timestamp: new Date(Date.parse('2026-08-24T00:00:00.000Z') + sequence * 100).toISOString(),
    stepId: null,
    toolCallId: null,
    parentStepId: null,
    traceId: 'run-a',
    payload: {},
    ...overrides,
  };
}

function runCell(runId: string, hydrated: boolean): TrajectoryCell {
  return {
    key: `run:${runId}`,
    type: 'run',
    runId,
    userMessageId: null,
    assistantMessageId: null,
    completenessSources: ['run-summary'],
    sourceSequences: [],
    summarySource: 'run-summary',
    attemptIndex: 0,
    runStatus: 'completed',
    totalSteps: 1,
    totalToolCalls: 1,
    startedAt: '2026-08-24T00:00:00.000Z',
    endedAt: '2026-08-24T00:00:01.000Z',
    isSelected: runId === 'run-a',
    isHydrated: hydrated,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'run-summary', reason: null },
    records: [],
    spans: [],
    liveTail: [],
  };
}

function fixtureEvents(): NormalizedTrajectoryEvent[] {
  return [
    event(0, 'run_started'),
    event(1, 'llm_round_started', { payload: { llm_round_id: 'round-1', model: 'deepseek-chat' } }),
    event(2, 'tool_call_started', {
      toolCallId: 'tool-1',
      payload: { tool_name: '联网搜索' },
    }),
    event(3, 'tool_call_completed', {
      toolCallId: 'tool-1',
      payload: { tool_name: '联网搜索', status: 'success' },
    }),
    event(4, 'llm_round_completed', { payload: { llm_round_id: 'round-1', status: 'success' } }),
  ];
}

const context = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textBaseline: 'alphabetic' as CanvasTextBaseline,
};

describe('TrajectoryOverview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(context).forEach(value => {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1_000,
      bottom: 160,
      width: 1_000,
      height: 160,
      toJSON: () => ({}),
    });
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    HTMLElement.prototype.setPointerCapture = () => {};
    HTMLElement.prototype.releasePointerCapture = () => {};
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  it('使用 Canvas 真实坐标 hit-test 选择 segment，粗带点击先聚焦未水合 run', () => {
    const onSelectSegment = vi.fn();
    const onSelectRun = vi.fn();
    const onRequestRunFocus = vi.fn();
    const { rerender } = render(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={fixtureEvents()}
        cells={[runCell('run-a', true)]}
        onSelectSegment={onSelectSegment}
      />,
    );
    const canvas = screen.getByRole('application', { name: /轨迹记录总览/ });

    fireEvent.pointerDown(canvas, { clientX: 500, clientY: 94, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 94, button: 0, pointerId: 1 });
    expect(onSelectSegment).toHaveBeenCalledWith(expect.objectContaining({
      track: 'model',
      targetCellKey: 'run:run-a',
    }));

    rerender(
      <TrajectoryOverview
        runs={[run('run-a'), { ...run('run-b'), started_at: '2026-08-24T00:00:02.000Z' }]}
        focusedRunId="run-a"
        focusedRunEvents={fixtureEvents()}
        cells={[runCell('run-a', true), runCell('run-b', false)]}
        onSelectRun={onSelectRun}
        onRequestRunFocus={onRequestRunFocus}
      />,
    );
    fireEvent.pointerDown(canvas, { clientX: 750, clientY: 20, button: 0, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 750, clientY: 20, button: 0, pointerId: 2 });
    expect(onSelectRun).toHaveBeenCalledWith('run-b');
    expect(onRequestRunFocus).toHaveBeenCalledWith('run-b');
    expect(screen.getByRole('status')).toHaveTextContent('正在聚焦运行 2');
  });

  it('单一 Canvas 键盘入口支持首中尾导航、选择和可访问活动项文本', () => {
    const onSelectSegment = vi.fn();
    render(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={fixtureEvents()}
        cells={[runCell('run-a', true)]}
        onSelectSegment={onSelectSegment}
      />,
    );
    const canvas = screen.getByRole('application', { name: /轨迹记录总览/ });
    canvas.focus();

    fireEvent.pointerMove(canvas, { clientX: 500, clientY: 94 });
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Model，deepseek-chat，完成，sequence 1 至 4，08/24 08:00:00.100 至 08/24 08:00:00.400',
    );

    fireEvent.keyDown(canvas, { key: 'End' });
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Tools');
    fireEvent.keyDown(canvas, { key: 'Home' });
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Input');
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Model');
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(onSelectSegment).toHaveBeenLastCalledWith(expect.objectContaining({ track: 'model' }));
  });

  it('pointer 拖选、slider 键盘、Escape、右键和可见按钮都能更新或清除范围', () => {
    const onRangeChange = vi.fn();
    render(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={fixtureEvents()}
        cells={[runCell('run-a', true)]}
        onRangeChange={onRangeChange}
      />,
    );
    const canvas = screen.getByRole('application', { name: /轨迹记录总览/ });

    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 130, button: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 700, clientY: 130, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 700, clientY: 130, button: 0, pointerId: 1 });
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: 0.2, end: 0.7 });

    const startHandle = screen.getByRole('slider', { name: '范围起点' });
    fireEvent.keyDown(startHandle, { key: 'ArrowRight' });
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: 0.21, end: 0.7 });

    fireEvent.keyDown(startHandle, { key: 'Escape' });
    expect(onRangeChange).toHaveBeenLastCalledWith(null);

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 130, button: 0, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 130, button: 0, pointerId: 2 });
    fireEvent.contextMenu(canvas);
    expect(onRangeChange).toHaveBeenLastCalledWith(null);

    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 130, button: 0, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 600, clientY: 130, button: 0, pointerId: 3 });
    fireEvent.click(screen.getByRole('button', { name: '清除范围' }));
    expect(onRangeChange).toHaveBeenLastCalledWith(null);
  });

  it('mode、zoom、活动项与范围在 live append rerender 后保持，DOM 数量不随事件数线性增长', () => {
    const initialEvents = fixtureEvents();
    const view = render(
      <TrajectoryOverview
        runs={[run('run-a', 5_000)]}
        focusedRunId="run-a"
        focusedRunEvents={initialEvents}
        cells={[runCell('run-a', true)]}
        selectedCellKey="run:run-a"
        searchMatchedCellKeys={new Set(['run:run-a'])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '实际耗时' }));
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    const canvas = screen.getByRole('application', { name: /轨迹记录总览/ });
    fireEvent.keyDown(canvas, { key: 'End' });
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 130, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: 130, button: 0, pointerId: 1 });

    const manyEvents = [
      ...initialEvents,
      ...Array.from({ length: 4_995 }, (_, index) => {
        const sequence = index + 5;
        return event(
          sequence,
          sequence % 2 === 0 ? 'llm_round_started' : 'llm_round_completed',
          { payload: { llm_round_id: `round-${Math.floor(sequence / 2)}`, status: 'success' } },
        );
      }),
    ];
    view.rerender(
      <TrajectoryOverview
        runs={[run('run-a', 5_000)]}
        focusedRunId="run-a"
        focusedRunEvents={manyEvents}
        cells={[runCell('run-a', true)]}
        selectedCellKey="run:run-a"
        searchMatchedCellKeys={new Set(['run:run-a'])}
      />,
    );

    expect(screen.getByRole('button', { name: '实际耗时' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('2×')).toBeInTheDocument();
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Tools');
    expect(screen.getByRole('slider', { name: '范围起点' })).toHaveValue('50');
    expect(view.container.querySelectorAll('*').length).toBeLessThan(80);
  });
});
