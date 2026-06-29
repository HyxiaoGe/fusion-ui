import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import type { SearchSourceSummary } from '@/types/conversation';
import type { ExecutionProcessSource } from './agent/executionProcessModel';
import type { AssistantActivity } from './assistantActivity';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import AssistantResponseStack from './AssistantResponseStack';

const agentRunTimelinePropsMock = vi.hoisted(() => vi.fn());

vi.mock('./ReasoningContent', () => ({
  default: ({
    content,
    isVisible,
    isStreaming,
    startTime,
    endTime,
    onToggle,
  }: {
    content: string;
    isVisible: boolean;
    isStreaming: boolean;
    startTime?: number;
    endTime?: number;
    onToggle: () => void;
  }) => (
    <section
      data-testid="stack-reasoning"
      data-visible={String(isVisible)}
      data-streaming={String(isStreaming)}
      data-start-time={startTime}
      data-end-time={endTime}
      onClick={onToggle}
    >
      {content}
    </section>
  ),
}));

vi.mock('./AssistantActivityStatus', () => ({
  default: ({ activity }: { activity: AssistantActivity }) => (
    <section data-testid="stack-activity">{activity.kind}</section>
  ),
}));

vi.mock('./agent', () => ({
  AgentRunTimeline: (props: {
    assistantMessageId: string;
    onRetry?: () => void;
    onContinue?: (previousRunId?: string) => void;
    run?: AgentRunState | null;
    searchSources?: ExecutionProcessSource[];
    searchQueries?: string[];
    onOpenSources?: () => void;
  }) => {
    const payload: {
      hasRunProp: boolean;
      hasOpenSources?: boolean;
      run?: AgentRunState | null;
      searchSources?: ExecutionProcessSource[];
      searchQueries?: string[];
    } = {
      hasRunProp: Object.prototype.hasOwnProperty.call(props, 'run'),
      hasOpenSources: Boolean(props.onOpenSources),
      run: props.run,
    };
    if (props.searchSources) {
      payload.searchSources = props.searchSources;
    }
    if (props.searchQueries) {
      payload.searchQueries = props.searchQueries;
    }
    agentRunTimelinePropsMock(payload);

    return (
      <section
        data-testid="stack-agent"
        data-message-id={props.assistantMessageId}
        data-run-id={props.run?.runId ?? 'none'}
      >
        <button type="button" onClick={props.onRetry}>重试运行</button>
        <button type="button" onClick={() => props.onContinue?.('run-1')}>继续查</button>
        <button type="button" onClick={props.onOpenSources}>过程查看依据</button>
      </section>
    );
  },
}));

vi.mock('./AnswerEvidence', () => ({
  default: ({
    evidence,
    onSourceClick,
    onOpenSources,
  }: {
    evidence: AnswerEvidenceModel | null;
    onSourceClick: (index: number) => void;
    onOpenSources: () => void;
  }) => (
    <section data-testid="stack-evidence">
      <button type="button" onClick={() => onSourceClick(0)}>打开来源</button>
      <button type="button" onClick={onOpenSources}>打开全部来源</button>
      {evidence?.summary}
    </section>
  ),
}));

vi.mock('./MarkdownRenderer', () => ({
  default: ({
    content,
    className,
    sources,
    onCitationClick,
  }: {
    content: string;
    className?: string;
    sources?: SearchSourceSummary[];
    onCitationClick?: (index: number) => void;
  }) => (
    <section
      data-testid="stack-markdown"
      data-class-name={className}
      data-source-count={sources?.length ?? 0}
    >
      <button type="button" onClick={() => onCitationClick?.(0)}>引用来源</button>
      {content}
    </section>
  ),
}));

function activity(overrides: Partial<AssistantActivity> = {}): AssistantActivity {
  return {
    kind: 'answering',
    tool: null,
    issue: null,
    searchBlock: null,
    urlBlocks: [],
    hasText: true,
    hasThinking: true,
    shouldSuppressReasoning: false,
    shouldShowSources: false,
    suggestionState: 'idle',
    ...overrides,
  };
}

const sources: SearchSourceSummary[] = [
  { title: '来源一', url: 'https://example.com/source' },
];

const answerEvidence: AnswerEvidenceModel = {
  items: [
    {
      id: 'search-0',
      kind: 'search_source',
      title: '来源一',
      url: 'https://example.com/source',
      domain: 'example.com',
      sourceIndex: 0,
    },
  ],
  previewItems: [
    {
      id: 'search-0',
      kind: 'search_source',
      title: '来源一',
      url: 'https://example.com/source',
      domain: 'example.com',
      sourceIndex: 0,
    },
  ],
  searchCount: 1,
  urlCount: 0,
  totalCount: 1,
  hiddenSearchCount: 0,
  hiddenUrlCount: 0,
  summary: '回答依据 · 搜索 1 条',
  hasSearchSources: true,
};

const agentRun: AgentRunState = {
  runId: 'run-1',
  messageId: 'assistant-1',
  status: 'running',
  config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
  totalSteps: 0,
  totalToolCalls: 0,
  steps: [],
  lastSequence: 1,
};

describe('AssistantResponseStack', () => {
  it('按 assistant 内容栈顺序渲染，并收敛根节点和末尾间距', () => {
    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: true,
          content: '先推理',
          isVisible: true,
          isStreaming: true,
          onToggle: vi.fn(),
          startTime: 10,
          endTime: 20,
        }}
        activity={activity()}
        onRetry={vi.fn()}
        answerEvidence={answerEvidence}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '最终回答',
          sources,
          onCitationClick: vi.fn(),
        }}
        showStreamingCursor
      />,
    );

    const stack = screen.getByTestId('assistant-response-stack');

    expect(stack).toHaveClass('w-full', 'min-w-0');
    expect(stack.className).toContain('[&>*:last-child]:mb-0');
    expect([...stack.children].map(child => child.getAttribute('data-testid'))).toEqual([
      'stack-reasoning',
      'stack-activity',
      'stack-agent',
      'stack-evidence',
      'stack-markdown',
      'streaming-cursor',
    ]);
    expect(screen.getByTestId('stack-agent')).toHaveAttribute('data-message-id', 'assistant-1');
  });

  it('透传各子组件事件和 Markdown 渲染参数', () => {
    const onToggle = vi.fn();
    const onRetry = vi.fn();
    const onSourceClick = vi.fn();
    const onOpenSources = vi.fn();
    const onCitationClick = vi.fn();

    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: true,
          content: '推理内容',
          isVisible: false,
          isStreaming: false,
          onToggle,
          startTime: 11,
          endTime: 22,
        }}
        activity={activity({ kind: 'completed' })}
        onRetry={onRetry}
        answerEvidence={answerEvidence}
        onSourceClick={onSourceClick}
        onOpenSources={onOpenSources}
        markdown={{
          content: '带引用的回答',
          sources,
          onCitationClick,
        }}
        showStreamingCursor={false}
      />,
    );

    expect(screen.getByTestId('stack-reasoning')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('stack-reasoning')).toHaveAttribute('data-streaming', 'false');
    expect(screen.getByTestId('stack-reasoning')).toHaveAttribute('data-start-time', '11');
    expect(screen.getByTestId('stack-reasoning')).toHaveAttribute('data-end-time', '22');
    expect(screen.getByTestId('stack-markdown')).toHaveAttribute(
      'data-class-name',
      'prose-headings:border-0 prose-hr:border-border/30',
    );
    expect(screen.getByTestId('stack-markdown')).toHaveAttribute('data-source-count', '1');

    fireEvent.click(screen.getByTestId('stack-reasoning'));
    fireEvent.click(screen.getByRole('button', { name: '重试运行' }));
    fireEvent.click(screen.getByRole('button', { name: '过程查看依据' }));
    fireEvent.click(screen.getByRole('button', { name: '打开来源' }));
    fireEvent.click(screen.getByRole('button', { name: '打开全部来源' }));
    fireEvent.click(screen.getByRole('button', { name: '引用来源' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onOpenSources).toHaveBeenCalledTimes(2);
    expect(onSourceClick).toHaveBeenCalledWith(0);
    expect(onCitationClick).toHaveBeenCalledWith(0);
  });

  it('向 AgentRunTimeline 透传 continuation 事件', () => {
    const onContinueAgentRun = vi.fn();

    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: false,
          content: '',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity()}
        agentRun={agentRun}
        onRetry={undefined}
        onContinueAgentRun={onContinueAgentRun}
        answerEvidence={null}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '回答',
          sources: [],
          onCitationClick: undefined,
        }}
        showStreamingCursor={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '继续查' }));

    expect(onContinueAgentRun).toHaveBeenCalledWith('run-1');
  });

  it('向 AgentRunTimeline 透传当前 agentRun', () => {
    agentRunTimelinePropsMock.mockClear();

    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: false,
          content: '',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity()}
        agentRun={agentRun}
        onRetry={undefined}
        answerEvidence={null}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '回答',
          sources: [],
          onCitationClick: undefined,
        }}
        showStreamingCursor={false}
      />,
    );

    expect(screen.getByTestId('stack-agent')).toHaveAttribute('data-run-id', 'run-1');
    expect(agentRunTimelinePropsMock).toHaveBeenLastCalledWith({
      hasRunProp: true,
      hasOpenSources: true,
      run: agentRun,
    });
  });

  it('向 AgentRunTimeline 透传回答依据中的搜索来源，供执行过程侧栏兜底展示', () => {
    agentRunTimelinePropsMock.mockClear();

    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: false,
          content: '',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity()}
        agentRun={agentRun}
        onRetry={undefined}
        answerEvidence={answerEvidence}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '回答',
          sources: [],
          onCitationClick: undefined,
        }}
        showStreamingCursor={false}
      />,
    );

    expect(agentRunTimelinePropsMock).toHaveBeenLastCalledWith({
      hasRunProp: true,
      hasOpenSources: true,
      run: agentRun,
      searchSources: [
        {
          id: 'search-0',
          title: '来源一',
          url: 'https://example.com/source',
          domain: 'example.com',
          favicon: undefined,
        },
      ],
    });
  });

  it('向 AgentRunTimeline 透传搜索关键词，供历史执行过程展示', () => {
    agentRunTimelinePropsMock.mockClear();

    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: false,
          content: '',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity()}
        agentRun={agentRun}
        onRetry={undefined}
        answerEvidence={answerEvidence}
        searchQueries={[
          '暑期旅游哪里最火 2026 热门目的地',
          '2026暑期旅游热门城市 目的地 排行榜',
        ]}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '回答',
          sources: [],
          onCitationClick: undefined,
        }}
        showStreamingCursor={false}
      />,
    );

    expect(agentRunTimelinePropsMock).toHaveBeenLastCalledWith({
      hasRunProp: true,
      hasOpenSources: true,
      run: agentRun,
      searchSources: [
        {
          id: 'search-0',
          title: '来源一',
          url: 'https://example.com/source',
          domain: 'example.com',
          favicon: undefined,
        },
      ],
      searchQueries: [
        '暑期旅游哪里最火 2026 热门目的地',
        '2026暑期旅游热门城市 目的地 排行榜',
      ],
    });
  });

  it('未传 agentRun 时不向 AgentRunTimeline 传 run prop，保留旧 store fallback', () => {
    agentRunTimelinePropsMock.mockClear();

    render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: false,
          content: '',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity()}
        onRetry={undefined}
        answerEvidence={null}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '回答',
          sources: [],
          onCitationClick: undefined,
        }}
        showStreamingCursor={false}
      />,
    );

    expect(agentRunTimelinePropsMock).toHaveBeenLastCalledWith({
      hasRunProp: false,
      hasOpenSources: true,
      run: undefined,
    });
  });

  it('只在显式要求时渲染推理区和流式光标', () => {
    const { rerender } = render(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: false,
          content: '',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity({ kind: 'completed' })}
        onRetry={undefined}
        answerEvidence={null}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '回答',
          sources: [],
          onCitationClick: undefined,
        }}
        showStreamingCursor={false}
      />,
    );

    expect(screen.queryByTestId('stack-reasoning')).toBeNull();
    expect(screen.queryByTestId('streaming-cursor')).toBeNull();

    rerender(
      <AssistantResponseStack
        assistantMessageId="assistant-1"
        reasoning={{
          shouldRender: false,
          content: '',
          isVisible: false,
          isStreaming: false,
          onToggle: vi.fn(),
        }}
        activity={activity({ kind: 'answering' })}
        onRetry={undefined}
        answerEvidence={null}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
        markdown={{
          content: '回答',
          sources: [],
          onCitationClick: undefined,
        }}
        showStreamingCursor
      />,
    );

    expect(screen.getByTestId('streaming-cursor')).toHaveTextContent('▌');
  });
});
