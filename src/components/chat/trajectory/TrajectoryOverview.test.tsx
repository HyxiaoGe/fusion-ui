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
    llm_detail_schema_version: 1,
    llm_round_count: 0,
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

function mockOverviewRect(element: HTMLElement, width = 1_048, height = 54) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
}

describe('TrajectoryOverview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('用可见 DOM 轨道呈现 Input、Model、Tools 和记录区段', () => {
    render(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={fixtureEvents()}
        cells={[runCell('run-a', true)]}
      />,
    );

    const overview = screen.getByRole('application', { name: /轨迹记录总览/ });
    expect(overview.tagName).toBe('DIV');
    expect(overview).not.toHaveClass('overflow-hidden');
    expect(screen.getByTestId('trajectory-overview-tracks')).toBeInTheDocument();
    expect(screen.getAllByTestId('trajectory-overview-segment').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('trajectory-overview-segment')
      .find(segment => segment.getAttribute('data-track') === 'model'))
      .toHaveStyle({ backgroundColor: 'var(--primary)' });
    for (const label of ['Input', 'Model', 'Tools']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('使用 DOM 轨道真实坐标 hit-test 选择 segment，粗带点击先聚焦未水合 run', () => {
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
    mockOverviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 548, clientY: 30, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 548, clientY: 30, button: 0, pointerId: 1 });
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
    fireEvent.pointerDown(canvas, { clientX: 798, clientY: 4, button: 0, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 798, clientY: 4, button: 0, pointerId: 2 });
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
    mockOverviewRect(canvas);
    canvas.focus();

    fireEvent.pointerMove(canvas, { clientX: 548, clientY: 30 });
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
    mockOverviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 248, clientY: 48, button: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 748, clientY: 48, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 748, clientY: 48, button: 0, pointerId: 1 });
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: 0.2, end: 0.7 });

    const startHandle = screen.getByRole('slider', { name: '范围起点' });
    fireEvent.keyDown(startHandle, { key: 'ArrowRight' });
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: 0.21, end: 0.7 });

    fireEvent.keyDown(startHandle, { key: 'Escape' });
    expect(onRangeChange).toHaveBeenLastCalledWith(null);

    fireEvent.pointerDown(canvas, { clientX: 148, clientY: 48, button: 0, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 448, clientY: 48, button: 0, pointerId: 2 });
    fireEvent.contextMenu(canvas);
    expect(onRangeChange).toHaveBeenLastCalledWith(null);

    fireEvent.pointerDown(canvas, { clientX: 348, clientY: 48, button: 0, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 648, clientY: 48, button: 0, pointerId: 3 });
    fireEvent.click(screen.getByRole('button', { name: '清除范围' }));
    expect(onRangeChange).toHaveBeenLastCalledWith(null);
  });

  it('初始 range 为空时可只用可见按钮和键盘创建、调整并清除范围', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '创建范围' }));
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: 0.25, end: 0.75 });
    const startHandle = screen.getByRole('slider', { name: '范围起点' });
    const endHandle = screen.getByRole('slider', { name: '范围终点' });
    expect(startHandle).toHaveFocus();

    fireEvent.keyDown(startHandle, { key: 'ArrowRight' });
    fireEvent.keyDown(endHandle, { key: 'ArrowLeft' });
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: 0.26, end: 0.74 });

    fireEvent.keyDown(endHandle, { key: 'Escape' });
    expect(onRangeChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: '创建范围' })).toBeInTheDocument();
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
    mockOverviewRect(canvas);
    fireEvent.keyDown(canvas, { key: 'End' });
    fireEvent.pointerDown(canvas, { clientX: 148, clientY: 48, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 348, clientY: 48, button: 0, pointerId: 1 });

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
    expect(view.container.querySelectorAll('*').length).toBeLessThan(480);
  });

  it('长轨迹只挂载有界采样记录，键盘尾部活动项仍对应可见 DOM 区段', () => {
    const segments = Array.from({ length: 1_000 }, (_, index) => ({
      key: `segment-${index}`,
      runId: 'run-a',
      track: index % 2 === 0 ? 'model' as const : 'tools' as const,
      start: index / 1_000,
      end: (index + 1) / 1_000,
      targetCellKey: `cell-${index}`,
      label: `记录 ${index}`,
      status: 'success',
      startedAt: null,
      endedAt: null,
      startSequence: index,
      endSequence: index,
      spanIdentity: null,
    }));
    render(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={[]}
        cells={[runCell('run-a', true)]}
        projection={{
          mode: 'sequence',
          runBands: [{
            runId: 'run-a',
            start: 0,
            end: 1,
            hydrated: true,
            selected: true,
            status: 'completed',
          }],
          segments,
        }}
      />,
    );

    const overview = screen.getByRole('application', { name: /轨迹记录总览/ });
    mockOverviewRect(overview);
    fireEvent.keyDown(overview, { key: 'End' });
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('记录 999');
    const renderedSegments = screen.getAllByTestId('trajectory-overview-segment');
    expect(renderedSegments.length).toBeLessThanOrEqual(400);
    expect(renderedSegments.some(segment => segment.title.includes('记录 999'))).toBe(true);
  });

  it('zoom 后可用可见按钮与键盘平移，边界夹紧且活动项和范围保持', () => {
    const view = render(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={fixtureEvents()}
        cells={[runCell('run-a', true)]}
        selectedCellKey="run:run-a"
      />,
    );
    const canvas = screen.getByRole('application', { name: /轨迹记录总览/ });
    fireEvent.keyDown(canvas, { key: 'End' });
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    fireEvent.click(screen.getByRole('button', { name: '创建范围' }));
    const rangeStart = screen.getByRole('slider', { name: '范围起点' });
    const rangeEnd = screen.getByRole('slider', { name: '范围终点' });
    const left = screen.getByRole('button', { name: '向左平移' });
    const right = screen.getByRole('button', { name: '向右平移' });

    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'ArrowRight', shiftKey: true });
    expect(right).toBeDisabled();
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Tools');
    expect(rangeStart).toHaveValue('475');
    expect(rangeEnd).toHaveValue('725');

    fireEvent.keyDown(canvas, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(canvas, { key: 'ArrowLeft', shiftKey: true });
    expect(left).toBeDisabled();
    fireEvent.click(right);
    expect(left).toBeEnabled();
    expect(right).toBeEnabled();
    expect(screen.getByText('2×')).toBeInTheDocument();
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Tools');
    expect(rangeStart).toHaveValue('475');
    expect(rangeEnd).toHaveValue('725');

    view.rerender(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={[
          ...fixtureEvents(),
          event(5, 'run_progress_updated'),
        ]}
        cells={[runCell('run-a', true)]}
        selectedCellKey="run:run-a"
      />,
    );
    expect(left).toBeEnabled();
    expect(right).toBeEnabled();
    expect(screen.getByText('2×')).toBeInTheDocument();
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Tools');
    expect(rangeStart).toHaveValue('475');
    expect(rangeEnd).toHaveValue('725');
  });

  it('受控 mode 与 projection 由父层统一驱动，不在组件内镜像派生状态', () => {
    const onModeChange = vi.fn();
    render(
      <TrajectoryOverview
        runs={[run('run-a')]}
        focusedRunId="run-a"
        focusedRunEvents={fixtureEvents()}
        cells={[runCell('run-a', true)]}
        mode="actual"
        projection={{
          mode: 'actual',
          runBands: [{
            runId: 'run-a',
            start: 0,
            end: 1,
            hydrated: true,
            selected: true,
            status: 'completed',
          }],
          segments: [],
        }}
        onModeChange={onModeChange}
      />,
    );

    expect(screen.getByRole('button', { name: '实际耗时' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('trajectory-overview-active'))
      .toHaveTextContent('当前没有可见详细记录');
    fireEvent.click(screen.getByRole('button', { name: '顺序' }));
    expect(onModeChange).toHaveBeenCalledWith('sequence');
    expect(screen.getByRole('button', { name: '实际耗时' }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});
