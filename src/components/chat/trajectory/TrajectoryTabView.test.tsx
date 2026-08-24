import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import trajectoryReducer, {
  mergeLiveTrajectoryEvent,
  requestTrajectoryInspect,
  setTrajectoryActiveSurface,
} from '@/redux/slices/trajectorySlice';
import { ApiError } from '@/types/api';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';

const { getTrajectoryRunsMock, getTrajectorySnapshotMock } = vi.hoisted(() => ({
  getTrajectoryRunsMock: vi.fn(),
  getTrajectorySnapshotMock: vi.fn(),
}));

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryRuns: getTrajectoryRunsMock,
  getTrajectorySnapshot: getTrajectorySnapshotMock,
}));

import TrajectoryTabView from './TrajectoryTabView';

function createStore() {
  return configureStore({ reducer: { trajectory: trajectoryReducer } });
}

function wrapper(store: ReturnType<typeof createStore>) {
  const TestProvider = Provider as unknown as React.ComponentType<{
    store: typeof store;
    children?: React.ReactNode;
  }>;
  return function StoreProvider({ children }: { children: React.ReactNode }) {
    return <TestProvider store={store}>{children}</TestProvider>;
  };
}

function runSummary(overrides: Partial<TrajectoryRunSummary> = {}): TrajectoryRunSummary {
  return {
    run_id: 'run-1',
    message_id: 'assistant-1',
    turn_message_id: 'user-1',
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 1,
    duration_ms: 180,
    started_at: '2026-08-22T00:00:00.000Z',
    ended_at: '2026-08-22T00:00:00.180Z',
    ...overrides,
  };
}

function snapshot(overrides: Partial<TrajectorySnapshot> = {}): TrajectorySnapshot {
  const run = overrides.run ?? runSummary();
  return {
    run,
    records: [
      {
        sequence: 0,
        event_type: 'run_started',
        schema_version: 1,
        timestamp: run.started_at,
        step_id: null,
        tool_call_id: null,
        parent_step_id: null,
        trace_id: run.run_id,
        span_id: null,
        payload: { conversation_id: 'chat-a', message_id: 'assistant-1' },
      },
      {
        sequence: 1,
        event_type: 'tool_call_started',
        schema_version: 1,
        timestamp: '2026-08-22T00:00:00.020Z',
        step_id: 'step-1',
        tool_call_id: 'tool-1',
        parent_step_id: null,
        trace_id: run.run_id,
        span_id: 'span-tool',
        payload: { tool_name: 'web_search' },
      },
      {
        sequence: 2,
        event_type: 'tool_call_completed',
        schema_version: 1,
        timestamp: '2026-08-22T00:00:00.120Z',
        step_id: 'step-1',
        tool_call_id: 'tool-1',
        parent_step_id: null,
        trace_id: run.run_id,
        span_id: 'span-tool',
        payload: { tool_name: 'web_search', status: 'success', duration_ms: 100 },
      },
    ],
    spans: [{
      span_id: 'span-tool',
      kind: 'tool',
      name: '联网搜索',
      parent_span_id: null,
      start_sequence: 1,
      end_sequence: 2,
      started_at: '2026-08-22T00:00:00.020Z',
      ended_at: '2026-08-22T00:00:00.120Z',
      duration_ms: 100,
      status: 'completed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [1, 2],
    }],
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: 3,
      expected_last_sequence: 2,
      loaded_event_count: 3,
      first_sequence: 0,
      last_sequence: 2,
    },
    truncated: false,
    ...overrides,
  };
}

function snapshotWithTools(count: number): TrajectorySnapshot {
  const run = runSummary({ total_tool_calls: count, total_steps: count });
  const records: TrajectorySnapshot['records'] = [snapshot().records[0]];
  const spans: TrajectorySnapshot['spans'] = [];
  for (let index = 0; index < count; index += 1) {
    const startSequence = index * 2 + 1;
    const endSequence = startSequence + 1;
    const startedAt = `2026-08-22T00:00:00.${String(index * 2 + 20).padStart(3, '0')}Z`;
    const endedAt = `2026-08-22T00:00:00.${String(index * 2 + 21).padStart(3, '0')}Z`;
    records.push({
      sequence: startSequence,
      event_type: 'tool_call_started',
      schema_version: 1,
      timestamp: startedAt,
      step_id: `step-${index}`,
      tool_call_id: `tool-${index}`,
      parent_step_id: null,
      trace_id: run.run_id,
      span_id: `span-tool-${index}`,
      payload: { tool_name: `tool_${index}` },
    }, {
      sequence: endSequence,
      event_type: 'tool_call_completed',
      schema_version: 1,
      timestamp: endedAt,
      step_id: `step-${index}`,
      tool_call_id: `tool-${index}`,
      parent_step_id: null,
      trace_id: run.run_id,
      span_id: `span-tool-${index}`,
      payload: { tool_name: `tool_${index}`, status: 'success', duration_ms: 1 },
    });
    spans.push({
      span_id: `span-tool-${index}`,
      kind: 'tool',
      name: `tool_${index}`,
      parent_span_id: null,
      start_sequence: startSequence,
      end_sequence: endSequence,
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: 1,
      status: 'completed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [startSequence, endSequence],
    });
  }
  return snapshot({
    run,
    records,
    spans,
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: records.length,
      expected_last_sequence: records.at(-1)?.sequence ?? 0,
      loaded_event_count: records.length,
      first_sequence: 0,
      last_sequence: records.at(-1)?.sequence ?? 0,
    },
  });
}

const messages: Message[] = [
  {
    id: 'user-1',
    role: 'user',
    content: [{ type: 'text', id: 'question-1', text: '查天气' }],
    timestamp: 1,
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: [{ type: 'text', id: 'answer-1', text: '天气晴朗' }],
    timestamp: 2,
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function installCanvasMocks() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 1000,
    bottom: 160,
    left: 0,
    width: 1000,
    height: 160,
    toJSON: () => ({}),
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{
        target,
        contentRect: { height: target instanceof HTMLCanvasElement ? 160 : 560 },
      } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

describe('TrajectoryTabView', () => {
  beforeEach(() => {
    installCanvasMocks();
    getTrajectoryRunsMock.mockReset();
    getTrajectorySnapshotMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('挂载即拉取 run list，并把加载态与空态明确标为有界视图', async () => {
    const store = createStore();
    const runsRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    getTrajectoryRunsMock.mockReturnValue(runsRequest.promise);

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    expect(screen.getByRole('heading', { name: '会话轨迹（有界）' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载轨迹运行');
    expect(getTrajectorySnapshotMock).not.toHaveBeenCalled();

    await act(async () => {
      runsRequest.resolve({ items: [], truncated: false });
      await runsRequest.promise;
    });

    expect(await screen.findByText('当前会话暂无轨迹运行')).toBeInTheDocument();
  });

  it('run list 失败和不可用状态都提供真实且不同的结果', async () => {
    getTrajectoryRunsMock.mockRejectedValueOnce(new Error('轨迹服务暂时不可用'));
    const failedStore = createStore();
    const failedView = render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(failedStore) },
    );

    expect(await screen.findByText('轨迹服务暂时不可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试加载轨迹' })).toBeInTheDocument();
    failedView.unmount();

    getTrajectoryRunsMock.mockRejectedValueOnce(
      new ApiError('NOT_FOUND', '会话或轨迹不存在，或无权访问', 'request-404'),
    );
    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(createStore()) },
    );

    expect(await screen.findByText('当前会话没有可用轨迹')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试加载轨迹' })).toBeNull();
  });

  it('已有 runs 后刷新失败保留旧列表，同时展示 stale alert 并可重试刷新', async () => {
    const store = createStore();
    const runA = runSummary({ run_id: 'run-a', attempt_index: 0 });
    const runB = runSummary({
      run_id: 'run-b',
      attempt_index: 1,
      started_at: '2026-08-22T00:00:01.000Z',
      ended_at: '2026-08-22T00:00:01.180Z',
    });
    getTrajectoryRunsMock
      .mockResolvedValueOnce({ items: [runA], truncated: false })
      .mockRejectedValueOnce(new Error('轨迹服务暂时不可用'))
      .mockResolvedValueOnce({ items: [runA, runB], truncated: false });

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    expect(await screen.findByRole('option', { name: /第 1 次执行/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新轨迹运行' }));

    const staleAlert = await screen.findByRole('alert');
    expect(staleAlert).toHaveTextContent('轨迹列表刷新失败');
    expect(staleAlert).toHaveTextContent('轨迹服务暂时不可用');
    expect(staleAlert).toHaveTextContent('当前数据可能不是最新');
    expect(screen.getByRole('option', { name: /第 1 次执行/ })).toBeInTheDocument();

    fireEvent.click(within(staleAlert).getByRole('button', { name: '重试刷新' }));

    expect(await screen.findByRole('option', { name: /第 2 次执行/ })).toBeInTheDocument();
    expect(screen.queryByText('当前数据可能不是最新')).toBeNull();
  });

  it('把同一份 Network 投影接入顶部 Overview、主区 Table 与右侧 Detail，不再渲染旧视图', async () => {
    const store = createStore();
    store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'trajectory' }));
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: true });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot({
      truncated: true,
      completeness: {
        ...snapshot().completeness,
        status: 'degraded',
        degraded_reason: 'bounded',
      },
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    const overview = await screen.findByLabelText('轨迹记录总览');
    const table = screen.getByRole('listbox', { name: '轨迹记录表' });
    const detail = screen.getByLabelText('轨迹节点详情');
    expect(overview).toHaveClass('w-full');
    expect(overview.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('option', { name: /第 1 次执行.*已完成.*轨迹已截断/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('轨迹时间线')).toBeNull();
    expect(screen.queryByLabelText('轨迹检查器')).toBeNull();
    expect(screen.getByText('当前仅展示有界轨迹，部分记录已截断')).toBeInTheDocument();
    expect(screen.getByText('部分轨迹记录不可用，以下内容可能不完整')).toBeInTheDocument();
  });

  it('Table 选择会同步 Overview 活动记录与 Detail，Overview 选择也会反向定位 Table', async () => {
    const store = createStore();
    store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'trajectory' }));
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot());

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    const tool = await screen.findByRole('option', { name: /搜索.*工具调用.*完成/ });
    fireEvent.click(tool);
    expect(screen.getByTestId('trajectory-overview-active')).toHaveTextContent('Tools');
    const detail = screen.getByLabelText('轨迹节点详情');
    expect(within(detail).getByRole('heading', { name: '工具' })).toBeInTheDocument();
    expect(within(detail).getByText('span-tool')).toBeInTheDocument();

    const canvas = screen.getByRole('application', { name: /轨迹记录总览/ });
    fireEvent.keyDown(canvas, { key: 'Home' });
    fireEvent.keyDown(canvas, { key: 'End' });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    await waitFor(() => expect(tool).toHaveFocus());
    expect(tool).toHaveAttribute('aria-selected', 'true');
  });

  it('one-shot inspect 会先清除遮蔽目标的搜索，再定位并只消费一次', async () => {
    const store = createStore();
    store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'trajectory' }));
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot());

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    const search = await screen.findByRole('searchbox', { name: '搜索轨迹记录' });
    fireEvent.change(search, { target: { value: '不存在的记录' } });
    expect(screen.queryByRole('option', { name: /搜索.*工具调用.*完成/ })).toBeNull();

    act(() => {
      store.dispatch(requestTrajectoryInspect({
        conversationId: 'chat-a',
        requestId: 'inspect-filtered-tool',
        messageId: 'assistant-1',
        runId: 'run-1',
        spanId: 'span-tool',
      }));
    });

    expect(search).toHaveValue('');
    const tool = await screen.findByRole('option', { name: /搜索.*工具调用.*完成/ });
    await waitFor(() => expect(tool).toHaveFocus());
    await waitFor(() => {
      expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();
    });
    expect(tool).toHaveAttribute('data-highlighted', 'true');
  });

  it('follow-live 首载到尾，用户滚动控制 manual/恢复，live append 不抢当前详情', async () => {
    const store = createStore();
    store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'trajectory' }));
    const manyTools = snapshotWithTools(20);
    getTrajectoryRunsMock.mockResolvedValue({ items: [manyTools.run], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(manyTools);

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    const table = await screen.findByRole('listbox', { name: '轨迹记录表' });
    await waitFor(() => expect(table.scrollTop).toBeGreaterThan(0));

    table.scrollTop = 0;
    fireEvent.scroll(table);
    await waitFor(() => expect(screen.getByRole('button', { name: '继续跟随' })).toBeInTheDocument());
    const firstTool = await screen.findByRole('option', { name: /tool_0.*工具调用.*完成/ });
    fireEvent.click(firstTool);
    expect(within(screen.getByLabelText('轨迹节点详情')).getByText('span-tool-0'))
      .toBeInTheDocument();

    table.scrollTop = 10_000;
    fireEvent.scroll(table);
    await waitFor(() => expect(screen.queryByRole('button', { name: '继续跟随' })).toBeNull());

    act(() => {
      store.dispatch(mergeLiveTrajectoryEvent({
        conversationId: 'chat-a',
        event: {
          runId: 'run-1',
          sequence: 41,
          eventType: 'tool_call_started',
          schemaVersion: 1,
          timestamp: '2026-08-22T00:00:00.900Z',
          stepId: 'step-live',
          toolCallId: 'tool-live',
          parentStepId: null,
          traceId: 'run-1',
          payload: { tool_name: 'live_tool' },
        },
      }));
    });

    await waitFor(() => expect(table.scrollTop).toBeGreaterThan(700));
    expect(within(screen.getByLabelText('轨迹节点详情')).getByText('span-tool-0'))
      .toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: '搜索轨迹记录' });
    fireEvent.change(search, { target: { value: 'live_tool' } });
    const resume = await screen.findByRole('button', { name: '继续跟随' });
    expect(resume).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }));
    expect(resume).toBeEnabled();
    fireEvent.click(resume);
    await waitFor(() => expect(screen.queryByRole('button', { name: '继续跟随' })).toBeNull());
  });

  it('force-mounted hidden 往返保持 mode/range/search/selection/scroll，隐藏期间不投影新行', async () => {
    const store = createStore();
    store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'trajectory' }));
    const manyTools = snapshotWithTools(20);
    getTrajectoryRunsMock.mockResolvedValue({ items: [manyTools.run], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(manyTools);
    const view = render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} visible />,
      { wrapper: wrapper(store) },
    );

    const table = await screen.findByRole('listbox', { name: '轨迹记录表' });
    fireEvent.click(screen.getByRole('button', { name: '实际耗时' }));
    fireEvent.click(screen.getByRole('button', { name: '创建范围' }));
    const search = screen.getByRole('searchbox', { name: '搜索轨迹记录' });
    fireEvent.change(search, { target: { value: 'tool' } });
    const selectedTool = (await screen.findAllByRole('option', { name: /tool_\d+.*工具调用.*完成/ }))[0];
    fireEvent.click(selectedTool);
    const selectedSpanId = within(screen.getByLabelText('轨迹节点详情'))
      .getByText(/^span-tool-\d+$/).textContent;
    if (!selectedSpanId) throw new Error('测试必须选择带 span 的工具记录');
    table.scrollTop = 56;
    fireEvent.scroll(table);
    const retainedRows = [...table.querySelectorAll('[role="option"]')]
      .map(row => row.getAttribute('data-trajectory-key'));

    act(() => {
      store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'chat' }));
    });
    view.rerender(<TrajectoryTabView conversationId="chat-a" messages={messages} visible={false} />);
    act(() => {
      store.dispatch(mergeLiveTrajectoryEvent({
        conversationId: 'chat-a',
        event: {
          runId: 'run-1',
          sequence: 41,
          eventType: 'tool_call_started',
          schemaVersion: 1,
          timestamp: '2026-08-22T00:00:00.900Z',
          stepId: 'step-hidden',
          toolCallId: 'tool-hidden',
          parentStepId: null,
          traceId: 'run-1',
          payload: { tool_name: 'hidden_tool' },
        },
      }));
    });

    expect(table.scrollTop).toBe(56);
    expect([...table.querySelectorAll('[role="option"]')]
      .map(row => row.getAttribute('data-trajectory-key'))).toEqual(retainedRows);
    expect(screen.getByRole('button', { name: '实际耗时' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: '范围起点' })).toBeInTheDocument();
    expect(search).toHaveValue('tool');
    expect(within(screen.getByLabelText('轨迹节点详情')).getByText(selectedSpanId))
      .toBeInTheDocument();

    act(() => {
      store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'trajectory' }));
    });
    view.rerender(<TrajectoryTabView conversationId="chat-a" messages={messages} visible />);
    expect(table.scrollTop).toBe(56);
    expect(screen.getByRole('button', { name: '实际耗时' })).toHaveAttribute('aria-pressed', 'true');
    expect(search).toHaveValue('tool');
    expect(within(screen.getByLabelText('轨迹节点详情')).getByText(selectedSpanId))
      .toBeInTheDocument();
  });

  it('InspectRequest 等待水合后定位目标、聚焦高亮并最后清除 request', async () => {
    const store = createStore();
    const snapshotRequest = deferred<TrajectorySnapshot>();
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockReturnValue(snapshotRequest.promise);
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-tool',
      messageId: 'assistant-1',
      runId: 'run-1',
      spanId: 'span-tool',
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalled());
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest?.requestId)
      .toBe('inspect-tool');

    await act(async () => {
      snapshotRequest.resolve(snapshot());
      await snapshotRequest.promise;
    });

    const target = await screen.findByRole('option', { name: /搜索.*工具调用.*完成/ });
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute('data-highlighted', 'true');
    await waitFor(() => {
      expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();
    });
  });

  it('消息级 inspect 也必须等待所选 run 水合后才定位和 consume', async () => {
    const store = createStore();
    const snapshotRequest = deferred<TrajectorySnapshot>();
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockReturnValue(snapshotRequest.promise);
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-message',
      messageId: 'assistant-1',
      runId: 'run-1',
      spanId: null,
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalled());
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest?.requestId)
      .toBe('inspect-message');
    expect(screen.queryByRole('option', { name: /第 1 次执行/ }))
      .not.toHaveAttribute('data-highlighted', 'true');

    await act(async () => {
      snapshotRequest.resolve(snapshot());
      await snapshotRequest.promise;
    });

    const runHeader = await screen.findByRole('option', { name: /第 1 次执行/ });
    await waitFor(() => expect(runHeader).toHaveFocus());
    expect(runHeader).toHaveAttribute('data-highlighted', 'true');
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();
  });

  it('inspect A 水合中手选 B 会取消旧请求，A/B 迟到快照都不再消费或抢回选择', async () => {
    const store = createStore();
    const runA = runSummary({ run_id: 'run-a', attempt_index: 0 });
    const runB = runSummary({
      run_id: 'run-b',
      attempt_index: 1,
      started_at: '2026-08-22T00:00:01.000Z',
      ended_at: '2026-08-22T00:00:01.180Z',
    });
    const snapshotA = deferred<TrajectorySnapshot>();
    const snapshotB = deferred<TrajectorySnapshot>();
    getTrajectoryRunsMock.mockResolvedValue({ items: [runA, runB], truncated: false });
    getTrajectorySnapshotMock.mockImplementation((_conversationId: string, runId: string) => (
      runId === 'run-a' ? snapshotA.promise : snapshotB.promise
    ));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-a-pending',
      messageId: 'assistant-1',
      runId: 'run-a',
      spanId: 'span-tool',
    }));
    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalledWith(
      'chat-a',
      'run-a',
      expect.any(AbortSignal),
    ));
    fireEvent.click(await screen.findByRole('option', { name: /第 2 次执行.*已完成/ }));

    expect(store.getState().trajectory.byConversationId['chat-a']).toMatchObject({
      selectedRunId: 'run-b',
      selectionSource: 'manual',
      inspectRequest: null,
    });
    await act(async () => {
      snapshotA.resolve(snapshot({ run: runA }));
      await snapshotA.promise;
    });
    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalledWith(
      'chat-a',
      'run-b',
      expect.any(AbortSignal),
    ));
    await act(async () => {
      snapshotB.resolve(snapshot({ run: runB }));
      await snapshotB.promise;
    });

    expect(store.getState().trajectory.byConversationId['chat-a']).toMatchObject({
      selectedRunId: 'run-b',
      selectionSource: 'manual',
      inspectRequest: null,
    });
    expect(screen.getByRole('option', { name: /第 2 次执行/ }))
      .toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /第 1 次执行/ }))
      .toHaveAttribute('data-highlighted', 'false');
  });

  it('新 inspect B 成功后清除 fallback A 的旧提示和高亮', async () => {
    const store = createStore();
    const runA = runSummary({ run_id: 'run-a', attempt_index: 0 });
    const runB = runSummary({
      run_id: 'run-b',
      attempt_index: 1,
      started_at: '2026-08-22T00:00:01.000Z',
      ended_at: '2026-08-22T00:00:01.180Z',
    });
    getTrajectoryRunsMock.mockResolvedValue({ items: [runA, runB], truncated: false });
    getTrajectorySnapshotMock.mockImplementation((_conversationId: string, runId: string) => (
      Promise.resolve(runId === 'run-a'
        ? snapshot({
          run: runA,
          spans: [],
          records: [snapshot().records[0]],
          truncated: true,
        })
        : snapshot({ run: runB }))
    ));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-a-fallback',
      messageId: 'assistant-1',
      runId: 'run-a',
      spanId: 'span-missing',
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    expect(await screen.findByText('该节点不在当前有界快照中')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /第 1 次执行/ }))
      .toHaveAttribute('data-highlighted', 'true');

    act(() => {
      store.dispatch(requestTrajectoryInspect({
        conversationId: 'chat-a',
        requestId: 'inspect-b-success',
        messageId: 'assistant-1',
        runId: 'run-b',
        spanId: 'span-tool',
      }));
    });

    const tool = await screen.findByRole('option', { name: /搜索.*工具调用.*完成/ });
    await waitFor(() => expect(tool).toHaveFocus());
    expect(tool).toHaveAttribute('data-highlighted', 'true');
    expect(screen.queryByText('该节点不在当前有界快照中')).toBeNull();
    expect(screen.getByRole('option', { name: /第 1 次执行/ }))
      .toHaveAttribute('data-highlighted', 'false');
  });

  it('InspectRequest 目标不在截断快照时回退 Run 头并提示，同时 reveal 只交付稳定 message id', async () => {
    const store = createStore();
    const onRevealInChat = vi.fn();
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot({
      spans: [],
      records: [snapshot().records[0]],
      truncated: true,
      completeness: {
        ...snapshot().completeness,
        loaded_event_count: 1,
        last_sequence: 0,
      },
    }));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-missing',
      messageId: 'assistant-1',
      runId: 'run-1',
      spanId: 'span-missing',
    }));

    render(
      <TrajectoryTabView
        conversationId="chat-a"
        messages={messages}
        onRevealInChat={onRevealInChat}
      />,
      { wrapper: wrapper(store) },
    );

    expect(await screen.findByText('该节点不在当前有界快照中')).toBeInTheDocument();
    const runHeader = screen.getByRole('option', { name: /第 1 次执行/ });
    await waitFor(() => expect(runHeader).toHaveFocus());
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '在聊天中查看' }));
    expect(onRevealInChat).toHaveBeenCalledWith('assistant-1');
  });
});
