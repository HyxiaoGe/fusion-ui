import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/conversation';
import type { TrajectorySnapshotCacheEntry } from '@/redux/slices/trajectorySlice';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import type { TrajectoryCell, TrajectoryRunJoin } from './TrajectoryCellProjection';
import {
  evaluateEventProjectionParity,
  evaluateLiveDurableReconciliation,
  evaluateMessageJoinInvariants,
  selectStrictParityCohort,
} from './trajectoryConsistency';

const timestamp = '2026-08-22T00:00:00.000Z';

function event(sequence: number, overrides: Partial<NormalizedTrajectoryEvent> = {}): NormalizedTrajectoryEvent {
  return {
    runId: 'run-a',
    sequence,
    eventType: 'run_progress_updated',
    schemaVersion: 1,
    timestamp,
    stepId: null,
    toolCallId: null,
    parentStepId: null,
    traceId: 'trace-a',
    payload: { completed_steps: sequence },
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<TrajectorySnapshotCacheEntry> = {},
): TrajectorySnapshotCacheEntry {
  return {
    run: {
      run_id: 'run-a',
      message_id: 'assistant-a',
      turn_message_id: 'user-a',
      attempt_index: 0,
      status: 'completed',
      trajectory_status: 'complete',
      total_steps: 1,
      total_tool_calls: 0,
      duration_ms: 100,
      started_at: timestamp,
      ended_at: timestamp,
    },
    spans: [],
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: 2,
      expected_last_sequence: 1,
      loaded_event_count: 2,
      first_sequence: 0,
      last_sequence: 1,
    },
    truncated: false,
    durableLastSequence: 1,
    events: [event(0), event(1)],
    ...overrides,
  };
}

function runCell(sourceSequences: number[]): TrajectoryCell {
  return {
    key: 'run:run-a',
    type: 'run',
    runId: 'run-a',
    userMessageId: 'user-a',
    assistantMessageId: 'assistant-a',
    completenessSources: ['run-summary', 'durable-snapshot'],
    sourceSequences,
    summarySource: 'run-summary',
    attemptIndex: 0,
    runStatus: 'completed',
    totalSteps: 1,
    totalToolCalls: 0,
    startedAt: timestamp,
    endedAt: timestamp,
    isSelected: true,
    isHydrated: true,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'durable-snapshot', reason: null },
    records: [event(0), event(1)],
    spans: [],
    liveTail: [],
  };
}

describe('trajectoryConsistency', () => {
  it('strict parity cohort 只接受 complete、非 truncated、当前 schema', () => {
    expect(selectStrictParityCohort(snapshot())).toEqual({
      eligible: true,
      exclusions: [],
    });
    expect(selectStrictParityCohort(snapshot({
      completeness: { ...snapshot().completeness, status: 'degraded' },
    }))).toEqual({
      eligible: false,
      exclusions: ['incomplete-trajectory'],
    });
    expect(selectStrictParityCohort(snapshot({ truncated: true }))).toEqual({
      eligible: false,
      exclusions: ['truncated'],
    });
    expect(selectStrictParityCohort(snapshot({
      events: [event(0, { schemaVersion: 0 })],
    }))).toEqual({
      eligible: false,
      exclusions: ['unsupported-schema'],
    });
  });

  it('event projection parity 对严格 cohort 报告缺失/越界 sequence，对排除 cohort 不静默冒充通过', () => {
    expect(evaluateEventProjectionParity({
      snapshot: snapshot(),
      cells: [runCell([0, 1])],
    })).toEqual({
      status: 'pass',
      cohort: { eligible: true, exclusions: [] },
      expectedSequences: [0, 1],
      projectedSequences: [0, 1],
      missingSequences: [],
      unexpectedSequences: [],
    });
    expect(evaluateEventProjectionParity({
      snapshot: snapshot(),
      cells: [runCell([0, 2])],
    })).toEqual({
      status: 'fail',
      cohort: { eligible: true, exclusions: [] },
      expectedSequences: [0, 1],
      projectedSequences: [0, 2],
      missingSequences: [1],
      unexpectedSequences: [2],
    });

    const excludedSnapshot = snapshot({ truncated: true });
    expect(evaluateEventProjectionParity({
      snapshot: excludedSnapshot,
      cells: [runCell([])],
    })).toEqual({
      status: 'excluded',
      cohort: { eligible: false, exclusions: ['truncated'] },
      expectedSequences: [0, 1],
      projectedSequences: [],
      missingSequences: [0, 1],
      unexpectedSequences: [],
    });
  });

  it('strict complete 快照以 expected_last_sequence 校验连续账本，不把快照自身缺口当成 parity', () => {
    const incompleteSnapshot = snapshot({
      completeness: {
        status: 'complete',
        degraded_reason: null,
        event_count: 3,
        expected_last_sequence: 2,
        loaded_event_count: 2,
        first_sequence: 0,
        last_sequence: 2,
      },
      durableLastSequence: 2,
      events: [event(0), event(2)],
    });

    expect(evaluateEventProjectionParity({
      snapshot: incompleteSnapshot,
      cells: [runCell([0, 2])],
    })).toEqual({
      status: 'fail',
      cohort: { eligible: true, exclusions: [] },
      expectedSequences: [0, 1, 2],
      projectedSequences: [0, 2],
      missingSequences: [1],
      unexpectedSequences: [],
    });
  });

  it('live 与 durable 对账保留 durable overlap、识别冲突并只把更大 sequence 算作 tail', () => {
    const durable = [event(0), event(1)];
    const matchingReplay = event(1);
    const conflict = event(0, { payload: { completed_steps: 99 } });
    const tail = event(2);

    expect(evaluateLiveDurableReconciliation({
      durableEvents: durable,
      liveEvents: [tail, matchingReplay, conflict],
    })).toEqual({
      status: 'conflict',
      durableLastSequence: 1,
      overlapSequences: [0, 1],
      conflictSequences: [0],
      liveTailSequences: [2],
    });
    expect(evaluateLiveDurableReconciliation({
      durableEvents: durable,
      liveEvents: [matchingReplay, tail],
    })).toEqual({
      status: 'reconciled',
      durableLastSequence: 1,
      overlapSequences: [1],
      conflictSequences: [],
      liveTailSequences: [2],
    });
  });

  it('message join invariants 接受显式 join、相邻 legacy 与显式 orphan，拒绝角色错误和非相邻回看', () => {
    const messages: Message[] = [
      { id: 'user-a', role: 'user', content: [] },
      { id: 'assistant-a', role: 'assistant', content: [] },
      { id: 'assistant-divider', role: 'assistant', content: [] },
      { id: 'assistant-b', role: 'assistant', content: [] },
    ];
    const valid: TrajectoryRunJoin[] = [
      {
        runId: 'run-a',
        userMessageId: 'user-a',
        assistantMessageId: 'assistant-a',
        strategy: 'explicit',
        bucket: 'conversation',
      },
      {
        runId: 'legacy-a',
        userMessageId: 'user-a',
        assistantMessageId: 'assistant-a',
        strategy: 'legacy-adjacent-user',
        bucket: 'conversation',
      },
      {
        runId: 'orphan-a',
        userMessageId: null,
        assistantMessageId: null,
        strategy: 'unassociated',
        bucket: 'unassociated',
      },
      {
        runId: 'legacy-orphan',
        userMessageId: null,
        assistantMessageId: 'assistant-b',
        strategy: 'unassociated',
        bucket: 'unassociated',
      },
    ];

    expect(evaluateMessageJoinInvariants({ messages, joins: valid })).toEqual({
      status: 'pass',
      issues: [],
    });

    expect(evaluateMessageJoinInvariants({
      messages,
      joins: [
        ...valid,
        {
          runId: 'bad-role',
          userMessageId: 'assistant-divider',
          assistantMessageId: 'assistant-b',
          strategy: 'explicit',
          bucket: 'conversation',
        },
        {
          runId: 'bad-legacy',
          userMessageId: 'user-a',
          assistantMessageId: 'assistant-b',
          strategy: 'legacy-adjacent-user',
          bucket: 'conversation',
        },
      ],
    })).toEqual({
      status: 'fail',
      issues: [
        { runId: 'bad-role', code: 'user-role-mismatch' },
        { runId: 'bad-legacy', code: 'legacy-user-not-adjacent' },
      ],
    });
  });
});
