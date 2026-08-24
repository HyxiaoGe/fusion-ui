import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import {
  normalizeTrajectoryRecord,
  type NormalizedTrajectoryEvent,
} from '@/lib/trajectory/normalizeTrajectoryEvent';
import type { TrajectoryRecord, TrajectorySpan } from '@/types/trajectory';
import { TrajectoryLedger } from './TrajectoryLedger';
import { TrajectoryInspector } from './TrajectoryInspector';

function normalizedRecord(
  sequence: number,
  eventType: string,
  payload: Record<string, unknown>,
  envelope: Partial<TrajectoryRecord> = {},
): NormalizedTrajectoryEvent {
  const event = normalizeTrajectoryRecord('run-1', {
    sequence,
    event_type: eventType,
    schema_version: 1,
    timestamp: `2026-08-23T00:00:0${Math.min(sequence, 9)}.000Z`,
    step_id: null,
    tool_call_id: null,
    parent_step_id: null,
    trace_id: 'trace-1',
    span_id: null,
    payload,
    ...envelope,
  } satisfies TrajectoryRecord);
  if (!event) throw new Error(`fixture ${eventType} 未通过真实轨迹归一化`);
  return event;
}

function runCell(records: NormalizedTrajectoryEvent[]): TrajectoryCell {
  return {
    key: 'run:run-1',
    type: 'run',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: records.map(record => record.sequence),
    summarySource: 'run-summary',
    attemptIndex: 0,
    runStatus: 'failed',
    totalSteps: 1,
    totalToolCalls: 0,
    startedAt: '2026-08-23T00:00:00.000Z',
    endedAt: '2026-08-23T00:00:01.234Z',
    isSelected: true,
    isHydrated: true,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'durable-snapshot', reason: null },
    records,
    spans: [],
    liveTail: [],
  };
}

function span(overrides: Partial<TrajectorySpan> = {}): TrajectorySpan {
  return {
    span_id: 'span-child',
    kind: 'llm',
    name: '生成回答',
    parent_span_id: 'span-root',
    start_sequence: 10,
    end_sequence: 12,
    started_at: '2026-08-23T00:00:00.000Z',
    ended_at: '2026-08-23T00:00:01.234Z',
    duration_ms: 1234,
    status: 'failed',
    terminal_source: 'recorded',
    inferred_reason: null,
    ttft_ms: 240,
    record_sequences: [10, 11, 12],
    ...overrides,
  };
}

function failedAttemptCell(): TrajectoryCell {
  const event = normalizedRecord(9, 'tool_attempt_completed', {
    tool_attempt_id: 'attempt-1',
    status: 'failed',
    error_code: 'provider_timeout_internal',
    duration_ms: 80,
    message: '不得展示的伪造错误',
    prompt: '不得展示的系统提示词',
    raw_arguments: { query: '不得展示的完整参数' },
    admin_debug: '不得展示的管理员字段',
  }, {
    step_id: 'step-1',
    tool_call_id: 'tool-call-1',
  });
  return {
    key: 'run:run-1:subtool:attempt-1',
    type: 'subtool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [9],
    toolCallId: 'tool-call-1',
    toolAttemptId: 'attempt-1',
    toolName: null,
    attemptIndex: 0,
    status: 'failed',
    events: [event],
  };
}

describe('TrajectoryInspector', () => {
  it('recorded failure 只从 span 引用的已归一化事件展示短错误', () => {
    const referencedFailure = normalizedRecord(12, 'llm_round_failed', {
      llm_round_id: 'round-1',
      status: 'failed',
      error_code: 'provider_auth_internal',
      message: '模型服务暂时不可用 api_key=secret-value 请稍后再试',
    });
    const unrelatedFailure = normalizedRecord(20, 'run_failed', {
      error_code: 'unrelated_internal_code',
      message: '不属于当前阶段的错误',
    });

    render(
      <TrajectoryInspector
        cell={runCell([referencedFailure, unrelatedFailure])}
        span={span()}
      />,
    );

    const inspector = screen.getByRole('complementary', { name: '轨迹检查器' });
    expect(within(inspector).getByRole('heading', { name: '生成回答' })).toBeInTheDocument();
    expect(within(inspector).getByText('失败')).toBeInTheDocument();
    expect(within(inspector).getByText('1.23 秒')).toBeInTheDocument();
    expect(within(inspector).getByText('240 毫秒')).toBeInTheDocument();
    expect(within(inspector).getByText('父阶段 span-root')).toBeInTheDocument();
    expect(within(inspector).getByText('#10、#11、#12')).toBeInTheDocument();
    expect(within(inspector).getByText(/模型服务暂时不可用/)).toBeInTheDocument();
    expect(within(inspector).queryByText(/secret-value|provider_auth_internal/)).not.toBeInTheDocument();
    expect(within(inspector).queryByText('不属于当前阶段的错误')).not.toBeInTheDocument();
  });

  it('把失败 run 的 orphan 结构原因映射成普通用户文案', () => {
    render(
      <TrajectoryInspector
        cell={runCell([])}
        span={span({
          terminal_source: 'inferred',
          inferred_reason: 'run_failed_without_close',
          record_sequences: [10],
        })}
      />,
    );

    expect(screen.getByText('运行失败前该阶段未能正常收口')).toBeInTheDocument();
    expect(screen.queryByText('run_failed_without_close')).not.toBeInTheDocument();
  });

  it('把截断前缀结构原因映射成有界快照说明', () => {
    render(
      <TrajectoryInspector
        cell={runCell([])}
        span={span({
          status: 'unknown',
          terminal_source: 'inferred',
          inferred_reason: 'truncated_prefix',
          record_sequences: [42],
        })}
      />,
    );

    expect(screen.getByText('该阶段的开始记录不在当前有界快照中')).toBeInTheDocument();
    expect(screen.queryByText('truncated_prefix')).not.toBeInTheDocument();
  });

  it('工具尝试错误码只生成受控摘要，不输出内部码或被归一化移除的字段', () => {
    render(<TrajectoryInspector cell={failedAttemptCell()} span={null} />);

    expect(screen.getByText('工具尝试未能完成')).toBeInTheDocument();
    expect(screen.getByText('80 毫秒')).toBeInTheDocument();
    expect(screen.queryByText('provider_timeout_internal')).not.toBeInTheDocument();
    expect(screen.queryByText('不得展示的伪造错误')).not.toBeInTheDocument();
    expect(screen.queryByText('不得展示的系统提示词')).not.toBeInTheDocument();
    expect(screen.queryByText('不得展示的完整参数')).not.toBeInTheDocument();
    expect(screen.queryByText('不得展示的管理员字段')).not.toBeInTheDocument();
    expect(screen.queryByText(/raw_arguments|admin_debug|prompt/)).not.toBeInTheDocument();
  });

  it('大量 sequence 引用压缩成有界范围摘要，不在检查器生成超长文本', () => {
    render(
      <TrajectoryInspector
        cell={runCell([])}
        span={span({
          record_sequences: Array.from({ length: 5000 }, (_, index) => index),
        })}
      />,
    );

    expect(screen.getByText('#0–#4999（5000 条）')).toBeInTheDocument();
    expect(screen.queryByText(/#100、#101/)).not.toBeInTheDocument();
  });

  it('作为账本外的独立区域渲染，不改变虚拟行高度', () => {
    const cell = failedAttemptCell();
    render(
      <div>
        <TrajectoryLedger cells={[cell]} selectedCellKey={cell.key} viewportHeight={56} />
        <TrajectoryInspector cell={cell} span={null} />
      </div>,
    );

    const ledger = screen.getByRole('listbox', { name: '轨迹账本' });
    const inspector = screen.getByRole('complementary', { name: '轨迹检查器' });
    expect(ledger).not.toContainElement(inspector);
    expect(within(ledger).getByRole('option')).toHaveStyle({ height: '56px' });
  });

  it('没有选中项时预留稳定检查器空间', () => {
    render(<TrajectoryInspector cell={null} span={null} />);

    expect(screen.getByText('选择一条轨迹记录查看详情')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '轨迹检查器' }))
      .toHaveClass('min-h-48');
  });
});
