import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import { TrajectoryLedger } from './TrajectoryLedger';

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

function runCell(
  key: string,
  userMessageId: string,
  attemptIndex: number,
  status = 'completed',
): TrajectoryCell {
  return {
    key,
    type: 'run',
    runId: key,
    userMessageId,
    assistantMessageId: `${key}-answer`,
    completenessSources: ['run-summary'],
    sourceSequences: [],
    summarySource: 'run-summary',
    attemptIndex,
    runStatus: status,
    totalSteps: 2,
    totalToolCalls: 1,
    startedAt: '2026-08-23T00:00:00.000Z',
    endedAt: '2026-08-23T00:00:01.250Z',
    isSelected: false,
    isHydrated: true,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'run-summary', reason: null },
    records: [],
    spans: [],
    liveTail: [],
  };
}

function toolCell(key: string, userMessageId: string): TrajectoryCell {
  return {
    key,
    type: 'tool',
    runId: 'run-1',
    userMessageId,
    assistantMessageId: 'answer-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [8, 9],
    toolCallId: key,
    stepId: 'step-1',
    toolName: 'web_search',
    status: 'success',
    events: [{
      runId: 'run-1',
      sequence: 9,
      eventType: 'tool_call_completed',
      schemaVersion: 1,
      timestamp: '2026-08-23T00:00:00.500Z',
      stepId: 'step-1',
      toolCallId: key,
      parentStepId: null,
      traceId: 'trace-1',
      payload: {
        tool_name: 'web_search',
        status: 'success',
        duration_ms: 80,
        raw_arguments: { query: '不得显示的完整参数' },
      },
    }],
  };
}

function manyCells(count: number): TrajectoryCell[] {
  return Array.from({ length: count }, (_, index) => (
    userCell(`cell-${index}`, `第 ${index + 1} 条消息`)
  ));
}

describe('TrajectoryLedger', () => {
  it('按 turn/run 展示用户可读摘要，且不倾倒工具完整参数', () => {
    render(
      <TrajectoryLedger
        cells={[
          userCell('user-1', '查询北京天气'),
          runCell('run-1', 'user-1', 0),
          runCell('run-2', 'user-1', 1, 'failed'),
          toolCell('tool-1', 'user-1'),
          userCell('user-2', '继续规划行程'),
        ]}
        selectedCellKey="run-2"
        viewportHeight={560}
      />,
    );

    const ledger = screen.getByRole('listbox', { name: '轨迹账本' });
    expect(within(ledger).getByRole('option', {
      name: /第 1 轮.*用户提问.*查询北京天气/,
    })).toBeInTheDocument();
    expect(within(ledger).getByRole('option', {
      name: /第 1 轮.*第 1 次执行.*已完成/,
    })).toBeInTheDocument();
    expect(within(ledger).getByRole('option', {
      name: /第 1 轮.*第 2 次执行.*失败/,
    })).toHaveAttribute('aria-selected', 'true');
    expect(within(ledger).getByRole('option', {
      name: /搜索.*完成.*80 毫秒/,
    })).toBeInTheDocument();
    expect(screen.queryByText('不得显示的完整参数')).not.toBeInTheDocument();
  });

  it('run 主状态与轨迹完整性 badge 独立显示，未水合详情保留固定骨架空间', () => {
    const completeRun = runCell('run-complete', 'user-1', 0);
    const loadingRun = runCell('run-loading', 'user-1', 1);
    if (completeRun.type !== 'run' || loadingRun.type !== 'run') throw new Error('fixture 类型错误');
    completeRun.trajectoryBadge = {
      status: 'degraded',
      source: 'durable-snapshot',
      reason: '部分事件未持久化',
    };
    loadingRun.isHydrated = false;

    render(
      <TrajectoryLedger
        cells={[userCell('user-1', '查询天气'), completeRun, loadingRun]}
        selectedCellKey="run-complete"
        viewportHeight={560}
      />,
    );

    expect(screen.getByRole('option', {
      name: /第 1 次执行.*已完成.*轨迹降级/,
    })).toBeInTheDocument();
    expect(screen.getByText('轨迹降级')).toBeInTheDocument();
    expect(screen.getByRole('option', {
      name: /第 2 次执行.*轨迹详情待加载/,
    })).toBeInTheDocument();
    expect(screen.getByTestId('trajectory-cell-skeleton-run-loading')).toBeInTheDocument();
  });

  it('长消息只进入有界单行摘要，不把整段正文复制到账本 DOM', () => {
    const longText = `${'内容'.repeat(120)}不应进入摘要的尾部`;
    render(
      <TrajectoryLedger
        cells={[userCell('user-long', longText)]}
        selectedCellKey="user-long"
        viewportHeight={56}
      />,
    );

    const row = screen.getByRole('option');
    expect(row).not.toHaveAccessibleName(/不应进入摘要的尾部/);
    expect(row.getAttribute('aria-label')?.length).toBeLessThanOrEqual(180);
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
  });

  it('使用方向键、Home 与 End 在完整数据集定位，并为虚拟行提供集合位置', async () => {
    const onSelectCell = vi.fn();
    render(
      <TrajectoryLedger
        cells={manyCells(80)}
        selectedCellKey="cell-0"
        onSelectCell={onSelectCell}
        viewportHeight={112}
      />,
    );

    const first = screen.getByRole('option', { name: /第 1 轮.*第 1 条消息/ });
    expect(first).toHaveAttribute('aria-posinset', '1');
    expect(first).toHaveAttribute('aria-setsize', '80');

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-posinset', '2'));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
    const last = await screen.findByRole('option', { name: /第 80 轮.*第 80 条消息/ });
    await waitFor(() => expect(document.activeElement).toBe(last));
    expect(last).toHaveAttribute('aria-posinset', '80');
    expect(onSelectCell).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'cell-79' }), 79);

    fireEvent.keyDown(last, { key: 'Home' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-posinset', '1'));
  });

  it('inspect 先按 key 计算未挂载目标 index，再滚动、挂载并高亮该行', async () => {
    const onInspectTargetResolved = vi.fn();
    const { rerender } = render(
      <TrajectoryLedger
        cells={manyCells(100)}
        selectedCellKey="cell-0"
        inspectTarget={null}
        onInspectTargetResolved={onInspectTargetResolved}
        viewportHeight={112}
      />,
    );

    expect(screen.queryByRole('option', { name: /第 71 轮.*第 71 条消息/ })).not.toBeInTheDocument();

    rerender(
      <TrajectoryLedger
        cells={manyCells(100)}
        selectedCellKey="cell-0"
        inspectTarget={{ requestId: 'inspect-1', cellKey: 'cell-70' }}
        onInspectTargetResolved={onInspectTargetResolved}
        viewportHeight={112}
      />,
    );

    const target = await screen.findByRole('option', { name: /第 71 轮.*第 71 条消息/ });
    expect(target).toHaveAttribute('data-highlighted', 'true');
    expect(target).toHaveAttribute('aria-selected', 'false');
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(onInspectTargetResolved).toHaveBeenCalledWith(
      { requestId: 'inspect-1', cellKey: 'cell-70' },
      70,
      expect.objectContaining({ key: 'cell-70' }),
    );
  });

  it('虚拟滚动卸载再挂载后仍保持受控选中状态', async () => {
    const { rerender } = render(
      <TrajectoryLedger
        cells={manyCells(100)}
        selectedCellKey="cell-0"
        inspectTarget={{ requestId: 'inspect-away', cellKey: 'cell-90' }}
        viewportHeight={112}
      />,
    );
    expect(await screen.findByRole('option', { name: /第 91 轮.*第 91 条消息/ })).toBeInTheDocument();

    rerender(
      <TrajectoryLedger
        cells={manyCells(100)}
        selectedCellKey="cell-0"
        inspectTarget={{ requestId: 'inspect-back', cellKey: 'cell-0' }}
        viewportHeight={112}
      />,
    );

    expect(await screen.findByRole('option', { name: /第 1 轮.*第 1 条消息/ }))
      .toHaveAttribute('aria-selected', 'true');
  });

  it('首次布局把恢复位置同步到真实滚动容器，并挂载该位置附近的行', () => {
    const onScrollTopChange = vi.fn();
    render(
      <TrajectoryLedger
        cells={manyCells(100)}
        selectedCellKey={null}
        viewportHeight={112}
        initialScrollTop={5040}
        onScrollTopChange={onScrollTopChange}
      />,
    );

    const ledger = screen.getByRole('listbox', { name: '轨迹账本' });
    const options = within(ledger).getAllByRole('option');
    expect(ledger.scrollTop).toBe(5040);
    expect(options[0]).toHaveAttribute('aria-posinset', '79');
    expect(options.at(-1)).toHaveAttribute('aria-posinset', '100');
    expect(within(ledger).getByRole('option', {
      name: /第 91 轮.*第 91 条消息/,
    })).toBeInTheDocument();
    fireEvent.scroll(ledger);
    expect(onScrollTopChange).not.toHaveBeenCalled();

    ledger.scrollTop = 5096;
    fireEvent.scroll(ledger);
    expect(onScrollTopChange).toHaveBeenCalledWith(5096);
  });

  it('异步行数据到达后再恢复初始滚动位置', () => {
    const { rerender } = render(
      <TrajectoryLedger
        cells={[]}
        selectedCellKey={null}
        viewportHeight={112}
        initialScrollTop={5040}
      />,
    );

    rerender(
      <TrajectoryLedger
        cells={manyCells(100)}
        selectedCellKey={null}
        viewportHeight={112}
        initialScrollTop={5040}
      />,
    );

    const ledger = screen.getByRole('listbox', { name: '轨迹账本' });
    expect(ledger.scrollTop).toBe(5040);
    expect(within(ledger).getByRole('option', {
      name: /第 91 轮.*第 91 条消息/,
    })).toBeInTheDocument();
  });

  it('未显式传入视口高度时按真实 clientHeight 钳制恢复位置', () => {
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(112);
    try {
      render(
        <TrajectoryLedger
          cells={manyCells(100)}
          selectedCellKey={null}
          initialScrollTop={99_999}
        />,
      );

      const ledger = screen.getByRole('listbox', { name: '轨迹账本' });
      expect(ledger.scrollTop).toBe(5488);
      expect(within(ledger).getByRole('option', {
        name: /第 100 轮.*第 100 条消息/,
      })).toBeInTheDocument();
    } finally {
      clientHeight.mockRestore();
    }
  });

  it('外部受控选择远端未挂载行时滚动挂载，但不抢走时间线焦点', async () => {
    const cells = manyCells(100);
    const { rerender } = render(
      <div>
        <button type="button">时间线控制</button>
        <TrajectoryLedger
          cells={cells}
          selectedCellKey="cell-0"
          viewportHeight={112}
        />
      </div>,
    );
    const timelineControl = screen.getByRole('button', { name: '时间线控制' });
    timelineControl.focus();

    rerender(
      <div>
        <button type="button">时间线控制</button>
        <TrajectoryLedger
          cells={cells}
          selectedCellKey="cell-90"
          viewportHeight={112}
        />
      </div>,
    );

    const target = await screen.findByRole('option', {
      name: /第 91 轮.*第 91 条消息/,
    });
    const ledger = screen.getByRole('listbox', { name: '轨迹账本' });
    const tabStops = within(ledger).getAllByRole('option')
      .filter(option => option.tabIndex === 0);
    expect(target).toHaveAttribute('aria-selected', 'true');
    expect(tabStops).toEqual([target]);
    expect(ledger).toHaveAttribute('aria-activedescendant', target.id);
    expect(document.getElementById(ledger.getAttribute('aria-activedescendant') ?? ''))
      .toBe(target);
    expect(document.activeElement).toBe(timelineControl);
  });

  it('5000 条输入在任意滚动窗口中都不会挂载超过 200 个 option', async () => {
    render(
      <TrajectoryLedger
        cells={manyCells(5000)}
        selectedCellKey={null}
        inspectTarget={{ requestId: 'inspect-tail', cellKey: 'cell-4999' }}
        viewportHeight={1440}
      />,
    );

    expect(await screen.findByRole('option', { name: /第 5000 轮.*第 5000 条消息/ }))
      .toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(200);
  });
});
