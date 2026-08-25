import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import type { TrajectoryActionPolicyInput } from '@/lib/trajectory/trajectoryActionPolicy';

const { getChatCapabilitiesMock } = vi.hoisted(() => ({
  getChatCapabilitiesMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  getChatCapabilities: getChatCapabilitiesMock,
}));

import {
  TrajectoryRunActions,
  type TrajectoryRunActionsProps,
} from './TrajectoryRunActions';

const messages: Message[] = [
  { id: 'user-1', role: 'user', content: [{ type: 'text', id: 'q', text: '问题' }] },
  { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', id: 'a', text: '回答' }] },
];

function run(overrides: Partial<TrajectoryRunSummary> = {}): TrajectoryRunSummary {
  return {
    run_id: 'run-selected',
    message_id: 'assistant-1',
    turn_message_id: 'user-1',
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 0,
    duration_ms: 100,
    started_at: '2026-08-22T00:00:00.000Z',
    ended_at: '2026-08-22T00:00:00.100Z',
    llm_detail_schema_version: 1,
    llm_round_count: 0,
    ...overrides,
  };
}

function policyInput(
  overrides: Partial<Omit<TrajectoryActionPolicyInput, 'retryCapabilityAvailable'>> = {},
): Omit<TrajectoryActionPolicyInput, 'retryCapabilityAvailable'> {
  const selected = run();
  return {
    runs: [selected],
    messages,
    selectedRunId: selected.run_id,
    runListStatus: 'ready' as const,
    selectedRunHydrated: true,
    selectedTrajectoryStatus: 'complete',
    selectedRunTruncated: false,
    reconciliationStatus: 'ready' as const,
    hasActiveStream: false,
    modelAvailable: true,
    knowledgeBaseStatus: 'ready' as const,
    knowledgeBaseIds: [],
    ...overrides,
  };
}

function props(
  overrides: Partial<TrajectoryRunActionsProps> = {},
): TrajectoryRunActionsProps {
  const input = policyInput();
  return {
    enabled: true,
    ...input,
    refreshRuns: vi.fn().mockResolvedValue('ready'),
    getLatestPolicyInput: vi.fn(() => input),
    onRetry: vi.fn(),
    onContinue: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('TrajectoryRunActions', () => {
  beforeEach(() => {
    getChatCapabilitiesMock.mockReset();
    getChatCapabilitiesMock.mockResolvedValue({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
      message_retry_v1: true,
    });
  });

  it('能力验证后只从终态区域用所选 run 发起 Agent retry', async () => {
    const onRetry = vi.fn();
    render(<TrajectoryRunActions {...props({ onRetry })} />);

    expect(screen.getByRole('status', { name: '运行操作状态' })).toHaveTextContent('正在验证');
    fireEvent.click(await screen.findByRole('button', { name: '重试所选运行' }));

    await waitFor(() => expect(onRetry).toHaveBeenCalledWith(
      {
        previousRunId: 'run-selected',
        retryMessageId: 'assistant-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
      },
      expect.objectContaining({
        canStart: expect.any(Function),
        onAccepted: expect.any(Function),
        onRejected: expect.any(Function),
      }),
    ));
  });

  it('limit_reached 才展示 continue，并显式提交所选 assistant/run', async () => {
    const onContinue = vi.fn();
    const limitRun = run({ status: 'limit_reached' });
    render(<TrajectoryRunActions {...props({
      runs: [limitRun],
      getLatestPolicyInput: () => policyInput({ runs: [limitRun] }),
      onContinue,
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: '继续所选运行' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalledWith(
      {
        previousRunId: 'run-selected',
        retryMessageId: 'assistant-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
      },
      expect.objectContaining({
        canStart: expect.any(Function),
        onAccepted: expect.any(Function),
        onRejected: expect.any(Function),
      }),
    ));
  });

  it('历史 attempt 与 legacy/degraded/truncated 只显示只读状态，不渲染假按钮', async () => {
    const latest = run({
      run_id: 'run-latest',
      attempt_index: 1,
      started_at: '2026-08-22T00:00:01.000Z',
    });
    const historical = run({ run_id: 'run-history', attempt_index: 0 });
    const { rerender } = render(<TrajectoryRunActions {...props({
      runs: [historical, latest],
      selectedRunId: historical.run_id,
    })} />);

    expect(await screen.findByText(/历史执行只读/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试所选运行' })).toBeNull();

    for (const state of [
      { selectedTrajectoryStatus: 'legacy', selectedRunTruncated: false },
      { selectedTrajectoryStatus: 'degraded', selectedRunTruncated: false },
      { selectedTrajectoryStatus: 'complete', selectedRunTruncated: true },
    ]) {
      rerender(<TrajectoryRunActions {...props(state)} />);
      await waitFor(() => {
        expect(screen.getByText(/本次运行仅供查看/)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: '重试所选运行' })).toBeNull();
    }
  });

  it('服务端能力缺失时保持只读且不触发回调', async () => {
    getChatCapabilitiesMock.mockResolvedValueOnce({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
      message_retry_v1: false,
    });
    const onRetry = vi.fn();
    render(<TrajectoryRunActions {...props({ onRetry })} />);

    expect(await screen.findByText(/不支持安全运行重试/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试所选运行' })).toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retry 首次点击同步建立 single-flight，双击只刷新并提交一次', async () => {
    const refresh = deferred<'ready'>();
    const refreshRuns = vi.fn(() => refresh.promise);
    const onRetry = vi.fn();
    render(<TrajectoryRunActions {...props({ refreshRuns, onRetry })} />);

    const retryButton = await screen.findByRole('button', { name: '重试所选运行' });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(retryButton).toBeDisabled();
    expect(onRetry).not.toHaveBeenCalled();

    refresh.resolve('ready');
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it('continue 首次点击同步建立 single-flight，双击不会替换第一次执行', async () => {
    const refresh = deferred<'ready'>();
    const refreshRuns = vi.fn(() => refresh.promise);
    const limitInput = policyInput({ runs: [run({ status: 'limit_reached' })] });
    const onContinue = vi.fn();
    render(<TrajectoryRunActions {...props({
      ...limitInput,
      refreshRuns,
      getLatestPolicyInput: () => limitInput,
      onContinue,
    })} />);

    const continueButton = await screen.findByRole('button', { name: '继续所选运行' });
    fireEvent.click(continueButton);
    fireEvent.click(continueButton);

    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(continueButton).toBeDisabled();
    expect(onContinue).not.toHaveBeenCalled();

    refresh.resolve('ready');
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  });

  it('强制刷新等待期间出现 active stream 时拒绝发送并释放门闩', async () => {
    const refresh = deferred<'ready'>();
    let latestInput = policyInput();
    const onRetry = vi.fn();
    render(<TrajectoryRunActions {...props({
      refreshRuns: () => refresh.promise,
      getLatestPolicyInput: () => latestInput,
      onRetry,
    })} />);

    const retryButton = await screen.findByRole('button', { name: '重试所选运行' });
    fireEvent.click(retryButton);
    latestInput = policyInput({ hasActiveStream: true });
    refresh.resolve('ready');

    await waitFor(() => expect(retryButton).not.toBeDisabled());
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('强制刷新等待期间 selection 变化时拒绝把动作转移到另一 run', async () => {
    const refresh = deferred<'ready'>();
    const otherRun = run({ run_id: 'run-other' });
    let latestInput = policyInput();
    const onRetry = vi.fn();
    render(<TrajectoryRunActions {...props({
      refreshRuns: () => refresh.promise,
      getLatestPolicyInput: () => latestInput,
      onRetry,
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: '重试所选运行' }));
    latestInput = policyInput({ runs: [otherRun], selectedRunId: otherRun.run_id });
    refresh.resolve('ready');

    await waitFor(() => expect(screen.getByRole('button', { name: '重试所选运行' })).not.toBeDisabled());
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retry 能力等待期间出现更新 attempt 时最终 canStart 复判拒绝发送', async () => {
    let latestInput = policyInput();
    let canStart: (() => boolean) | undefined;
    const onRetry = vi.fn((_target, lifecycle) => {
      canStart = lifecycle?.canStart;
    });
    render(<TrajectoryRunActions {...props({
      getLatestPolicyInput: () => latestInput,
      onRetry,
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: '重试所选运行' }));
    await waitFor(() => expect(canStart).toBeTypeOf('function'));
    latestInput = policyInput({
      runs: [run(), run({ run_id: 'run-new', attempt_index: 1 })],
    });

    expect(canStart?.()).toBe(false);
  });
});
