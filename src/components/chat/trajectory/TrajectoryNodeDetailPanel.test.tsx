import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import type { TrajectoryNodeDetailResponse } from '@/types/trajectory';

const getTrajectoryToolNodeDetailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryToolNodeDetail: getTrajectoryToolNodeDetailMock,
}));

import { TrajectoryNodeDetailPanel } from './TrajectoryNodeDetailPanel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function toolCell(toolCallId = 'tool-1'): Extract<TrajectoryCell, { type: 'tool' }> {
  return {
    key: `run:run-1:tool:${toolCallId}`,
    type: 'tool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [3, 4],
    toolCallId,
    stepId: 'step-1',
    toolName: 'web_search',
    status: 'success',
    events: [],
  };
}

function attemptCell(): Extract<TrajectoryCell, { type: 'subtool' }> {
  return {
    key: 'run:run-1:subtool:attempt-1',
    type: 'subtool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [5],
    toolCallId: 'tool-1',
    toolAttemptId: 'attempt-1',
    toolName: 'web_search',
    attemptIndex: 0,
    status: 'success',
    events: [],
  };
}

function detail(
  status: TrajectoryNodeDetailResponse['status'],
  overrides: Partial<TrajectoryNodeDetailResponse> = {},
): TrajectoryNodeDetailResponse {
  return {
    status,
    node_type: 'tool',
    available_sections: status === 'available'
      ? ['summary', 'payload', 'result', 'timing']
      : ['summary', 'timing'],
    detail: status === 'available'
      ? {
        tool_call_id: 'tool-1',
        tool_name: 'web_search',
        status: 'completed',
        duration_ms: 80,
        payload: { queryText: '上海天气' },
        result: { temperatureC: 28 },
        error: null,
      }
      : null,
    redacted_fields: [],
    reason: status === 'available' ? null : `detail ${status}`,
    ...overrides,
  };
}

function renderPanel(cell: TrajectoryCell | null = toolCell()) {
  return render(
    <TrajectoryNodeDetailPanel conversationId="conversation-1" cell={cell} span={null} />,
  );
}

describe('TrajectoryNodeDetailPanel', () => {
  beforeEach(() => {
    getTrajectoryToolNodeDetailMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('初始 Tool 与非 Tool 都只显示本地 Summary，点击 Payload 后才请求且 Result 复用响应', async () => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('available'));
    const { rerender } = renderPanel();

    const panel = screen.getByRole('complementary', { name: '轨迹节点详情' });
    expect(within(panel).getByRole('tabpanel', { name: '摘要' })).toHaveTextContent('工具调用');
    expect(getTrajectoryToolNodeDetailMock).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole('tab', { name: '载荷' }));
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1));
    expect(await within(panel).findByText(/"queryText": "上海天气"/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('tab', { name: '结果' }));
    expect(await within(panel).findByText(/"temperatureC": 28/)).toBeInTheDocument();
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);

    rerender(
      <TrajectoryNodeDetailPanel conversationId="conversation-1" cell={attemptCell()} span={null} />,
    );
    expect(within(panel).queryByRole('tab', { name: '载荷' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('tab', { name: '摘要' })).toHaveAttribute('aria-selected', 'true');
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);
  });

  it('切换 Tool 会 abort 旧请求、隔离迟到结果，并让新节点重新从零请求开始', async () => {
    const requestA = deferred<TrajectoryNodeDetailResponse>();
    const requestB = deferred<TrajectoryNodeDetailResponse>();
    let signalA: AbortSignal | undefined;
    getTrajectoryToolNodeDetailMock
      .mockImplementationOnce((_: string, __: string, ___: string, signal: AbortSignal) => {
        signalA = signal;
        return requestA.promise;
      })
      .mockReturnValueOnce(requestB.promise);
    const { rerender } = renderPanel(toolCell('tool-a'));

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1));
    rerender(
      <TrajectoryNodeDetailPanel
        conversationId="conversation-1"
        cell={toolCell('tool-b')}
        span={null}
      />,
    );

    expect(signalA?.aborted).toBe(true);
    expect(screen.getByRole('tab', { name: '摘要' })).toHaveAttribute('aria-selected', 'true');
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      requestA.resolve(detail('available', {
        detail: { ...detail('available').detail!, payload: { latePayload: 'A' } },
      }));
      await requestA.promise;
    });
    expect(screen.queryByText(/latePayload/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      requestB.resolve(detail('available', {
        detail: { ...detail('available').detail!, payload: { currentPayload: 'B' } },
      }));
      await requestB.promise;
    });
    expect(await screen.findByText(/"currentPayload": "B"/)).toBeInTheDocument();
  });

  it('available 独立校验 section 与实体字段，并展示脱敏字段名', async () => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('available', {
      available_sections: ['summary', 'payload', 'timing'],
      detail: { ...detail('available').detail!, result: { shouldNotRender: true } },
      redacted_fields: ['payload.apiKey', 'result.accessToken'],
    }));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    expect(await screen.findByText(/"queryText": "上海天气"/)).toBeInTheDocument();
    expect(screen.getByText('部分字段已脱敏')).toBeInTheDocument();
    expect(screen.getByText('payload.apiKey')).toBeInTheDocument();
    expect(screen.getByText('result.accessToken')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '结果' }));
    expect(screen.getByText('该部分未提供')).toBeInTheDocument();
    expect(screen.queryByText(/shouldNotRender/)).not.toBeInTheDocument();
  });

  it.each([
    ['not_recorded', '该运行生成时尚未记录 Payload/Result'],
    ['degraded', '运行已结束，但工具详情未能精确关联'],
  ] as const)('%s 与本地 Summary 保持独立并显示确定性文案', async (status, message) => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail(status));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '结果' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '摘要' }));
    expect(screen.getByRole('tabpanel', { name: '摘要' })).toHaveTextContent('工具调用');
    expect(screen.queryByText('轨迹降级')).not.toBeInTheDocument();
  });

  it('网络失败不冒充 degraded，并提供键盘可用的手动重试', async () => {
    getTrajectoryToolNodeDetailMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(detail('available'));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('加载工具详情失败，请稍后重试');
    expect(screen.queryByText(/精确关联/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText(/"queryText": "上海天气"/)).toBeInTheDocument();
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(2);
  });

  it('pending 每秒自动重试且同时受 7 次请求上限约束，手动检查开启新窗口', async () => {
    vi.useFakeTimers();
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('pending'));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await act(async () => Promise.resolve());
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 6; index += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(7);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(7);
    expect(screen.getByRole('status')).toHaveTextContent('详情仍在落账');
    expect(screen.getByText('自动检查已停止')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新检查' }));
    await act(async () => Promise.resolve());
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(8);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(9);
  });

  it('pending 首次响应接近 monotonic deadline 时不再越界发起自动请求', async () => {
    vi.useFakeTimers();
    const firstRequest = deferred<TrajectoryNodeDetailResponse>();
    getTrajectoryToolNodeDetailMock.mockReturnValue(firstRequest.promise);
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(6_500));
    await act(async () => {
      firstRequest.resolve(detail('pending'));
      await firstRequest.promise;
    });

    expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByText('自动检查已停止')).toBeInTheDocument();
  });

  it('切换到本地页签与卸载都会清理 pending timer', async () => {
    vi.useFakeTimers();
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('pending'));
    const { unmount } = renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '结果' }));
    await act(async () => Promise.resolve());
    expect(vi.getTimerCount()).toBe(1);

    fireEvent.click(screen.getByRole('tab', { name: '计时' }));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tabs 支持 Arrow/Home/End，诊断信息默认折叠且默认区域不裸露内部 ID', () => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('available'));
    renderPanel();
    const panel = screen.getByRole('complementary', { name: '轨迹节点详情' });
    const summaryTab = within(panel).getByRole('tab', { name: '摘要' });

    expect(within(panel).getByRole('group', { name: '诊断信息' })).not.toHaveAttribute('open');
    expect(within(panel).getByText('run-1')).not.toBeVisible();
    expect(within(panel).getByText('tool-1')).not.toBeVisible();
    expect(within(panel).getByText('step-1')).not.toBeVisible();

    summaryTab.focus();
    fireEvent.keyDown(summaryTab, { key: 'End' });
    expect(within(panel).getByRole('tab', { name: '计时' })).toHaveFocus();
    expect(within(panel).getByRole('tab', { name: '计时' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(within(panel).getByRole('tab', { name: '计时' }), { key: 'Home' });
    expect(summaryTab).toHaveFocus();
    fireEvent.keyDown(summaryTab, { key: 'ArrowRight' });
    expect(within(panel).getByRole('tab', { name: '载荷' })).toHaveFocus();
  });

  it('空选择显示稳定说明', () => {
    renderPanel(null);

    expect(screen.getByRole('complementary', { name: '轨迹节点详情' }))
      .toHaveTextContent('选择一条记录查看详情');
    expect(getTrajectoryToolNodeDetailMock).not.toHaveBeenCalled();
  });
});
