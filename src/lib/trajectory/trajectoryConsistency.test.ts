import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/conversation';
import type { TrajectorySnapshotCacheEntry } from '@/redux/slices/trajectorySlice';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import {
  projectTrajectoryCells,
  type TrajectoryCell,
  type TrajectoryRunJoin,
} from './TrajectoryCellProjection';
import {
  evaluateEventProjectionParity,
  evaluateLiveDurableReconciliation,
  evaluateMessageJoinInvariants,
  selectStrictParityCohort,
} from './trajectoryConsistency';
import { resolveTrajectoryActionPolicy } from './trajectoryActionPolicy';

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
    snapshotRequestId: 'snapshot-a',
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

const explicitJoin: TrajectoryRunJoin = {
  runId: 'run-a',
  userMessageId: 'user-a',
  assistantMessageId: 'assistant-a',
  strategy: 'explicit',
  bucket: 'conversation',
};

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
      join: explicitJoin,
    })).toMatchObject({
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
      join: explicitJoin,
    })).toMatchObject({
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
      join: explicitJoin,
    })).toMatchObject({
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
      join: explicitJoin,
    })).toMatchObject({
      status: 'fail',
      cohort: { eligible: true, exclusions: [] },
      expectedSequences: [0, 1, 2],
      projectedSequences: [0, 2],
      missingSequences: [1],
      unexpectedSequences: [],
    });
  });

  it('canonical digest 用真实 projector 校验 plan/tool/evidence/run 规范字段', () => {
    const events = [
      event(0, {
        eventType: 'run_started',
        payload: {
          conversation_id: 'conversation-a',
          message_id: 'assistant-a',
          task_id: 'task-a',
          model: 'deepseek-chat',
          tools: ['web_search'],
        },
      }),
      event(1, {
        eventType: 'plan_snapshot',
        payload: {
          plan_id: 'plan-a',
          revision: 1,
          mode: 'on',
          source: 'model',
          items: [{ id: 'item-a', title: '查询资料' }],
        },
      }),
      event(2, {
        eventType: 'tool_call_completed',
        stepId: 'step-a',
        toolCallId: 'tool-a',
        payload: {
          tool_name: 'web_search',
          status: 'success',
          duration_ms: 80,
          plan_item_id: 'item-a',
        },
      }),
      event(3, {
        eventType: 'evidence_item_upserted',
        payload: {
          protocol_version: 2,
          evidence: {
            id: 'evidence-a',
            kind: 'web',
            status: 'used',
            title: '官方资料',
            url: 'https://example.com/docs',
          },
        },
      }),
      event(4, {
        eventType: 'run_completed',
        payload: { total_steps: 1, total_tool_calls: 1, finish_reason: 'stop' },
      }),
    ];
    const completeSnapshot = snapshot({
      completeness: {
        status: 'complete',
        degraded_reason: null,
        event_count: 5,
        expected_last_sequence: 4,
        loaded_event_count: 5,
        first_sequence: 0,
        last_sequence: 4,
      },
      durableLastSequence: 4,
      events,
    });
    const projection = projectTrajectoryCells({
      messages: [
        { id: 'user-a', role: 'user', content: [] },
        { id: 'assistant-a', role: 'assistant', content: [] },
      ],
      runs: [completeSnapshot.run],
      runSummariesById: { 'run-a': completeSnapshot.run },
      snapshotsByRunId: { 'run-a': completeSnapshot },
      liveEventsByRunId: {},
      selectedRunId: 'run-a',
      runsTruncated: false,
    });

    const result = evaluateEventProjectionParity({
      snapshot: completeSnapshot,
      cells: projection.cells,
      join: explicitJoin,
    });

    expect(result.status).toBe('pass');
    expect(result.expectedDigests).toEqual([
      {
        cellKind: 'run',
        runId: 'run-a',
        userMessageId: 'user-a',
        assistantMessageId: 'assistant-a',
        entityId: 'run-a',
        sequences: [0, 3, 4],
        normalizedFields: {
          events: [
            {
              sequence: 0,
              eventType: 'run_started',
              stepId: null,
              toolCallId: null,
              parentStepId: null,
              traceId: 'trace-a',
              payload: {
                conversation_id: 'conversation-a',
                message_id: 'assistant-a',
                task_id: 'task-a',
                model: 'deepseek-chat',
                tools: ['web_search'],
              },
            },
            {
              sequence: 3,
              eventType: 'evidence_item_upserted',
              stepId: null,
              toolCallId: null,
              parentStepId: null,
              traceId: 'trace-a',
              payload: {
                protocol_version: 2,
                evidence: {
                  id: 'evidence-a',
                  kind: 'web',
                  status: 'used',
                  title: '官方资料',
                  url: 'https://example.com/docs',
                },
              },
            },
            {
              sequence: 4,
              eventType: 'run_completed',
              stepId: null,
              toolCallId: null,
              parentStepId: null,
              traceId: 'trace-a',
              payload: { total_steps: 1, total_tool_calls: 1, finish_reason: 'stop' },
            },
          ],
        },
      },
      {
        cellKind: 'plan',
        runId: 'run-a',
        userMessageId: 'user-a',
        assistantMessageId: 'assistant-a',
        entityId: 'plan-a',
        sequences: [1],
        normalizedFields: {
          planId: 'plan-a',
          revision: 1,
          payload: {
            plan_id: 'plan-a',
            revision: 1,
            mode: 'on',
            source: 'model',
            items: [{ id: 'item-a', title: '查询资料' }],
          },
        },
      },
      {
        cellKind: 'tool',
        runId: 'run-a',
        userMessageId: 'user-a',
        assistantMessageId: 'assistant-a',
        entityId: 'tool-a',
        sequences: [2],
        normalizedFields: {
          toolCallId: 'tool-a',
          stepId: 'step-a',
          toolName: 'web_search',
          status: 'success',
          events: [{
            sequence: 2,
            eventType: 'tool_call_completed',
            stepId: 'step-a',
            toolCallId: 'tool-a',
            parentStepId: null,
            traceId: 'trace-a',
            payload: {
              tool_name: 'web_search',
              status: 'success',
              duration_ms: 80,
              plan_item_id: 'item-a',
            },
          }],
        },
      },
    ]);
    expect(result.projectedDigests).toEqual(result.expectedDigests);
  });

  it.each([
    ['plan', (cells: TrajectoryCell[]) => {
      const cell = cells.find(item => item.type === 'plan');
      if (cell?.type === 'plan') cell.revision = 99;
    }],
    ['tool', (cells: TrajectoryCell[]) => {
      const cell = cells.find(item => item.type === 'tool');
      if (cell?.type === 'tool') cell.toolName = 'url_read';
    }],
    ['evidence', (cells: TrajectoryCell[]) => {
      const cell = cells.find(item => item.type === 'run');
      const evidence = cell?.type === 'run'
        ? cell.records.find(record => record.eventType === 'evidence_item_upserted')
        : null;
      if (evidence) evidence.payload = { evidence: { id: 'wrong-evidence' } };
    }],
    ['run', (cells: TrajectoryCell[]) => {
      const cell = cells.find(item => item.type === 'run');
      const completed = cell?.type === 'run'
        ? cell.records.find(record => record.eventType === 'run_completed')
        : null;
      if (completed) completed.payload = { total_steps: 99 };
    }],
  ] as const)('%s 规范字段错误时 canonical parity 失败', (_, mutate) => {
    const events = [
      event(0, { eventType: 'run_started', payload: { message_id: 'assistant-a' } }),
      event(1, {
        eventType: 'plan_snapshot',
        payload: { plan_id: 'plan-a', revision: 1, items: [] },
      }),
      event(2, {
        eventType: 'tool_call_completed',
        stepId: 'step-a',
        toolCallId: 'tool-a',
        payload: { tool_name: 'web_search', status: 'success' },
      }),
      event(3, {
        eventType: 'evidence_item_upserted',
        payload: { evidence: { id: 'evidence-a', title: '资料' } },
      }),
      event(4, { eventType: 'run_completed', payload: { total_steps: 1 } }),
    ];
    const completeSnapshot = snapshot({
      completeness: {
        ...snapshot().completeness,
        event_count: 5,
        expected_last_sequence: 4,
        loaded_event_count: 5,
        last_sequence: 4,
      },
      durableLastSequence: 4,
      events,
    });
    const projection = projectTrajectoryCells({
      messages: [
        { id: 'user-a', role: 'user', content: [] },
        { id: 'assistant-a', role: 'assistant', content: [] },
      ],
      runs: [completeSnapshot.run],
      runSummariesById: { 'run-a': completeSnapshot.run },
      snapshotsByRunId: { 'run-a': completeSnapshot },
      liveEventsByRunId: {},
      selectedRunId: 'run-a',
      runsTruncated: false,
    });
    const mutated = structuredClone(projection.cells);
    mutate(mutated);

    const result = evaluateEventProjectionParity({
      snapshot: completeSnapshot,
      cells: mutated,
      join: explicitJoin,
    });

    expect(result.status).toBe('fail');
    expect(result.missingDigests).toHaveLength(1);
    expect(result.unexpectedDigests).toHaveLength(1);
  });

  it('同一 request 的多条 context 事件保持逐事件 canonical cell parity', () => {
    const events = [
      event(0, { eventType: 'run_started', payload: { message_id: 'assistant-a' } }),
      event(1, {
        eventType: 'context_required',
        payload: { request_id: 'context-a', context_type: 'geolocation', status: 'required' },
      }),
      event(2, {
        eventType: 'context_result',
        payload: { request_id: 'context-a', context_type: 'geolocation', status: 'provided' },
      }),
      event(3, { eventType: 'run_completed', payload: { total_steps: 0 } }),
    ];
    const completeSnapshot = snapshot({
      completeness: {
        ...snapshot().completeness,
        event_count: 4,
        expected_last_sequence: 3,
        loaded_event_count: 4,
        last_sequence: 3,
      },
      durableLastSequence: 3,
      events,
    });
    const projection = projectTrajectoryCells({
      messages: [
        { id: 'user-a', role: 'user', content: [] },
        { id: 'assistant-a', role: 'assistant', content: [] },
      ],
      runs: [completeSnapshot.run],
      runSummariesById: { 'run-a': completeSnapshot.run },
      snapshotsByRunId: { 'run-a': completeSnapshot },
      liveEventsByRunId: {},
      selectedRunId: 'run-a',
      runsTruncated: false,
    });

    const result = evaluateEventProjectionParity({
      snapshot: completeSnapshot,
      cells: projection.cells,
      join: explicitJoin,
    });

    expect(result.status).toBe('pass');
    expect(result.expectedDigests.filter(digest => digest.cellKind === 'context').map(digest => (
      digest.sequences
    ))).toEqual([[1], [2]]);
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
      prefixGapSequences: [],
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
      prefixGapSequences: [],
      liveTailSequences: [2],
    });
  });

  it('durable 前缀缺口中的 live-only sequence 显式判为 conflict', () => {
    expect(evaluateLiveDurableReconciliation({
      durableEvents: [event(0), event(2)],
      liveEvents: [event(1)],
    })).toEqual({
      status: 'conflict',
      durableLastSequence: 2,
      overlapSequences: [],
      conflictSequences: [],
      prefixGapSequences: [1],
      liveTailSequences: [],
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

  it('message join invariants 接受 projector 产生的 assistant-only 与 user-only explicit', () => {
    const messages: Message[] = [
      { id: 'assistant-only', role: 'assistant', content: [] },
      { id: 'user-only', role: 'user', content: [] },
    ];
    const assistantOnly = {
      ...snapshot().run,
      run_id: 'run-assistant-only',
      message_id: 'assistant-only',
      turn_message_id: null,
    };
    const userOnly = {
      ...snapshot().run,
      run_id: 'run-user-only',
      message_id: 'missing-assistant',
      turn_message_id: 'user-only',
    };
    const projection = projectTrajectoryCells({
      messages,
      runs: [assistantOnly, userOnly],
      runSummariesById: {
        'run-assistant-only': assistantOnly,
        'run-user-only': userOnly,
      },
      snapshotsByRunId: {},
      liveEventsByRunId: {},
      selectedRunId: null,
      runsTruncated: false,
    });

    expect(projection.joins).toEqual([
      {
        runId: 'run-assistant-only',
        userMessageId: null,
        assistantMessageId: 'assistant-only',
        strategy: 'assistant-only',
        bucket: 'conversation',
      },
      {
        runId: 'run-user-only',
        userMessageId: 'user-only',
        assistantMessageId: null,
        strategy: 'explicit',
        bucket: 'conversation',
      },
    ]);
    expect(evaluateMessageJoinInvariants({ messages, joins: projection.joins })).toEqual({
      status: 'pass',
      issues: [],
    });
  });

  it('message join invariants 拒绝 strategy、bucket 与 required ID 矩阵冲突', () => {
    const messages: Message[] = [
      { id: 'user-a', role: 'user', content: [] },
      { id: 'assistant-a', role: 'assistant', content: [] },
    ];

    expect(evaluateMessageJoinInvariants({
      messages,
      joins: [
        {
          runId: 'bad-bucket',
          userMessageId: 'user-a',
          assistantMessageId: 'assistant-a',
          strategy: 'unassociated',
          bucket: 'conversation',
        },
        {
          runId: 'missing-assistant',
          userMessageId: null,
          assistantMessageId: null,
          strategy: 'assistant-only',
          bucket: 'conversation',
        },
        {
          runId: 'forbidden-user',
          userMessageId: 'user-a',
          assistantMessageId: 'assistant-a',
          strategy: 'assistant-only',
          bucket: 'conversation',
        },
      ],
    })).toEqual({
      status: 'fail',
      issues: [
        { runId: 'bad-bucket', code: 'strategy-bucket-mismatch' },
        { runId: 'missing-assistant', code: 'strategy-required-id-missing' },
        { runId: 'forbidden-user', code: 'strategy-forbidden-id' },
      ],
    });
  });

  it('action policy 独立校验消息级目标、selected run lineage 与只读降级态', () => {
    const messages: Message[] = [
      { id: 'user-a', role: 'user', content: [] },
      { id: 'assistant-a', role: 'assistant', content: [] },
    ];
    const selected = snapshot().run;
    const base = {
      runs: [selected],
      messages,
      selectedRunId: selected.run_id,
      runListStatus: 'ready' as const,
      selectedRunHydrated: true,
      selectedTrajectoryStatus: 'complete',
      selectedRunTruncated: false,
      reconciliationStatus: 'ready' as const,
      hasActiveStream: false,
      retryCapabilityAvailable: true,
      modelAvailable: true,
      knowledgeBaseStatus: 'ready' as const,
      knowledgeBaseIds: [],
    };

    expect(resolveTrajectoryActionPolicy(base)).toMatchObject({
      target: {
        previousRunId: 'run-a',
        retryMessageId: 'assistant-a',
        userMessageId: 'user-a',
        assistantMessageId: 'assistant-a',
      },
      retry: { allowed: true, blockers: [] },
      continue: {
        allowed: false,
        blockers: expect.arrayContaining(['run-not-limit-reached']),
      },
    });

    for (const excluded of [
      { selectedTrajectoryStatus: 'legacy', selectedRunTruncated: false },
      { selectedTrajectoryStatus: 'degraded', selectedRunTruncated: false },
      { selectedTrajectoryStatus: 'complete', selectedRunTruncated: true },
    ]) {
      const policy = resolveTrajectoryActionPolicy({ ...base, ...excluded });
      expect(policy.retry.allowed).toBe(false);
      expect(policy.continue.allowed).toBe(false);
    }
  });
});
