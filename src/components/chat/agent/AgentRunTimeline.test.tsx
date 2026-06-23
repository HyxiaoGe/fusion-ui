import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { AgentRunState, AgentStepState, ToolCallState } from '@/types/agentRun';
import { useAppSelector } from '@/redux/hooks';
import { AgentRunTimeline } from './AgentRunTimeline';

vi.mock('@/redux/hooks', () => ({
  useAppSelector: vi.fn(),
}));

const mockUseAppSelector = useAppSelector as unknown as Mock;
const baseConfig = { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 };

function setCurrentRun(currentRun: AgentRunState | null) {
  mockUseAppSelector.mockImplementation((
    selector: (state: { stream: { currentRun: AgentRunState | null } }) => unknown,
  ) => selector({ stream: { currentRun } }));
}

function toolCall(overrides: Partial<ToolCallState> = {}): ToolCallState {
  return {
    toolCallId: 't1',
    toolName: 'web_search',
    arguments: { query: 'GPT 5.5' },
    status: 'success',
    resultSummary: { kind: 'search', count: 5, truncated: false },
    startedAt: 1_000,
    completedAt: 1_100,
    ...overrides,
  };
}

function step(overrides: Partial<AgentStepState> = {}): AgentStepState {
  return {
    stepId: 's1',
    stepNumber: 1,
    status: 'completed',
    toolCalls: [toolCall()],
    contentBlockIds: [],
    startedAt: 1_000,
    completedAt: 2_000,
    ...overrides,
  };
}

function run(overrides: Partial<AgentRunState> = {}): AgentRunState {
  const steps = overrides.steps ?? [step()];

  return {
    runId: 'r1',
    messageId: 'm1',
    status: 'running',
    config: baseConfig,
    totalSteps: steps.length,
    totalToolCalls: steps.reduce((count, currentStep) => count + currentStep.toolCalls.length, 0),
    steps,
    lastSequence: 10,
    ...overrides,
  };
}

function renderTimeline(currentRun: AgentRunState | null, props: { assistantMessageId?: string; onRetry?: () => void } = {}) {
  setCurrentRun(currentRun);

  return render(
    <AgentRunTimeline
      assistantMessageId={props.assistantMessageId ?? 'm1'}
      onRetry={props.onRetry}
    />,
  );
}

describe('AgentRunTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('currentRun 为空时不渲染', () => {
    const { container } = renderTimeline(null, { assistantMessageId: 'm_other' });

    expect(container.firstChild).toBeNull();
  });

  it('传入 run prop 为 null 时不订阅全局 currentRun 且不渲染', () => {
    const { container } = render(
      <AgentRunTimeline
        assistantMessageId="assistant-1"
        run={null}
      />,
    );

    expect(mockUseAppSelector).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it('run 为 undefined 时保留旧 store fallback', () => {
    setCurrentRun(run());

    render(
      <AgentRunTimeline
        assistantMessageId="m1"
        run={undefined}
      />,
    );

    expect(mockUseAppSelector).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/已用/)).toBeInTheDocument();
  });

  it('传入 run prop 时不订阅全局 currentRun 并按传入 run 渲染', () => {
    render(
      <AgentRunTimeline
        assistantMessageId="m1"
        run={run()}
      />,
    );

    expect(mockUseAppSelector).not.toHaveBeenCalled();
    expect(screen.getByText(/已用/)).toBeInTheDocument();
  });

  it('传入 run prop 时按 messageId 过滤不匹配 run', () => {
    const { container } = render(
      <AgentRunTimeline
        assistantMessageId="m_other"
        run={run()}
      />,
    );

    expect(mockUseAppSelector).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it('messageId 不匹配时不渲染（contract §1 message 归属）', () => {
    const { container } = renderTimeline(run(), { assistantMessageId: 'm_OTHER' });

    expect(container.firstChild).toBeNull();
  });

  it('running run 渲染：RunHeader + StepTimeline + 工具步骤', () => {
    renderTimeline(run());

    expect(screen.getByText(/已用/)).toBeInTheDocument();
    expect(screen.getByText(/搜索/)).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('点击 RunBanner 重试按钮触发外层 onRetry callback', () => {
    const onRetry = vi.fn();

    renderTimeline(run({
      status: 'failed',
      steps: [step({ status: 'failed', toolCalls: [] })],
      failure: { code: 'TEST_FAIL', message: '测试失败' },
    }), { onRetry });

    fireEvent.click(screen.getByText(/重试运行/));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('serverMessageId 匹配时也能渲染 timeline（messageId 不匹配但 serverMessageId 匹配）', () => {
    renderTimeline(run({
      messageId: 'placeholder_local',
      serverMessageId: 'm_server',
    }), { assistantMessageId: 'm_server' });

    expect(screen.getByText(/已用/)).toBeInTheDocument();
  });

  it('completed + steps=[] 不渲染（M1 guard 行为）', () => {
    const { container } = renderTimeline(run({
      status: 'completed',
      steps: [],
      totalSteps: 0,
      totalToolCalls: 0,
    }));

    expect(container.firstChild).toBeNull();
  });

  it('failed + steps=[] 仍显示失败 banner（防 M1 guard 误杀 ProviderOffline 场景）', () => {
    renderTimeline(run({
      status: 'failed',
      steps: [],
      totalSteps: 0,
      totalToolCalls: 0,
      failure: { code: 'PROVIDER_OFFLINE', message: 'OpenAI 上游断流' },
    }));

    expect(screen.getByText(/运行失败/)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI 上游断流/)).toBeInTheDocument();
  });

  it('completed 且工具全成功时隐藏搜索过程和整理答复', () => {
    const { container } = renderTimeline(run({
      status: 'completed',
      steps: [
        step({
          stepId: 's1',
          stepNumber: 1,
          toolCalls: [toolCall({ toolCallId: 't1' })],
        }),
        step({
          stepId: 's2',
          stepNumber: 2,
          toolCalls: [],
          contentBlockIds: ['answer-1'],
        }),
      ],
    }));

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/搜索/)).not.toBeInTheDocument();
    expect(screen.queryByText(/整理答复/)).not.toBeInTheDocument();
  });

  it('completed 但存在 degraded 工具时仍渲染 timeline', () => {
    renderTimeline(run({
      status: 'completed',
      steps: [
        step({
          toolCalls: [
            toolCall({
              status: 'degraded',
              resultSummary: undefined,
              error: '搜索服务降级',
            }),
          ],
        }),
      ],
    }));

    expect(screen.getByText(/搜索降级/)).toBeInTheDocument();
  });

  it('completed 但存在 failed step 时仍渲染 timeline', () => {
    renderTimeline(run({
      status: 'completed',
      steps: [
        step({
          status: 'failed',
          toolCalls: [],
          contentBlockIds: ['answer-1'],
        }),
      ],
    }));

    expect(screen.getByText(/整理失败/)).toBeInTheDocument();
  });

  it('running 状态仍渲染 timeline', () => {
    renderTimeline(run({
      status: 'running',
      steps: [
        step({
          status: 'running',
          toolCalls: [toolCall({ status: 'running', completedAt: undefined })],
        }),
      ],
    }));

    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText(/正在搜索/)).toBeInTheDocument();
  });

  it('limit_reached 或 limitReachedReason 存在时仍渲染 timeline', () => {
    const limitReached = renderTimeline(run({
      status: 'limit_reached',
      limitReachedReason: 'max_steps',
    }));

    expect(screen.getByText(/已达最大步数/)).toBeInTheDocument();

    limitReached.unmount();

    renderTimeline(run({
      status: 'completed',
      limitReachedReason: 'timeout',
    }));

    expect(screen.getByText(/搜索/)).toBeInTheDocument();
  });
});
