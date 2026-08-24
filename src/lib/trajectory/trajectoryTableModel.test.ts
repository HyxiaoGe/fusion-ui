import { describe, expect, it } from 'vitest';

import type { TrajectoryCell } from './TrajectoryCellProjection';
import {
  projectTrajectoryTableRows,
  type TrajectoryTableRow,
} from './trajectoryTableModel';

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

function runCell(
  key: string,
  userMessageId: string | null,
  attemptIndex: number | null,
  overrides: Partial<Extract<TrajectoryCell, { type: 'run' }>> = {},
): Extract<TrajectoryCell, { type: 'run' }> {
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
    runStatus: 'completed',
    totalSteps: 2,
    totalToolCalls: 1,
    startedAt: '2026-08-23T00:00:00.000Z',
    endedAt: '2026-08-23T00:00:01.250Z',
    isSelected: false,
    isHydrated: true,
    association: userMessageId ? 'explicit' : 'unassociated',
    trajectoryBadge: { status: 'complete', source: 'run-summary', reason: null },
    records: [],
    spans: [],
    liveTail: [],
    ...overrides,
  };
}

function toolCell(
  key: string,
  runId = 'run-1',
  userMessageId: string | null = 'user-1',
): Extract<TrajectoryCell, { type: 'tool' }> {
  return {
    key,
    type: 'tool',
    runId,
    userMessageId,
    assistantMessageId: `${runId}-answer`,
    completenessSources: ['durable-snapshot'],
    sourceSequences: [8, 9],
    toolCallId: key,
    stepId: 'step-1',
    toolName: 'web_search',
    status: 'success',
    events: [{
      runId,
      sequence: 9,
      eventType: 'tool_call_completed',
      schemaVersion: 1,
      timestamp: '2026-08-23T00:00:00.500Z',
      stepId: 'step-1',
      toolCallId: key,
      parentStepId: null,
      traceId: 'trace-1',
      payload: { tool_name: 'web_search', status: 'success', duration_ms: 80 },
    }],
  };
}

function attemptCell(
  key: string,
  toolCallId: string | null,
  status: string,
  attemptIndex = 0,
): Extract<TrajectoryCell, { type: 'subtool' }> {
  return {
    key,
    type: 'subtool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'run-1-answer',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [10 + attemptIndex],
    toolCallId,
    toolAttemptId: key,
    toolName: 'web_search',
    attemptIndex,
    status,
    events: [],
  };
}

function rowShape(row: TrajectoryTableRow) {
  return {
    key: row.key,
    sourceIndex: row.sourceIndex,
    turnNumber: row.turnNumber,
    attemptNumber: row.attemptNumber,
    kindLabel: row.kindLabel,
    summary: row.summary,
    statusLabel: row.statusLabel,
    durationMs: row.durationMs,
    attemptCount: row.attemptCount,
  };
}

describe('trajectoryTableModel', () => {
  it('按原始顺序输出稳定序号、Turn/Attempt 与列数据，未关联运行不伪造 Turn', () => {
    const rows = projectTrajectoryTableRows({
      cells: [
        userCell('user-1', '查询北京天气'),
        runCell('run-1', 'user-1', 1),
        toolCell('tool-1'),
        messageCell('message-1', '北京今天晴朗'),
        runCell('run-orphan', null, 0),
      ],
    });

    expect(rows.map(rowShape)).toEqual([
      {
        key: 'user-1', sourceIndex: 0, turnNumber: 1, attemptNumber: null,
        kindLabel: '用户', summary: '查询北京天气', statusLabel: null,
        durationMs: null, attemptCount: 0,
      },
      {
        key: 'run-1', sourceIndex: 1, turnNumber: 1, attemptNumber: 2,
        kindLabel: '运行', summary: '2 步 · 1 次工具', statusLabel: '已完成',
        durationMs: 1250, attemptCount: 0,
      },
      {
        key: 'tool-1', sourceIndex: 2, turnNumber: 1, attemptNumber: null,
        kindLabel: '工具', summary: '搜索 · web_search · 工具调用', statusLabel: '完成',
        durationMs: 80, attemptCount: 0,
      },
      {
        key: 'message-1', sourceIndex: 3, turnNumber: 1, attemptNumber: null,
        kindLabel: '消息', summary: '北京今天晴朗', statusLabel: null,
        durationMs: null, attemptCount: 0,
      },
      {
        key: 'run-orphan', sourceIndex: 4, turnNumber: null, attemptNumber: 1,
        kindLabel: '运行', summary: '2 步 · 1 次工具', statusLabel: '已完成',
        durationMs: 1250, attemptCount: 0,
      },
    ]);
  });

  it('搜索忽略大小写与首尾空白，并覆盖类型、注册表工具名、状态及安全消息文本', () => {
    const cells = [
      userCell('user-1', 'Plan A Trip'),
      runCell('run-1', 'user-1', 0),
      toolCell('tool-1'),
      messageCell('message-1', 'Weather is clear'),
    ];

    expect(projectTrajectoryTableRows({ cells, searchQuery: '  PLAN  ' }).map(row => row.key))
      .toEqual(['user-1']);
    expect(projectTrajectoryTableRows({ cells, searchQuery: 'WEB_SEARCH' }).map(row => row.key))
      .toEqual(['tool-1']);
    expect(projectTrajectoryTableRows({ cells, searchQuery: '完成' }).map(row => row.key))
      .toEqual(['run-1', 'tool-1']);
    expect(projectTrajectoryTableRows({ cells, searchQuery: 'message' }).map(row => row.key))
      .toEqual(['message-1']);
    expect(projectTrajectoryTableRows({ cells, searchQuery: 'clear' }).map(row => row.key))
      .toEqual(['message-1']);
    expect(projectTrajectoryTableRows({ cells, searchQuery: '   ' }).map(row => row.key))
      .toEqual(cells.map(cell => cell.key));
  });

  it('范围只保留命中业务记录及所属 user/run 上下文，并与搜索取交集', () => {
    const cells = [
      userCell('user-1', '查询北京天气'),
      runCell('run-1', 'user-1', 0),
      toolCell('tool-1'),
      messageCell('message-1', '北京今天晴朗'),
      userCell('user-2', '查询上海天气'),
      runCell('run-2', 'user-2', 0),
      toolCell('tool-2', 'run-2', 'user-2'),
    ];

    const focused = projectTrajectoryTableRows({
      cells,
      focusedCellKeys: new Set(['tool-2']),
    });
    expect(focused.map(row => row.key)).toEqual(['user-2', 'run-2', 'tool-2']);
    expect(focused.map(row => row.matched)).toEqual([false, false, false]);

    expect(projectTrajectoryTableRows({
      cells,
      searchQuery: '搜索',
      focusedCellKeys: new Set(['tool-2']),
    }).map(row => row.key)).toEqual(['user-2', 'run-2', 'tool-2']);

    expect(projectTrajectoryTableRows({
      cells,
      searchQuery: '北京',
      focusedCellKeys: new Set(['tool-2']),
    })).toEqual([]);
  });

  it('未水合 Run 在范围与搜索相交时保留 user 与 Run 占位，并把细粒度匹配标为待确认', () => {
    const cells = [
      userCell('user-1', '查询天气'),
      runCell('run-1', 'user-1', 0, { isHydrated: false }),
      userCell('user-2', '继续'),
    ];

    const rows = projectTrajectoryTableRows({
      cells,
      searchQuery: 'web_search',
      focusedCellKeys: new Set(['run-1']),
    });

    expect(rows.map(row => row.key)).toEqual(['user-1', 'run-1']);
    expect(rows[1]).toMatchObject({
      summary: '轨迹详情待加载',
      matched: false,
      matchPending: true,
    });
  });

  it('单次成功 Attempt 默认折叠到 Tool 并标记一次尝试', () => {
    const rows = projectTrajectoryTableRows({
      cells: [
        userCell('user-1', '查询天气'),
        runCell('run-1', 'user-1', 0),
        toolCell('tool-1'),
        attemptCell('attempt-1', 'tool-1', 'success'),
      ],
    });

    expect(rows.map(row => row.key)).toEqual(['user-1', 'run-1', 'tool-1']);
    expect(rows[2]).toMatchObject({
      attemptCount: 1,
      aliasedCellKeys: ['attempt-1'],
    });
  });

  it('多次、失败或超时 Attempt 全部展开，无法精确归属的 Attempt 不误折叠', () => {
    const multi = projectTrajectoryTableRows({
      cells: [
        toolCell('tool-1'),
        attemptCell('attempt-1', 'tool-1', 'failed', 0),
        attemptCell('attempt-2', 'tool-1', 'success', 1),
      ],
    });
    expect(multi.map(row => row.key)).toEqual(['tool-1', 'attempt-1', 'attempt-2']);
    expect(multi[0].attemptCount).toBe(2);

    for (const status of ['failed', 'timeout', 'cancelled', 'interrupted', 'degraded']) {
      const rows = projectTrajectoryTableRows({
        cells: [toolCell('tool-1'), attemptCell(`attempt-${status}`, 'tool-1', status)],
      });
      expect(rows.map(row => row.key), status).toEqual(['tool-1', `attempt-${status}`]);
    }

    const orphan = projectTrajectoryTableRows({
      cells: [toolCell('tool-1'), attemptCell('attempt-orphan', null, 'success')],
    });
    expect(orphan.map(row => row.key)).toEqual(['tool-1', 'attempt-orphan']);
    expect(orphan[0].attemptCount).toBe(0);
  });

  it('5000 个 cell 的纯模型投影在预算内且不改变稳定顺序', () => {
    const cells = Array.from({ length: 5000 }, (_, index) => (
      userCell(`user-${index}`, `第 ${index + 1} 条消息`)
    ));
    const startedAt = performance.now();
    const rows = projectTrajectoryTableRows({ cells });
    const elapsed = performance.now() - startedAt;

    expect(rows).toHaveLength(5000);
    expect(rows[0]).toMatchObject({ key: 'user-0', sourceIndex: 0, turnNumber: 1 });
    expect(rows[2500]).toMatchObject({ key: 'user-2500', sourceIndex: 2500, turnNumber: 2501 });
    expect(rows[4999]).toMatchObject({ key: 'user-4999', sourceIndex: 4999, turnNumber: 5000 });
    expect(elapsed).toBeLessThanOrEqual(250);
  });
});
