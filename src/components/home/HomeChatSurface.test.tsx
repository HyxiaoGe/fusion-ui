import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dispatchMock,
  routerPushMock,
  routerReplaceMock,
  sendMessageMock,
  stopStreamingMock,
  useConversationFilesMock,
  useConversationFilesState,
  deleteFileMock,
  chatInputRenderMock,
  modelState,
  routeState,
  pendingConversationState,
  streamState,
  chatMessageListMock,
  chatMessageListState,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  sendMessageMock: vi.fn(),
  stopStreamingMock: vi.fn(),
  useConversationFilesMock: vi.fn(),
  useConversationFilesState: {
    files: [] as any[],
    isLoading: false,
    error: null as string | null,
    refresh: vi.fn(),
    removeFile: vi.fn(),
  },
  deleteFileMock: vi.fn(),
  chatInputRenderMock: vi.fn(),
  modelState: {
    models: [
      {
        id: 'model-vision',
        provider: 'qwen',
        enabled: true,
        capabilities: { vision: true, deepThinking: false },
      },
    ],
  },
  routeState: {
    pathname: '/chat/new',
    modelHint: 'model-vision' as string | null,
  },
  pendingConversationState: {
    id: null as string | null,
    byId: {} as Record<string, any>,
  },
  streamState: {
    isStreaming: false,
    conversationId: null as string | null,
  },
  chatMessageListMock: vi.fn(),
  chatMessageListState: {
    suspended: false,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
  usePathname: () => routeState.pathname,
  useSearchParams: () => new URLSearchParams(routeState.modelHint ? `model=${routeState.modelHint}` : ''),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({
      models: {
        models: modelState.models,
        selectedModelId: 'model-vision',
      },
      conversation: {
        byId: pendingConversationState.byId,
        pendingConversationId: pendingConversationState.id,
        reasoningEnabled: false,
      },
      stream: streamState,
      fileUpload: {
        files: {},
        fileIds: {},
        processingFiles: {},
      },
      auth: {
        isAuthenticated: true,
        user: { id: 'user-a' },
        token: 'token-a',
      },
    }),
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  setSelectedModel: vi.fn((payload?: unknown) => ({ type: 'models/setSelectedModel', payload })),
}));

vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: sendMessageMock,
    stopStreaming: stopStreamingMock,
  }),
}));

vi.mock('@/components/lazy/LazyComponents', () => ({
  ChatMessageListLazy: (props: any) => {
    chatMessageListMock(props);
    if (chatMessageListState.suspended) {
      return props.fallback;
    }
    return (
      <div
        data-testid="pending-message-list"
        data-message-ids={props.messages.map((message: any) => message.id).join(',')}
        data-streaming={props.isStreaming ? 'true' : 'false'}
      />
    );
  },
}));

vi.mock('@/hooks/useConversationFiles', () => ({
  useConversationFiles: (conversationId: string | null, options?: unknown) => {
    useConversationFilesMock(conversationId, options);
    return useConversationFilesState;
  },
}));

vi.mock('@/lib/api/files', () => ({
  deleteFile: deleteFileMock,
}));

vi.mock('@/components/home/HomePage', () => ({
  default: function MockHomePage({ onSendMessage, onNewChat }: any) {
    return (
      <div data-testid="home-page">
        <button type="button" onClick={() => onSendMessage('首页示例问题')}>
          首页发送
        </button>
        <button type="button" onClick={onNewChat}>
          新建会话
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/chat/ConversationFilesPanel', () => ({
  default: function MockConversationFilesPanel(props: any) {
    if (!props.open) {
      return null;
    }

    return (
      <div
        data-testid="conversation-files-panel"
        data-loading={props.isLoading ? 'true' : 'false'}
        data-error={props.error ?? ''}
        data-selected-ids={Array.from(props.selectedFileIds).join(',')}
      >
        <button type="button" onClick={() => props.onAddFile(props.files[0])}>
          加入资料
        </button>
        <button type="button" onClick={() => props.onDeleteFile(props.files[0].id)}>
          删除资料
        </button>
        <button type="button" onClick={props.onRefresh}>
          刷新资料
        </button>
        <button type="button" onClick={props.onClose}>
          关闭资料
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/chat/ChatInput', () => ({
  default: function MockChatInput({
    onSendMessage,
    conversationAttachments = [],
    onRemoveConversationAttachment,
    onClearConversationAttachments,
    onUploadComplete,
    onStopStreaming,
    activeChatId,
  }: any) {
    const [hasLocalUploadError, setHasLocalUploadError] = React.useState(false);
    chatInputRenderMock({ conversationAttachments });

    const sendSelectedAttachment = () => {
      const attachments = conversationAttachments.map((attachment: any) => ({
        fileId: attachment.fileId,
        filename: attachment.filename,
        mimeType: attachment.mimetype,
        previewUrl: attachment.thumbnailUrl || undefined,
      }));
      onSendMessage('解读资料', attachments, 'pending-chat-1');
    };

    return (
      <div
        data-testid="chat-input"
        data-attachment-count={conversationAttachments.length}
        data-local-upload-error={hasLocalUploadError ? 'true' : 'false'}
        data-active-chat-id={activeChatId ?? ''}
      >
        {onStopStreaming ? (
          <button type="button" onClick={onStopStreaming}>
            停止生成
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            onUploadComplete(
              [
                {
                  fileId: 'file-uploaded',
                  filename: 'uploaded.png',
                  mimetype: 'image/png',
                  size: 120,
                  thumbnailUrl: '/thumb.png',
                  status: 'processed',
                },
              ],
              'pending-chat-1',
            )
          }
        >
          上传已处理资料
        </button>
        <button
          type="button"
          onClick={() =>
            onUploadComplete(
              [
                {
                  fileId: 'file-parsing',
                  filename: 'report.pdf',
                  mimetype: 'application/pdf',
                  size: 240,
                  thumbnailUrl: null,
                  status: 'parsing',
                },
              ],
              'pending-chat-1',
            )
          }
        >
          上传解析中资料
        </button>
        <button type="button" onClick={sendSelectedAttachment}>
          发送资料提问
        </button>
        <button
          type="button"
          onClick={() => onRemoveConversationAttachment?.(conversationAttachments[0]?.fileId)}
        >
          移除资料引用
        </button>
        <button type="button" onClick={onClearConversationAttachments}>
          清空资料引用
        </button>
        <button type="button" onClick={() => setHasLocalUploadError(true)}>
          模拟失败上传
        </button>
      </div>
    );
  },
}));

import HomeChatSurface from './HomeChatSurface';
import { requestNewChatDraftReset } from '@/lib/chat/newChatDraftReset';

function createFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    filename: 'diagram.png',
    mimetype: 'image/png',
    size: 100,
    created_at: '2026-07-03T10:00:00Z',
    status: 'processed',
    error_message: null,
    thumbnail_url: '/diagram-thumb.png',
    ...overrides,
  };
}

describe('HomeChatSurface 会话资料交互', () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    routerPushMock.mockClear();
    routerReplaceMock.mockClear();
    sendMessageMock.mockReset();
    stopStreamingMock.mockReset();
    useConversationFilesMock.mockClear();
    useConversationFilesState.files = [];
    useConversationFilesState.isLoading = false;
    useConversationFilesState.error = null;
    useConversationFilesState.refresh.mockClear();
    useConversationFilesState.removeFile.mockClear();
    deleteFileMock.mockReset();
    deleteFileMock.mockResolvedValue(undefined);
    chatInputRenderMock.mockClear();
    chatMessageListMock.mockClear();
    chatMessageListState.suspended = false;
    routeState.pathname = '/chat/new';
    routeState.modelHint = 'model-vision';
    pendingConversationState.id = null;
    pendingConversationState.byId = {};
    streamState.isStreaming = false;
    streamState.conversationId = null;
    window.sessionStorage.clear();
  });

  it('/chat/new 在首个 SSE 前立即渲染本地草稿并保留停止能力', async () => {
    routeState.modelHint = null;
    pendingConversationState.id = 'draft-chat-1';
    pendingConversationState.byId = {
      'draft-chat-1': {
        id: 'draft-chat-1',
        title: '即时草稿',
        model_id: 'model-vision',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: [{ type: 'text', id: 'user-block', text: '你好' }],
            status: 'pending',
            timestamp: 1,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [],
            timestamp: 1,
          },
        ],
      },
    };
    streamState.isStreaming = true;
    streamState.conversationId = 'draft-chat-1';

    const { rerender } = render(<HomeChatSurface />);

    expect(screen.queryByTestId('home-page')).toBeNull();
    expect(screen.getByTestId('pending-conversation-surface')).toBeInTheDocument();
    expect(screen.getByTestId('pending-message-list')).toHaveAttribute(
      'data-message-ids',
      'user-1,assistant-1'
    );
    expect(screen.getByTestId('pending-message-list')).toHaveAttribute('data-streaming', 'true');
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-active-chat-id', 'draft-chat-1');
    expect(routerReplaceMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
    expect(stopStreamingMock).toHaveBeenCalledTimes(1);

    pendingConversationState.id = null;
    pendingConversationState.byId = {};
    streamState.isStreaming = false;
    streamState.conversationId = null;
    rerender(<HomeChatSurface />);

    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });

  it('消息列表代码尚未加载完成时也立即显示真实用户消息', () => {
    routeState.modelHint = null;
    chatMessageListState.suspended = true;
    pendingConversationState.id = 'draft-chat-fallback';
    pendingConversationState.byId = {
      'draft-chat-fallback': {
        id: 'draft-chat-fallback',
        title: '即时草稿',
        model_id: 'model-vision',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'user-fallback',
            role: 'user',
            content: [{ type: 'text', id: 'user-block', text: '这条消息必须立即出现' }],
            status: 'pending',
            timestamp: 1,
          },
          {
            id: 'assistant-fallback',
            role: 'assistant',
            content: [],
            timestamp: 1,
          },
        ],
      },
    };
    streamState.isStreaming = true;
    streamState.conversationId = 'draft-chat-fallback';

    render(<HomeChatSurface />);

    expect(screen.getByLabelText('用户消息内容')).toHaveTextContent('这条消息必须立即出现');
    expect(screen.getByRole('status', { name: '正在准备完整对话视图' })).toBeInTheDocument();
    expect(screen.queryByTestId('chat-loading-surface')).toBeNull();
  });

  it('materialized 到路由完成前持续显示服务端接管后的会话', async () => {
    routeState.modelHint = null;
    let materialize: ((conversationId: string) => void) | undefined;
    sendMessageMock.mockImplementation((_content, options) => {
      options.onDraftCreated('draft-chat-1');
      materialize = options.onMaterialized;
      return new Promise(() => {});
    });

    const { rerender } = render(<HomeChatSurface />);
    fireEvent.click(screen.getByRole('button', { name: '首页发送' }));
    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1));

    pendingConversationState.id = 'draft-chat-1';
    pendingConversationState.byId = {
      'draft-chat-1': {
        id: 'draft-chat-1',
        title: '草稿',
        model_id: 'model-vision',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'user-draft',
            role: 'user',
            content: [{ type: 'text', id: 'draft-block', text: '你好' }],
            timestamp: 1,
          },
        ],
      },
    };
    streamState.isStreaming = true;
    streamState.conversationId = 'draft-chat-1';
    rerender(<HomeChatSurface />);
    expect(screen.getByTestId('pending-message-list')).toHaveAttribute(
      'data-message-ids',
      'user-draft'
    );

    pendingConversationState.id = null;
    pendingConversationState.byId = {
      'server-chat-1': {
        ...pendingConversationState.byId['draft-chat-1'],
        id: 'server-chat-1',
        messages: [
          {
            id: 'user-server',
            role: 'user',
            content: [{ type: 'text', id: 'server-block', text: '你好' }],
            timestamp: 1,
          },
        ],
      },
    };
    streamState.conversationId = 'server-chat-1';
    act(() => {
      materialize?.('server-chat-1');
    });

    expect(routerReplaceMock).toHaveBeenCalledWith('/chat/server-chat-1');
    expect(screen.queryByTestId('home-page')).toBeNull();
    expect(screen.getByTestId('pending-message-list')).toHaveAttribute(
      'data-message-ids',
      'user-server'
    );
  });

  it('上传已处理文件后只加入本次提问，不自动打开资料面板', async () => {
    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));

    await waitFor(() => {
      expect(useConversationFilesMock).toHaveBeenLastCalledWith(
        'pending-chat-1',
        { enabled: true, sessionKey: 'user-a' },
      );
    });
    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(1);
    expect(useConversationFilesState.refresh).toHaveBeenLastCalledWith('pending-chat-1');
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
  });

  it('新对话上传已处理文件后移除附件会删除会话资料并更新本地列表', async () => {
    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');

    fireEvent.click(screen.getByRole('button', { name: '移除资料引用' }));

    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith('file-uploaded');
    });
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-uploaded', 'pending-chat-1');
    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    });
  });

  it('发送带资料的新对话时打开资料面板并把打开意图交给落库后的会话页', async () => {
    sendMessageMock.mockImplementation((_content, options) => {
      options.onMaterialized('server-chat-1');
      return Promise.resolve();
    });

    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');

    fireEvent.click(screen.getByRole('button', { name: '发送资料提问' }));

    expect(screen.getByTestId('conversation-files-panel')).toBeInTheDocument();
    expect(sendMessageMock).toHaveBeenCalledWith(
      '解读资料',
      {
        conversationId: 'pending-chat-1',
        isDraft: true,
        onDraftCreated: expect.any(Function),
        onMaterialized: expect.any(Function),
      },
      [
        {
          fileId: 'file-uploaded',
          filename: 'uploaded.png',
          mimeType: 'image/png',
          previewUrl: '/thumb.png',
        },
      ],
    );
    expect(routerReplaceMock).toHaveBeenCalledWith('/chat/server-chat-1');
    expect(window.sessionStorage.getItem('fusion:open-files-panel:server-chat-1')).toBe('1');
  });

  it('从资料面板加入资料后发送时只传已有 fileId', async () => {
    useConversationFilesState.files = [
      createFile({
        id: 'file-existing',
        filename: '已有资料.png',
        thumbnail_url: '/existing-thumb.png',
      }),
    ];

    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByRole('button', { name: '加入资料' }));
    fireEvent.click(screen.getByRole('button', { name: '发送资料提问' }));

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      '解读资料',
      {
        conversationId: 'pending-chat-1',
        isDraft: true,
        onDraftCreated: expect.any(Function),
        onMaterialized: expect.any(Function),
      },
      [
        {
          fileId: 'file-existing',
          filename: '已有资料.png',
          mimeType: 'image/png',
          previewUrl: '/existing-thumb.png',
        },
      ],
    );
  });

  it('没有会话资料和已选资料时隐藏资料入口', async () => {
    render(<HomeChatSurface />);

    expect(screen.queryByRole('button', { name: '打开会话资料' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    expect(screen.getByRole('button', { name: '打开会话资料' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移除资料引用' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '打开会话资料' })).toBeNull();
    });
  });

  it('再次点击会话资料按钮时关闭资料面板', async () => {
    useConversationFilesState.files = [createFile({ id: 'file-existing', filename: '已有资料.png' })];

    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    expect(screen.getByTestId('conversation-files-panel')).toBeInTheDocument();

    const closeFilesPanelButton = screen.getByRole('button', { name: '关闭会话资料' });
    expect(closeFilesPanelButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(closeFilesPanelButton);
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
  });

  it('从资料面板加入的既有资料移除时只取消引用不删除资料', async () => {
    useConversationFilesState.files = [createFile({ id: 'file-existing', filename: '已有资料.png' })];

    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByRole('button', { name: '加入资料' }));
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');

    fireEvent.click(screen.getByRole('button', { name: '移除资料引用' }));

    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(useConversationFilesState.removeFile).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
  });

  it('删除资料时同步移除 composer 中的同一引用', async () => {
    useConversationFilesState.files = [createFile({ id: 'file-delete', filename: '待删除.png' })];

    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByRole('button', { name: '加入资料' }));
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');

    fireEvent.click(screen.getByRole('button', { name: '删除资料' }));

    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith('file-delete');
    });
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-delete', 'new-chat');
    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    });
  });

  it('收到全局新对话重置信号时重建输入框并清空资料引用', async () => {
    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    fireEvent.click(screen.getByRole('button', { name: '模拟失败上传' }));

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-local-upload-error', 'true');

    requestNewChatDraftReset();

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-local-upload-error', 'false');
    });
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
  });
});
