import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import type { TrajectorySpan } from '@/types/trajectory';
import { TrajectoryLedger } from './TrajectoryLedger';
import { TrajectoryInspector } from './TrajectoryInspector';

function toolCell(): TrajectoryCell {
  return {
    key: 'tool-1',
    type: 'tool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [8, 9],
    toolCallId: 'tool-call-1',
    stepId: 'step-1',
    toolName: 'web_search',
    status: 'failed',
    events: [{
      runId: 'run-1',
      sequence: 9,
      eventType: 'tool_call_completed',
      schemaVersion: 1,
      timestamp: '2026-08-23T00:00:01.000Z',
      stepId: 'step-1',
      toolCallId: 'tool-call-1',
      parentStepId: null,
      traceId: 'trace-1',
      payload: {
        tool_name: 'web_search',
        status: 'failed',
        duration_ms: 80,
        message: '搜索服务暂时不可用',
        prompt: '不得展示的系统提示词',
        raw_arguments: { query: '不得展示的完整参数' },
        admin_debug: '不得展示的管理员字段',
      },
    }],
  };
}

function failedSpan(): TrajectorySpan {
  return {
    span_id: 'span-child',
    kind: 'tool',
    name: '搜索资料',
    parent_span_id: 'span-root',
    start_sequence: 10,
    end_sequence: 12,
    started_at: '2026-08-23T00:00:00.000Z',
    ended_at: '2026-08-23T00:00:01.234Z',
    duration_ms: 1234,
    status: 'failed',
    terminal_source: 'event',
    inferred_reason: '上游服务暂时不可用，请稍后再试',
    ttft_ms: 240,
    record_sequences: [10, 11, 12],
  };
}

describe('TrajectoryInspector', () => {
  it('展示状态、耗时、TTFT、父子关系、短错误与 sequence 引用', () => {
    render(<TrajectoryInspector cell={toolCell()} span={failedSpan()} />);

    const inspector = screen.getByRole('complementary', { name: '轨迹检查器' });
    expect(within(inspector).getByRole('heading', { name: '搜索资料' })).toBeInTheDocument();
    expect(within(inspector).getByText('失败')).toBeInTheDocument();
    expect(within(inspector).getByText('1.23 秒')).toBeInTheDocument();
    expect(within(inspector).getByText('240 毫秒')).toBeInTheDocument();
    expect(within(inspector).getByText('父阶段 span-root')).toBeInTheDocument();
    expect(within(inspector).getByText('#10、#11、#12')).toBeInTheDocument();
    expect(within(inspector).getByText('上游服务暂时不可用，请稍后再试')).toBeInTheDocument();
  });

  it('只渲染普通用户安全摘要，不输出 raw JSON、prompt、完整参数或管理员字段', () => {
    render(<TrajectoryInspector cell={toolCell()} span={null} />);

    expect(screen.getByText('搜索')).toBeInTheDocument();
    expect(screen.getByText('80 毫秒')).toBeInTheDocument();
    expect(screen.getByText('步骤 step-1')).toBeInTheDocument();
    expect(screen.getByText('#8、#9')).toBeInTheDocument();
    expect(screen.queryByText('不得展示的系统提示词')).not.toBeInTheDocument();
    expect(screen.queryByText('不得展示的完整参数')).not.toBeInTheDocument();
    expect(screen.queryByText('不得展示的管理员字段')).not.toBeInTheDocument();
    expect(screen.queryByText(/raw_arguments|admin_debug|prompt/)).not.toBeInTheDocument();
  });

  it('大量 sequence 引用压缩成有界范围摘要，不在检查器生成超长文本', () => {
    const span = failedSpan();
    span.record_sequences = Array.from({ length: 5000 }, (_, index) => index);

    render(<TrajectoryInspector cell={toolCell()} span={span} />);

    expect(screen.getByText('#0–#4999（5000 条）')).toBeInTheDocument();
    expect(screen.queryByText(/#100、#101/)).not.toBeInTheDocument();
  });

  it('作为账本外的独立区域渲染，不改变虚拟行高度', () => {
    const cell = toolCell();
    render(
      <div>
        <TrajectoryLedger cells={[cell]} selectedCellKey="tool-1" viewportHeight={56} />
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
