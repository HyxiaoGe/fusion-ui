import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import { TrajectoryTable } from './TrajectoryTable';

function userCell(key: string, text: string): TrajectoryCell {
  return {
    key,
    type: 'user',
    runId: null,
    userMessageId: key,
    assistantMessageId: null,
    completenessSources: ['message'],
    sourceSequences: [],
    message: {
      id: key,
      role: 'user',
      content: [{ id: `${key}-text`, type: 'text', text }],
    },
  };
}

function messageCell(key: string, text: string): TrajectoryCell {
  return {
    key,
    type: 'message',
    runId: null,
    userMessageId: null,
    assistantMessageId: key,
    completenessSources: ['message'],
    sourceSequences: [],
    message: {
      id: key,
      role: 'assistant',
      content: [{ id: `${key}-text`, type: 'text', text }],
    },
  };
}

function runCell(key: string, userMessageId: string, isHydrated = true): TrajectoryCell {
  return {
    key,
    type: 'run',
    runId: key,
    userMessageId,
    assistantMessageId: `${key}-answer`,
    completenessSources: ['run-summary'],
    sourceSequences: [],
    summarySource: 'run-summary',
    attemptIndex: 0,
    runStatus: 'completed',
    totalSteps: 2,
    totalToolCalls: 1,
    startedAt: '2026-08-23T00:00:00.000Z',
    endedAt: '2026-08-23T00:00:01.250Z',
    isSelected: false,
    isHydrated,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'run-summary', reason: null },
    records: [],
    spans: [],
    liveTail: [],
  };
}

function toolCell(key: string): Extract<TrajectoryCell, { type: 'tool' }> {
  return {
    key,
    type: 'tool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'run-1-answer',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [8, 9],
    toolCallId: key,
    stepId: 'step-1',
    toolName: 'web_search',
    status: 'success',
    events: [],
  };
}

function attemptCell(
  key: string,
  toolCallId: string,
  status = 'success',
): Extract<TrajectoryCell, { type: 'subtool' }> {
  return {
    key,
    type: 'subtool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'run-1-answer',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [10],
    toolCallId,
    toolAttemptId: key,
    toolName: 'web_search',
    attemptIndex: 0,
    status,
    events: [],
  };
}

function manyCells(count: number): TrajectoryCell[] {
  return Array.from({ length: count }, (_, index) => (
    userCell(`cell-${index}`, `第 ${index + 1} 条消息`)
  ));
}

describe('TrajectoryTable', () => {
  it('以固定表头和高密度列展示稳定序号、Turn/Attempt、类型、摘要、状态与耗时', () => {
    render(
      <TrajectoryTable
        cells={[userCell('user-1', '查询北京天气'), runCell('run-1', 'user-1')]}
        selectedCellKey="run-1"
        viewportHeight={112}
      />,
    );

    const table = screen.getByRole('listbox', { name: '轨迹记录表' });
    for (const heading of ['#', 'Turn / Attempt', '类型', '名称 / 摘要', '状态', '耗时']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    const run = within(table).getByRole('option', {
      name: /#2.*第 1 轮.*第 1 次执行.*运行.*2 步.*已完成.*1.25 秒/,
    });
    expect(run).toHaveAttribute('aria-selected', 'true');
    expect(within(run).getByText('1.25 秒')).toHaveClass('tabular-nums');
  });

  it('搜索只挂载可见结果并高亮命中文字，同时用文字暴露匹配语义', () => {
    render(
      <TrajectoryTable
        cells={[
          userCell('user-1', '查询北京天气'),
          userCell('user-2', '查询上海天气'),
        ]}
        selectedCellKey={null}
        searchQuery="北京"
        viewportHeight={112}
      />,
    );

    const row = screen.getByRole('option', { name: /搜索命中.*北京/ });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(within(row).getByText('北京')).toHaveAttribute('data-trajectory-match', 'true');
    expect(within(row).getByText('匹配')).toBeInTheDocument();
  });

  it('单次成功 Attempt 折叠后把受控选择与 inspect 精确别名到所属 Tool 行', async () => {
    const target = { requestId: 'inspect-attempt', cellKey: 'attempt-1' };
    const onInspectTargetResolved = vi.fn();
    const onInspectTargetUnavailable = vi.fn();
    render(
      <TrajectoryTable
        cells={[toolCell('tool-1'), attemptCell('attempt-1', 'tool-1')]}
        selectedCellKey="attempt-1"
        inspectTarget={target}
        viewportHeight={112}
        onInspectTargetResolved={onInspectTargetResolved}
        onInspectTargetUnavailable={onInspectTargetUnavailable}
      />,
    );

    const tool = screen.getByRole('option', { name: /已折叠的 1 次成功尝试/ });
    expect(tool).toHaveAttribute('aria-selected', 'true');
    expect(tool).toHaveAttribute('data-highlighted', 'true');
    await waitFor(() => expect(tool).toHaveFocus());
    expect(onInspectTargetResolved).toHaveBeenCalledWith(
      target,
      0,
      expect.objectContaining({ key: 'tool-1', type: 'tool' }),
    );
    expect(onInspectTargetUnavailable).not.toHaveBeenCalled();
  });

  it('未水合 Run 在范围与搜索相交时展示占位和匹配待确认，而不是没有匹配', () => {
    render(
      <TrajectoryTable
        cells={[
          userCell('user-1', '查询天气'),
          runCell('run-1', 'user-1', false),
        ]}
        selectedCellKey={null}
        searchQuery="web_search"
        focusedCellKeys={new Set(['run-1'])}
        viewportHeight={112}
      />,
    );

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', {
      name: /运行.*轨迹详情待加载.*匹配待确认/,
    })).toBeInTheDocument();
    expect(screen.queryByText('没有匹配记录')).not.toBeInTheDocument();
  });

  it('原始类型、原始工具名与长正文尾部命中时都展示字段和高亮片段', () => {
    const longTail = '尾部唯一关键字';
    const { rerender } = render(
      <TrajectoryTable
        cells={[messageCell('message-1', '模型回答')]}
        selectedCellKey={null}
        searchQuery="message"
        viewportHeight={112}
      />,
    );
    expect(screen.getByText('message')).toHaveAttribute('data-trajectory-match', 'true');

    rerender(
      <TrajectoryTable
        cells={[toolCell('tool-1'), attemptCell('attempt-1', 'tool-1')]}
        selectedCellKey={null}
        searchQuery="web_search"
        viewportHeight={112}
      />,
    );
    expect(screen.getByText('web_search')).toHaveAttribute('data-trajectory-match', 'true');

    rerender(
      <TrajectoryTable
        cells={[messageCell('message-long', `${'内容'.repeat(100)}${longTail}`)]}
        selectedCellKey={null}
        searchQuery={longTail}
        viewportHeight={112}
      />,
    );
    const row = screen.getByRole('option', { name: /搜索命中/ });
    expect(within(row).getByText('命中正文：')).toBeInTheDocument();
    expect(within(row).getByText(longTail)).toHaveAttribute('data-trajectory-match', 'true');
  });

  it('inspect 回调同步在头部插入行后仍按稳定 key 聚焦原目标', async () => {
    const onInspectTargetResolved = vi.fn();

    function InspectHarness() {
      const [inserted, setInserted] = useState(false);
      return (
        <TrajectoryTable
          cells={inserted
            ? [userCell('inserted', '新插入'), userCell('before', '前一条'), userCell('target', '目标')]
            : [userCell('before', '前一条'), userCell('target', '目标')]}
          selectedCellKey={null}
          inspectTarget={{ requestId: 'inspect-stable-key', cellKey: 'target' }}
          viewportHeight={168}
          onInspectTargetResolved={(...args) => {
            onInspectTargetResolved(...args);
            setInserted(true);
          }}
        />
      );
    }

    render(<InspectHarness />);
    await waitFor(() => expect(onInspectTargetResolved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('option', { name: /目标/ })).toHaveFocus());
    expect(screen.getByRole('option', { name: /前一条/ })).not.toHaveFocus();
  });

  it('inspect 已定位后目标同步移除时不再发出矛盾的 unavailable', async () => {
    const onInspectTargetResolved = vi.fn();
    const onInspectTargetUnavailable = vi.fn();

    function RemovedTargetHarness() {
      const [removed, setRemoved] = useState(false);
      return (
        <TrajectoryTable
          cells={removed
            ? [userCell('before', '前一条'), userCell('replacement', '替代项')]
            : [userCell('before', '前一条'), userCell('target', '目标')]}
          selectedCellKey={null}
          inspectTarget={{ requestId: 'inspect-removed-key', cellKey: 'target' }}
          viewportHeight={112}
          onInspectTargetResolved={(...args) => {
            onInspectTargetResolved(...args);
            setRemoved(true);
          }}
          onInspectTargetUnavailable={onInspectTargetUnavailable}
        />
      );
    }

    render(<RemovedTargetHarness />);
    await waitFor(() => expect(onInspectTargetResolved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('option', { name: /目标/ })).not.toBeInTheDocument());
    expect(onInspectTargetUnavailable).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: /替代项/ })).not.toHaveFocus();
  });

  it('inspect 中 running Attempt 同步折叠后按原 cell key 重解 alias 并最终聚焦 Tool', async () => {
    const onInspectTargetResolved = vi.fn();
    const onInspectTargetUnavailable = vi.fn();

    function FoldingInspectHarness() {
      const [succeeded, setSucceeded] = useState(false);
      return (
        <TrajectoryTable
          cells={[
            toolCell('tool-1'),
            attemptCell('attempt-1', 'tool-1', succeeded ? 'success' : 'running'),
          ]}
          selectedCellKey={null}
          inspectTarget={{ requestId: 'inspect-folding-attempt', cellKey: 'attempt-1' }}
          viewportHeight={112}
          onInspectTargetResolved={(...args) => {
            onInspectTargetResolved(...args);
            setSucceeded(true);
          }}
          onInspectTargetUnavailable={onInspectTargetUnavailable}
        />
      );
    }

    render(<FoldingInspectHarness />);
    const tool = await screen.findByRole('option', { name: /已折叠的 1 次成功尝试/ });
    await waitFor(() => expect(tool).toHaveFocus());
    expect(onInspectTargetResolved).toHaveBeenCalledTimes(1);
    expect(onInspectTargetUnavailable).not.toHaveBeenCalled();
  });

  it('键盘选择回调同步在头部插入行后仍按稳定 key 聚焦目标', async () => {
    function KeyboardHarness() {
      const [inserted, setInserted] = useState(false);
      return (
        <TrajectoryTable
          cells={inserted
            ? [userCell('inserted', '新插入'), userCell('before', '前一条'), userCell('target', '目标')]
            : [userCell('before', '前一条'), userCell('target', '目标')]}
          selectedCellKey={null}
          viewportHeight={168}
          onSelectCell={() => setInserted(true)}
        />
      );
    }

    render(<KeyboardHarness />);
    const before = screen.getByRole('option', { name: /前一条/ });
    before.focus();
    fireEvent.keyDown(before, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('option', { name: /目标/ })).toHaveFocus());
    expect(screen.getByRole('option', { name: /前一条/ })).not.toHaveFocus();
  });

  it('键盘 End 目标 Attempt 同步折叠后按原 cell key 重解 alias 并聚焦 Tool', async () => {
    const onSelectCell = vi.fn();

    function FoldingKeyboardHarness() {
      const [succeeded, setSucceeded] = useState(false);
      return (
        <TrajectoryTable
          cells={[
            userCell('before', '前一条'),
            toolCell('tool-1'),
            attemptCell('attempt-1', 'tool-1', succeeded ? 'success' : 'running'),
          ]}
          selectedCellKey={null}
          viewportHeight={168}
          onSelectCell={(...args) => {
            onSelectCell(...args);
            setSucceeded(true);
          }}
        />
      );
    }

    render(<FoldingKeyboardHarness />);
    const before = screen.getByRole('option', { name: /前一条/ });
    before.focus();
    fireEvent.keyDown(before, { key: 'End' });

    const tool = await screen.findByRole('option', { name: /已折叠的 1 次成功尝试/ });
    await waitFor(() => expect(tool).toHaveFocus());
    expect(tool).toHaveAttribute('tabindex', '0');
    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'attempt-1', type: 'subtool' }),
      2,
    );
  });

  it('过滤后 ARIA 位置、Home/End、选择回调与 inspect index 均基于可见行', async () => {
    const cells = manyCells(100).map((cell, index) => {
      if (cell.type !== 'user') return cell;
      return {
        ...cell,
        message: {
          ...cell.message,
          content: [{
            id: `${cell.key}-text`,
            type: 'text' as const,
            text: [10, 50, 90].includes(index) ? `保留 ${index}` : `隐藏 ${index}`,
          }],
        },
      };
    });
    const onSelectCell = vi.fn();
    const onInspectTargetResolved = vi.fn();
    const { rerender } = render(
      <TrajectoryTable
        cells={cells}
        selectedCellKey={null}
        searchQuery="保留"
        viewportHeight={56}
        onSelectCell={onSelectCell}
      />,
    );

    const first = screen.getByRole('option', { name: /保留 10/ });
    expect(first).toHaveAttribute('aria-posinset', '1');
    expect(first).toHaveAttribute('aria-setsize', '3');
    fireEvent.keyDown(first, { key: 'End' });
    const last = await screen.findByRole('option', { name: /保留 90/ });
    await waitFor(() => expect(document.activeElement).toBe(last));
    expect(last).toHaveAttribute('aria-posinset', '3');
    expect(onSelectCell).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'cell-90' }),
      90,
    );

    rerender(
      <TrajectoryTable
        cells={cells}
        selectedCellKey={null}
        searchQuery="保留"
        inspectTarget={{ requestId: 'inspect-visible', cellKey: 'cell-50' }}
        viewportHeight={56}
        onSelectCell={onSelectCell}
        onInspectTargetResolved={onInspectTargetResolved}
      />,
    );
    expect(await screen.findByRole('option', { name: /保留 50/ })).toHaveFocus();
    expect(onInspectTargetResolved).toHaveBeenCalledWith(
      { requestId: 'inspect-visible', cellKey: 'cell-50' },
      1,
      expect.objectContaining({ key: 'cell-50' }),
    );
  });

  it('one-shot inspect 可依次定位 5000 条记录中的首、中、尾且真实行 DOM 不超过 200', async () => {
    const cells = manyCells(5000);
    const onInspectTargetResolved = vi.fn();
    const { rerender } = render(
      <TrajectoryTable
        cells={cells}
        selectedCellKey={null}
        inspectTarget={{ requestId: 'inspect-first', cellKey: 'cell-0' }}
        viewportHeight={1440}
        onInspectTargetResolved={onInspectTargetResolved}
      />,
    );
    expect(await screen.findByRole('option', { name: /第 1 条消息/ })).toHaveFocus();

    rerender(
      <TrajectoryTable
        cells={cells}
        selectedCellKey={null}
        inspectTarget={{ requestId: 'inspect-middle', cellKey: 'cell-2500' }}
        viewportHeight={1440}
        onInspectTargetResolved={onInspectTargetResolved}
      />,
    );
    expect(await screen.findByRole('option', { name: /第 2501 条消息/ })).toHaveFocus();

    rerender(
      <TrajectoryTable
        cells={cells}
        selectedCellKey={null}
        inspectTarget={{ requestId: 'inspect-tail', cellKey: 'cell-4999' }}
        viewportHeight={1440}
        onInspectTargetResolved={onInspectTargetResolved}
      />,
    );
    expect(await screen.findByRole('option', { name: /第 5000 条消息/ })).toHaveFocus();
    expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(200);
    expect(onInspectTargetResolved).toHaveBeenNthCalledWith(
      1,
      { requestId: 'inspect-first', cellKey: 'cell-0' },
      0,
      expect.objectContaining({ key: 'cell-0' }),
    );
    expect(onInspectTargetResolved).toHaveBeenNthCalledWith(
      2,
      { requestId: 'inspect-middle', cellKey: 'cell-2500' },
      2500,
      expect.objectContaining({ key: 'cell-2500' }),
    );
    expect(onInspectTargetResolved).toHaveBeenNthCalledWith(
      3,
      { requestId: 'inspect-tail', cellKey: 'cell-4999' },
      4999,
      expect.objectContaining({ key: 'cell-4999' }),
    );
  });

  it('restore 与 inspect 报告程序化滚动，真实滚动报告 userInitiated 与稳定 atTail', async () => {
    const cells = manyCells(100);
    const onViewportStateChange = vi.fn();
    const { rerender } = render(
      <TrajectoryTable
        cells={cells}
        selectedCellKey={null}
        initialScrollTop={5040}
        restoreKey="conversation-a"
        viewportHeight={112}
        onViewportStateChange={onViewportStateChange}
      />,
    );

    const table = screen.getByRole('listbox', { name: '轨迹记录表' });
    expect(table.scrollTop).toBe(5040);
    expect(onViewportStateChange).toHaveBeenCalledWith({
      scrollTop: 5040,
      atTail: false,
      userInitiated: false,
    });
    onViewportStateChange.mockClear();
    fireEvent.scroll(table);
    expect(onViewportStateChange).not.toHaveBeenCalled();

    rerender(
      <TrajectoryTable
        cells={cells}
        selectedCellKey={null}
        inspectTarget={{ requestId: 'inspect-programmatic', cellKey: 'cell-50' }}
        initialScrollTop={5040}
        restoreKey="conversation-a"
        viewportHeight={112}
        onViewportStateChange={onViewportStateChange}
      />,
    );
    await waitFor(() => expect(onViewportStateChange).toHaveBeenCalledWith(expect.objectContaining({
      userInitiated: false,
    })));

    onViewportStateChange.mockClear();
    table.scrollTop = 5482;
    fireEvent.scroll(table);
    expect(onViewportStateChange).toHaveBeenCalledWith({
      scrollTop: 5482,
      atTail: true,
      userInitiated: true,
    });
  });

  it('inspect target 被过滤隐藏时只明确通知 unavailable 一次', () => {
    const onInspectTargetResolved = vi.fn();
    const onInspectTargetUnavailable = vi.fn();
    const target = { requestId: 'inspect-hidden', cellKey: 'cell-70' };
    const { rerender } = render(
      <TrajectoryTable
        cells={manyCells(100)}
        selectedCellKey={null}
        searchQuery="第 1 条消息"
        inspectTarget={target}
        viewportHeight={112}
        onInspectTargetResolved={onInspectTargetResolved}
        onInspectTargetUnavailable={onInspectTargetUnavailable}
      />,
    );

    expect(onInspectTargetUnavailable).toHaveBeenCalledTimes(1);
    expect(onInspectTargetUnavailable).toHaveBeenCalledWith(target);
    expect(onInspectTargetResolved).not.toHaveBeenCalled();
    rerender(
      <TrajectoryTable
        cells={manyCells(100)}
        selectedCellKey={null}
        searchQuery="第 1 条消息"
        inspectTarget={target}
        viewportHeight={112}
        onInspectTargetResolved={onInspectTargetResolved}
        onInspectTargetUnavailable={onInspectTargetUnavailable}
      />,
    );
    expect(onInspectTargetUnavailable).toHaveBeenCalledTimes(1);
  });

  it('区分无轨迹与过滤后没有匹配记录', () => {
    const { rerender } = render(
      <TrajectoryTable cells={[]} selectedCellKey={null} viewportHeight={112} />,
    );
    expect(screen.getByText('当前会话暂无轨迹记录')).toBeInTheDocument();

    rerender(
      <TrajectoryTable
        cells={[userCell('user-1', '查询天气')]}
        selectedCellKey={null}
        searchQuery="不存在"
        viewportHeight={112}
      />,
    );
    expect(screen.getByText('没有匹配记录')).toBeInTheDocument();
  });

  it('首帧高度为零时等待 ResizeObserver 的正高度再恢复，且不误报用户滚动', () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(0);
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe() {}

      disconnect() {}
    });
    const onViewportStateChange = vi.fn();
    try {
      render(
        <TrajectoryTable
          cells={manyCells(100)}
          selectedCellKey={null}
          initialScrollTop={99_999}
          restoreKey="conversation-a"
          onViewportStateChange={onViewportStateChange}
        />,
      );

      const table = screen.getByRole('listbox', { name: '轨迹记录表' });
      expect(table.scrollTop).toBe(0);
      act(() => {
        resizeCallback?.([{
          contentRect: { height: 112 },
        } as ResizeObserverEntry], {} as ResizeObserver);
      });
      expect(table.scrollTop).toBe(5488);
      expect(onViewportStateChange).toHaveBeenLastCalledWith({
        scrollTop: 5488,
        atTail: true,
        userInitiated: false,
      });
      onViewportStateChange.mockClear();
      fireEvent.scroll(table);
      expect(onViewportStateChange).not.toHaveBeenCalled();
    } finally {
      clientHeight.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
