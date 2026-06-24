import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, SearchSourceSummary } from '@/types/conversation';
import type { AnswerEvidenceSidebarModel } from './answerEvidenceSidebarModel';

const {
  dispatchMock,
  assistantResponseStackMock,
  deriveStaticAssistantMessageViewModelMock,
  getMessageNetworkDiagnosticsMock,
  useAssistantMessageViewModelMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  assistantResponseStackMock: vi.fn(),
  deriveStaticAssistantMessageViewModelMock: vi.fn(),
  getMessageNetworkDiagnosticsMock: vi.fn(),
  useAssistantMessageViewModelMock: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('../models/ProviderIcon', () => ({
  default: ({ providerId }: { providerId: string }) => (
    <span data-testid="provider-icon">{providerId}</span>
  ),
}));

vi.mock('./AssistantResponseStack', () => ({
  default: (props: {
    reasoning: {
      shouldRender: boolean;
      content: string;
      isVisible: boolean;
      isStreaming: boolean;
      onToggle: () => void;
      startTime?: number;
      endTime?: number;
    };
    markdown: {
      content: string;
      sources: SearchSourceSummary[];
      onCitationClick?: (index: number) => void;
    };
    onSourceClick: (index: number) => void;
    onOpenSources: () => void;
    onRetry?: () => void;
  }) => {
    assistantResponseStackMock(props);
    const {
      markdown,
      onSourceClick,
      onOpenSources,
    } = props;

    return (
      <section data-testid="assistant-response-stack">
        <p>{markdown.content}</p>
        <button type="button" onClick={props.reasoning.onToggle}>切换思考</button>
        <button type="button" onClick={() => markdown.onCitationClick?.(0)}>Markdown 引用</button>
        <button type="button" onClick={() => onSourceClick(0)}>依据来源</button>
        <button type="button" onClick={onOpenSources}>全部来源</button>
        <span data-testid="stack-source-count">{markdown.sources.length}</span>
      </section>
    );
  },
}));

vi.mock('./AnswerEvidenceSidebar', () => ({
  default: ({
    model,
    diagnostics,
    diagnosticsLoading,
    isOpen,
    highlightIndex,
  }: {
    model: AnswerEvidenceSidebarModel | null;
    diagnostics?: { summaryText: string } | null;
    diagnosticsLoading?: boolean;
    isOpen: boolean;
    highlightIndex?: number;
  }) => isOpen ? (
    <aside
      data-testid="answer-evidence-sidebar"
      data-highlight-index={highlightIndex}
      data-diagnostics-loading={diagnosticsLoading ? 'true' : 'false'}
      data-diagnostics-summary={diagnostics?.summaryText ?? ''}
    >
      {model?.usedItems.map(source => (
        <p key={source.id}>{source.title}</p>
      ))}
      {model?.issueItems.map(source => (
        <p key={source.id}>{source.reason}</p>
      ))}
      {diagnostics?.summaryText ? <p>{diagnostics.summaryText}</p> : null}
    </aside>
  ) : null,
}));

vi.mock('./SuggestedQuestions', () => ({
  default: ({ questions }: { questions: string[] }) => (
    <section data-testid="suggested-questions">
      {questions.map(question => (
        <button key={question} type="button">{question}</button>
      ))}
    </section>
  ),
}));

vi.mock('./MessageActions', () => ({
  default: () => <section data-testid="message-actions">操作栏</section>,
}));

vi.mock('./FileCard', () => ({
  default: () => <section data-testid="file-card">文件</section>,
}));

vi.mock('./useMessageCopy', () => ({
  useMessageCopy: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock('./useAssistantMessageViewModel', () => ({
  deriveStaticAssistantMessageViewModel: deriveStaticAssistantMessageViewModelMock,
  useAssistantMessageViewModel: useAssistantMessageViewModelMock,
}));

vi.mock('@/lib/api/chatDiagnostics', () => ({
  getMessageNetworkDiagnostics: getMessageNetworkDiagnosticsMock,
}));

import AssistantMessage from './AssistantMessage';

const sources: SearchSourceSummary[] = [
  { title: '来源一', url: 'https://example.com/source-1' },
];

function defaultViewModel(overrides: Record<string, unknown> = {}) {
  return {
    blocksToRender: [],
    isCurrentlyStreaming: false,
    activity: {
      kind: 'answering',
      tool: null,
      issue: null,
      searchBlock: null,
      urlBlocks: [],
      hasText: true,
      hasThinking: false,
      shouldSuppressReasoning: false,
      shouldShowSources: false,
      suggestionState: 'idle',
    },
    searchSources: sources,
    answerEvidence: null,
    displayText: '助手正文',
    displayThinking: '',
    suppressThinking: false,
    hasThinking: false,
    streamingStartTime: null,
    streamingEndTime: undefined,
    isStreamingReasoning: false,
    isThinkingPhaseComplete: false,
    ...overrides,
  };
}

function assistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: [{ type: 'text', id: 'text-1', text: '助手正文' }],
    timestamp: 1,
    ...overrides,
  };
}

function renderAssistant(overrides: Partial<React.ComponentProps<typeof AssistantMessage>> = {}) {
  return render(
    <AssistantMessage
      message={assistantMessage()}
      isLastMessage={true}
      isStreaming={false}
      suggestedQuestions={['继续问什么？']}
      isLoadingQuestions={false}
      activeChatId="chat-1"
      modelName="Qwen Max"
      {...overrides}
    />,
  );
}

describe('AssistantMessage', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    assistantResponseStackMock.mockReset();
    deriveStaticAssistantMessageViewModelMock.mockReset();
    deriveStaticAssistantMessageViewModelMock.mockReturnValue(defaultViewModel());
    getMessageNetworkDiagnosticsMock.mockReset();
    getMessageNetworkDiagnosticsMock.mockResolvedValue({
      conversation_id: 'chat-1',
      message_id: 'assistant-1',
      run_id: 'run-1',
      visibility: 'user',
      is_empty: false,
      summary: {
        total_duration_ms: 1200,
        total_steps: 1,
        total_tool_calls: 1,
        search_calls: 1,
        url_read_calls: 0,
        success_count: 1,
        failed_count: 0,
        degraded_count: 0,
        interrupted_count: 0,
      },
      tools: [
        {
          tool_call_log_id: 'log-1',
          tool_name: 'web_search',
          status: 'success',
          duration_ms: 1200,
          target: 'redis',
          result_count: 5,
        },
      ],
    });
    useAssistantMessageViewModelMock.mockReset();
    useAssistantMessageViewModelMock.mockReturnValue(defaultViewModel());
  });

  it('显示 provider 图标和传入模型名，缺少 provider 时回退到机器人图标', () => {
    const { rerender } = renderAssistant({ providerId: 'qwen' });

    expect(screen.getByTestId('provider-icon')).toHaveTextContent('qwen');
    expect(screen.getByText('Qwen Max')).toBeInTheDocument();

    rerender(
      <AssistantMessage
        message={assistantMessage()}
        isLastMessage={true}
        isStreaming={false}
        suggestedQuestions={[]}
        isLoadingQuestions={false}
        activeChatId="chat-1"
        modelName="AI助手"
      />,
    );

    expect(screen.queryByTestId('provider-icon')).toBeNull();
    expect(screen.getByText('AI助手')).toBeInTheDocument();
  });

  it('通过 AssistantResponseStack 渲染正文', () => {
    renderAssistant();

    expect(screen.getByTestId('assistant-response-stack')).toBeInTheDocument();
    expect(screen.getByText('助手正文')).toBeInTheDocument();
  });

  it('静态 assistant 在无关 props 引用稳定时不重复派生 view model', () => {
    const message = assistantMessage({ id: 'assistant-stable', content: [{ type: 'text', id: 'text-stable', text: '回答内容' }] });
    const stableQuestions: string[] = [];
    const onSelectQuestion = vi.fn();
    const onRefreshQuestions = vi.fn();

    const { rerender } = render(
      <AssistantMessage
        message={message}
        isLastMessage={false}
        isStreaming={false}
        suggestedQuestions={stableQuestions}
        isLoadingQuestions={false}
        activeChatId="chat-1"
        modelName="AI助手"
        onSelectQuestion={onSelectQuestion}
        onRefreshQuestions={onRefreshQuestions}
      />,
    );

    rerender(
      <AssistantMessage
        message={message}
        isLastMessage={false}
        isStreaming={false}
        suggestedQuestions={stableQuestions}
        isLoadingQuestions={false}
        activeChatId="chat-1"
        modelName="AI助手"
        onSelectQuestion={onSelectQuestion}
        onRefreshQuestions={onRefreshQuestions}
      />,
    );

    expect(deriveStaticAssistantMessageViewModelMock).toHaveBeenCalledTimes(1);
  });

  it('静态 assistant rerender 时保持传入响应栈的对象和回调稳定，避免静态子树重复渲染', () => {
    const message = assistantMessage({ id: 'assistant-citation-stable' });
    const onRetry = vi.fn();

    const { rerender } = render(
      <AssistantMessage
        message={message}
        isLastMessage={false}
        isStreaming={false}
        suggestedQuestions={[]}
        isLoadingQuestions={false}
        activeChatId="chat-1"
        modelName="AI助手"
        onRetry={onRetry}
      />,
    );

    const firstProps = assistantResponseStackMock.mock.calls.at(-1)?.[0];

    rerender(
      <AssistantMessage
        message={message}
        isLastMessage={false}
        isStreaming={false}
        suggestedQuestions={[]}
        isLoadingQuestions={false}
        activeChatId="chat-1"
        modelName="AI助手"
        onRetry={onRetry}
      />,
    );

    const secondProps = assistantResponseStackMock.mock.calls.at(-1)?.[0];

    expect(secondProps.reasoning).toBe(firstProps.reasoning);
    expect(secondProps.reasoning.onToggle).toBe(firstProps.reasoning.onToggle);
    expect(secondProps.markdown).toBe(firstProps.markdown);
    expect(secondProps.markdown.onCitationClick).toBe(firstProps.markdown.onCitationClick);
    expect(secondProps.onSourceClick).toBe(firstProps.onSourceClick);
    expect(secondProps.onOpenSources).toBe(firstProps.onOpenSources);
    expect(secondProps.onRetry).toBe(firstProps.onRetry);
  });

  it('点击 Markdown 引用后打开统一回答依据侧栏并高亮来源', () => {
    deriveStaticAssistantMessageViewModelMock.mockReturnValue(defaultViewModel({
      answerEvidence: {
        items: [
          {
            id: 'search-0',
            kind: 'search_source',
            title: '来源一',
            url: 'https://example.com/source-1',
            domain: 'example.com',
            sourceIndex: 0,
          },
        ],
        previewItems: [],
        searchCount: 1,
        urlCount: 0,
        totalCount: 1,
        hiddenSearchCount: 0,
        hiddenUrlCount: 0,
        summary: '回答依据 · 搜索 1 条',
        hasSearchSources: true,
      },
    }));

    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Markdown 引用' }));

    expect(screen.getByTestId('answer-evidence-sidebar')).toHaveAttribute('data-highlight-index', '0');
    expect(screen.getByText('来源一')).toBeInTheDocument();
  });

  it('URL-only 回答也能打开统一回答依据侧栏', () => {
    deriveStaticAssistantMessageViewModelMock.mockReturnValue(defaultViewModel({
      searchSources: [],
      answerEvidence: {
        items: [
          {
            id: 'url-url-1',
            kind: 'url_read',
            title: '读取来源',
            url: 'https://reader.example.com/a',
            domain: 'reader.example.com',
          },
        ],
        previewItems: [],
        searchCount: 0,
        urlCount: 1,
        totalCount: 1,
        hiddenSearchCount: 0,
        hiddenUrlCount: 0,
        summary: '回答依据 · 读取 1 个网页',
        hasSearchSources: false,
      },
    }));

    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: '全部来源' }));

    expect(screen.getByTestId('answer-evidence-sidebar')).toBeInTheDocument();
    expect(screen.getByText('读取来源')).toBeInTheDocument();
  });

  it('打开回答依据侧栏时懒加载联网诊断', async () => {
    deriveStaticAssistantMessageViewModelMock.mockReturnValue(defaultViewModel({
      answerEvidence: {
        items: [
          {
            id: 'search-0',
            kind: 'search_source',
            title: '来源一',
            url: 'https://example.com/source-1',
            domain: 'example.com',
            sourceIndex: 0,
          },
        ],
        previewItems: [],
        searchCount: 1,
        urlCount: 0,
        totalCount: 1,
        hiddenSearchCount: 0,
        hiddenUrlCount: 0,
        summary: '回答依据 · 搜索 1 条',
        hasSearchSources: true,
      },
    }));

    renderAssistant();

    expect(getMessageNetworkDiagnosticsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '全部来源' }));

    await waitFor(() => {
      expect(getMessageNetworkDiagnosticsMock).toHaveBeenCalledWith('chat-1', 'assistant-1');
    });
    expect(await screen.findByText('联网诊断 · 搜索 1 次 · 用时 1.2s')).toBeInTheDocument();
  });

  it('只有异常来源时也能打开统一回答依据侧栏查看原因', () => {
    deriveStaticAssistantMessageViewModelMock.mockReturnValue(defaultViewModel({
      searchSources: [],
      answerEvidence: null,
      activity: {
        ...defaultViewModel().activity,
        urlBlocks: [
          {
            type: 'url_read',
            id: 'url-failed',
            url: 'https://failed.example.com',
            status: 'failed',
            error_message: 'timeout',
          },
        ],
      },
    }));

    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: '全部来源' }));

    expect(screen.getByTestId('answer-evidence-sidebar')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
  });

  it('用户手动展开思考过程后不会被自动折叠计时器关闭', () => {
    vi.useFakeTimers();
    deriveStaticAssistantMessageViewModelMock.mockReturnValue(defaultViewModel({
      displayText: '最终回答',
      displayThinking: '推理过程',
      hasThinking: true,
    }));
    const expandedMessage = assistantMessage({ isReasoningVisible: true });

    const { rerender } = renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: '切换思考' }));

    rerender(
      <AssistantMessage
        message={expandedMessage}
        isLastMessage={true}
        isStreaming={false}
        suggestedQuestions={['继续问什么？']}
        isLoadingQuestions={false}
        activeChatId="chat-1"
        modelName="Qwen Max"
      />,
    );

    vi.advanceTimersByTime(900);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ visible: false }),
    }));
    vi.useRealTimers();
  });

  it('最后一条非流式助手消息且可选择问题时显示推荐问题', () => {
    renderAssistant({ onSelectQuestion: vi.fn() });

    expect(screen.getByTestId('suggested-questions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续问什么？' })).toBeInTheDocument();
  });

  it('非最后一条或流式中不显示推荐问题', () => {
    const { rerender } = renderAssistant({
      isLastMessage: false,
      onSelectQuestion: vi.fn(),
    });

    expect(screen.queryByTestId('suggested-questions')).toBeNull();

    rerender(
      <AssistantMessage
        message={assistantMessage()}
        isLastMessage={true}
        isStreaming={true}
        suggestedQuestions={['继续问什么？']}
        isLoadingQuestions={false}
        onSelectQuestion={vi.fn()}
        activeChatId="chat-1"
        modelName="Qwen Max"
      />,
    );

    expect(screen.queryByTestId('suggested-questions')).toBeNull();
  });
});
