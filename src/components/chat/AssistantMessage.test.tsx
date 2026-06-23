import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, SearchSourceSummary } from '@/types/conversation';

const {
  dispatchMock,
  deriveStaticAssistantMessageViewModelMock,
  useAssistantMessageViewModelMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  deriveStaticAssistantMessageViewModelMock: vi.fn(),
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
  default: ({
    markdown,
    onSourceClick,
    onOpenSources,
  }: {
    markdown: {
      content: string;
      sources: SearchSourceSummary[];
      onCitationClick?: (index: number) => void;
    };
    onSourceClick: (index: number) => void;
    onOpenSources: () => void;
  }) => (
    <section data-testid="assistant-response-stack">
      <p>{markdown.content}</p>
      <button type="button" onClick={() => markdown.onCitationClick?.(0)}>Markdown 引用</button>
      <button type="button" onClick={() => onSourceClick(0)}>依据来源</button>
      <button type="button" onClick={onOpenSources}>全部来源</button>
      <span data-testid="stack-source-count">{markdown.sources.length}</span>
    </section>
  ),
}));

vi.mock('./SourcesSidebar', () => ({
  default: ({
    sources,
    isOpen,
    highlightIndex,
  }: {
    sources: SearchSourceSummary[];
    isOpen: boolean;
    highlightIndex?: number;
  }) => isOpen ? (
    <aside data-testid="sources-sidebar" data-highlight-index={highlightIndex}>
      {sources.map(source => (
        <p key={source.url}>{source.title}</p>
      ))}
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
    deriveStaticAssistantMessageViewModelMock.mockReset();
    deriveStaticAssistantMessageViewModelMock.mockReturnValue(defaultViewModel());
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

  it('点击 Markdown 引用后打开 SourcesSidebar 并高亮来源', () => {
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Markdown 引用' }));

    expect(screen.getByTestId('sources-sidebar')).toHaveAttribute('data-highlight-index', '0');
    expect(screen.getByText('来源一')).toBeInTheDocument();
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
