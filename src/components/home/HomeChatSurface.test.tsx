import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dispatchMock,
  routerPushMock,
  routerReplaceMock,
  sendMessageMock,
  useConversationFilesMock,
  useConversationFilesState,
  deleteFileMock,
  chatInputRenderMock,
  modelState,
  routeState,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  sendMessageMock: vi.fn(),
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
    modelHint: 'model-vision',
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
        byId: {},
        reasoningEnabled: false,
      },
      stream: {
        isStreaming: false,
      },
      fileUpload: {
        files: {},
        fileIds: {},
        processingFiles: {},
      },
      auth: {
        isAuthenticated: true,
      },
    }),
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  setSelectedModel: vi.fn((payload?: unknown) => ({ type: 'models/setSelectedModel', payload })),
}));

vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: sendMessageMock,
  }),
}));

vi.mock('@/hooks/useConversationFiles', () => ({
  useConversationFiles: (conversationId: string | null) => {
    useConversationFilesMock(conversationId);
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
      >
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
    useConversationFilesMock.mockClear();
    useConversationFilesState.files = [];
    useConversationFilesState.isLoading = false;
    useConversationFilesState.error = null;
    useConversationFilesState.refresh.mockClear();
    useConversationFilesState.removeFile.mockClear();
    deleteFileMock.mockReset();
    deleteFileMock.mockResolvedValue(undefined);
    chatInputRenderMock.mockClear();
    routeState.pathname = '/chat/new';
    routeState.modelHint = 'model-vision';
    window.sessionStorage.clear();
  });

  it('上传已处理文件后只加入本次提问，不自动打开资料面板', async () => {
    render(<HomeChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));

    await waitFor(() => {
      expect(useConversationFilesMock).toHaveBeenLastCalledWith('pending-chat-1');
    });
    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
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
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-delete');
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
