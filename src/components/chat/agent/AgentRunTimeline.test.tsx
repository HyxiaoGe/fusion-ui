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

  it('有 v2 progress/plan 时即使 steps=[] 也渲染完成态执行过程入口', () => {
    renderTimeline(run({
      protocolVersion: 2,
      status: 'completed',
      steps: [],
      totalSteps: 0,
      totalToolCalls: 0,
      progress: {
        phase: 'synthesizing',
        label: '正在整理结论',
        completedSteps: 2,
        totalSteps: 3,
      },
      plan: {
        planId: 'plan-r1',
        revision: 1,
        items: [
          {
            id: 'search',
            title: '搜索资料',
            status: 'completed',
            kind: 'search',
            summary: '找到 2 条来源',
            toolNames: ['web_search'],
            evidenceItemIds: ['ev-1'],
          },
        ],
      },
      toolDigests: [
        {
          toolCallId: 'tc-1',
          toolName: 'web_search',
          status: 'success',
          title: '搜索资料',
          summary: '找到 2 条来源',
          keyFindings: ['G7 讨论 AI 标准'],
          sourceRefs: [],
          truncated: false,
        },
      ],
    }));

    expect(screen.queryByText('正在整理结论')).not.toBeInTheDocument();
    expect(screen.getByText('执行过程 · 搜索 1 次')).toBeInTheDocument();
    expect(screen.queryByText('工具结果')).not.toBeInTheDocument();
    expect(screen.queryByText('搜索资料')).not.toBeInTheDocument();
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

  it('completed 且工具全成功时收起为执行过程入口', () => {
    renderTimeline(run({
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

    expect(screen.getByText('执行过程 · 搜索 1 次')).toBeInTheDocument();
    expect(screen.queryByText(/整理答复/)).not.toBeInTheDocument();
  });

  it('completed 且存在执行过程时默认收起，并通过侧栏查看过程详情', () => {
    renderTimeline(run({
      status: 'completed',
      toolDigests: [
        {
          toolCallId: 'tc-1',
          toolName: 'web_search',
          status: 'success',
          title: '搜索资料',
          summary: '找到 2 条来源',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
        {
          toolCallId: 'tc-2',
          toolName: 'url_read',
          status: 'degraded',
          title: 'url_read 降级完成',
          summary: 'reader-service 返回 HTTP 502，已降级跳过',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
      ],
      steps: [
        step({
          stepId: 's1',
          stepNumber: 1,
          toolCalls: [
            toolCall({ toolCallId: 't1', arguments: { query: 'GPT 5.5' } }),
            toolCall({
              toolCallId: 't2',
              toolName: 'url_read',
              arguments: { url: 'https://example.com/a' },
              status: 'degraded',
              resultSummary: undefined,
              error: 'reader-service 返回 HTTP 502，已降级跳过',
            }),
          ],
        }),
      ],
    }));

    expect(screen.getByText('执行过程 · 搜索 1 次')).toBeInTheDocument();
    expect(screen.queryByText(/未使用/)).not.toBeInTheDocument();
    expect(screen.queryByText('工具结果')).not.toBeInTheDocument();
    expect(screen.queryByText(/url_read/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reader-service/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看执行过程' }));

    expect(screen.getByRole('dialog', { name: '执行过程' })).toBeInTheDocument();
    expect(screen.getByText('搜索记录')).toBeInTheDocument();
    expect(screen.getByText('GPT 5.5')).toBeInTheDocument();
    expect(screen.queryByText('example.com')).not.toBeInTheDocument();
    expect(screen.getByText('已自动跳过 1 个不可读网页')).toBeInTheDocument();
    expect(screen.queryByText('网页暂时无法读取')).not.toBeInTheDocument();
    expect(screen.queryByText(/url_read/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reader-service/)).not.toBeInTheDocument();
  });

  it('completed 但存在 degraded 工具时默认收起且不在摘要标记未使用数量', () => {
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

    expect(screen.getByText('执行过程 · 搜索 1 次')).toBeInTheDocument();
    expect(screen.queryByText(/未使用/)).not.toBeInTheDocument();
    expect(screen.queryByText(/搜索部分可用/)).not.toBeInTheDocument();
  });

  it('completed 历史 digest-only 执行过程按类型聚合，不把失败读取提升成未使用告警', () => {
    renderTimeline(run({
      status: 'completed',
      steps: [],
      totalSteps: 0,
      totalToolCalls: 0,
      toolDigests: [
        {
          toolCallId: 'tc-search-1',
          toolName: 'web_search',
          status: 'success',
          title: '搜索完成',
          summary: '保留 2 条候选结果，供后续回答筛选。',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
        {
          toolCallId: 'tc-read-1',
          toolName: 'url_read',
          status: 'degraded',
          title: '网页读取部分可用',
          summary: '网页暂时无法读取，已跳过该来源。',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
        {
          toolCallId: 'tc-read-2',
          toolName: 'url_read',
          status: 'success',
          title: '网页读取完成',
          summary: '已读取网页内容，供后续回答核验。',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
        {
          toolCallId: 'tc-search-2',
          toolName: 'web_search',
          status: 'success',
          title: '搜索完成',
          summary: '保留 5 条候选结果，供后续回答筛选。',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
        {
          toolCallId: 'tc-read-3',
          toolName: 'url_read',
          status: 'success',
          title: '网页读取完成',
          summary: '已读取网页内容，供后续回答核验。',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
        {
          toolCallId: 'tc-read-4',
          toolName: 'url_read',
          status: 'degraded',
          title: '网页读取部分可用',
          summary: '网页暂时无法读取，已跳过该来源。',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
      ],
    }));

    expect(screen.getByText('执行过程 · 搜索 2 次 · 读取 2 个网页')).toBeInTheDocument();
    expect(screen.queryByText(/未使用/)).not.toBeInTheDocument();
    expect(screen.queryByText('搜索完成')).not.toBeInTheDocument();
    expect(screen.queryByText('网页读取部分可用')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看执行过程' }));

    expect(screen.getByRole('dialog', { name: '执行过程' })).toBeInTheDocument();
    expect(screen.getByText('搜索资料')).toBeInTheDocument();
    expect(screen.getByText('搜索 2 次，共保留 7 条候选结果')).toBeInTheDocument();
    expect(screen.getByText('网页读取')).toBeInTheDocument();
    expect(screen.getByText('成功读取 2 个网页')).toBeInTheDocument();
    expect(screen.getByText('已自动跳过 2 个不可读网页')).toBeInTheDocument();
    expect(screen.queryByText('2 个未使用')).not.toBeInTheDocument();
    expect(screen.queryByText('搜索完成')).not.toBeInTheDocument();
    expect(screen.queryByText('网页读取部分可用')).not.toBeInTheDocument();
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
