import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentState,
  dispatchMock,
  useAppDispatchMock,
  useAppSelectorMock,
  reactReduxUseSelectorMock,
  storeDispatchMock,
  toastMock,
  triggerLoginDialogMock,
  uploadFilesMock,
  deleteFileMock,
  startPollingFileStatusMock,
  stopPollingFileStatusMock,
  setReasoningEnabledMock,
  clearFilesMock,
  addFileIdMock,
  updateFileStatusMock,
  uuidMock,
} = vi.hoisted(() => {
  const action = (type: string) => vi.fn((payload?: unknown) => ({ type, payload }));
  let uuidCounter = 0;

  return {
    currentState: {
      models: {
        models: [],
        providers: [],
        selectedModelId: null,
        isLoading: false,
      },
      conversation: {
        reasoningEnabled: false,
        byId: {},
      },
      stream: {
        isStreaming: false,
      },
      fileUpload: {
        files: {},
        fileIds: {},
        processingFiles: {},
        isUploading: false,
        uploadProgress: 0,
      },
      auth: {
        isAuthenticated: false,
      },
      theme: {
        mode: 'light',
      },
    } as any,
    dispatchMock: vi.fn(),
    useAppDispatchMock: vi.fn(),
    useAppSelectorMock: vi.fn(),
    reactReduxUseSelectorMock: vi.fn(),
    storeDispatchMock: vi.fn(),
    toastMock: vi.fn(),
    triggerLoginDialogMock: vi.fn(),
    uploadFilesMock: vi.fn(),
    deleteFileMock: vi.fn(() => Promise.resolve()),
    startPollingFileStatusMock: vi.fn(),
    stopPollingFileStatusMock: vi.fn(),
    setReasoningEnabledMock: action('conversation/setReasoningEnabled'),
    clearFilesMock: action('fileUpload/clearFiles'),
    addFileIdMock: action('fileUpload/addFileId'),
    updateFileStatusMock: action('fileUpload/updateFileStatus'),
    uuidMock: vi.fn(() => `uuid-${++uuidCounter}`),
  };
});

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
  useAppSelector: useAppSelectorMock,
}));

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useSelector: reactReduxUseSelectorMock,
    useStore: () => ({
      dispatch: storeDispatchMock,
      getState: () => currentState,
    }),
  };
});

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock('@/redux/slices/conversationSlice', () => ({
  setReasoningEnabled: setReasoningEnabledMock,
}));

vi.mock('@/redux/slices/fileUploadSlice', () => ({
  clearFiles: clearFilesMock,
  addFileId: addFileIdMock,
  updateFileStatus: updateFileStatusMock,
  makeSelectChatFileIds: () => (state: any, chatId: string) => state.fileUpload.fileIds[chatId] || [],
  removeFileId: vi.fn((payload?: unknown) => ({ type: 'fileUpload/removeFileId', payload })),
}));

vi.mock('@/lib/api/files', () => ({
  uploadFiles: uploadFilesMock,
  deleteFile: deleteFileMock,
}));

vi.mock('@/lib/api/FileStatusPoller', () => ({
  startPollingFileStatus: startPollingFileStatusMock,
  stopPollingFileStatus: stopPollingFileStatusMock,
}));

vi.mock('@/lib/utils/fileHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/fileHelpers')>('@/lib/utils/fileHelpers');
  return {
    ...actual,
    createFileWithPreview: vi.fn((file: File) => ({
      ...file,
      preview: '',
    })),
  };
});

vi.mock('uuid', () => ({
  v4: uuidMock,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/image', () => ({
  default: function MockNextImage({ alt = '', ...props }: any) {
    // 测试环境只需要普通 img 承载 next/image props
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} {...props} />;
  },
}));

vi.mock('./FilePreviewList', () => ({
  default: () => null,
}));

import ChatInput from './ChatInput';

function configureAuthenticatedVisionModel(userId = 'user-a') {
  currentState.auth.isAuthenticated = true;
  currentState.auth.user = { id: userId };
  currentState.auth.token = `token-${userId}`;
  currentState.models.selectedModelId = 'model-1';
  currentState.models.models = [
    {
      id: 'model-1',
      provider: 'qwen',
      capabilities: {
        vision: true,
        deepThinking: true,
      },
    },
  ];
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('ChatInput', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    useAppDispatchMock.mockReturnValue(dispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector(currentState));
    reactReduxUseSelectorMock.mockImplementation(selector => selector(currentState));
    storeDispatchMock.mockReset();
    storeDispatchMock.mockImplementation((action: { type?: string; payload?: unknown }) => {
      if (action.type === 'auth/logout') {
        Object.assign(currentState.auth, { isAuthenticated: false, user: null, token: null });
      } else if (action.type === 'auth/testSwitch') {
        const userId = String(action.payload);
        Object.assign(currentState.auth, {
          isAuthenticated: true,
          user: { id: userId },
          token: `token-${userId}`,
        });
      }
      return action;
    });
    toastMock.mockReset();
    triggerLoginDialogMock.mockReset();
    uploadFilesMock.mockReset();
    deleteFileMock.mockClear();
    startPollingFileStatusMock.mockReset();
    stopPollingFileStatusMock.mockReset();
    setReasoningEnabledMock.mockClear();
    clearFilesMock.mockClear();
    addFileIdMock.mockClear();
    updateFileStatusMock.mockClear();
    uuidMock.mockClear();
    currentState.models.models = [];
    currentState.models.providers = [];
    currentState.models.selectedModelId = null;
    currentState.models.isLoading = false;
    currentState.conversation.reasoningEnabled = false;
    currentState.conversation.byId = {};
    currentState.stream.isStreaming = false;
    currentState.fileUpload.files = {};
    currentState.fileUpload.fileIds = {};
    currentState.fileUpload.processingFiles = {};
    currentState.fileUpload.isUploading = false;
    currentState.fileUpload.uploadProgress = 0;
    currentState.auth.isAuthenticated = false;
    currentState.auth.user = null;
    currentState.auth.token = null;
    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: vi.fn(() => 'blob:preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('triggerLoginDialog', triggerLoginDialogMock);
  });

  it('blocks image upload button for unauthenticated users', () => {
    // 即使有可用模型，未登录用户点击上传按钮也应当被拦截并提示登录
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: { vision: true, deepThinking: true },
      },
    ];

    render(<ChatInput onSendMessage={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('上传图片'));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先登录后再上传图片',
        type: 'warning',
      })
    );
    expect(triggerLoginDialogMock).toHaveBeenCalledTimes(1);
  });

  it('focuses the composer when autoFocus is enabled', () => {
    render(<ChatInput onSendMessage={vi.fn()} autoFocus />);

    expect(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）')).toHaveFocus();
  });

  it('rejects selected non-image files while file conversation is paused', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '当前仅支持上传图片，文件对话后续开放',
          type: 'warning',
        }),
      );
    });
    expect(uploadFilesMock).not.toHaveBeenCalled();
    expect(screen.queryByText('hello.txt')).toBeNull();
  });

  it('uploads selected images and marks them processed when authenticated', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'diagram.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-1', [file]);
      expect(addFileIdMock).toHaveBeenCalledWith({
        chatId: 'chat-1',
        fileId: 'file-1',
        fileIndex: 0,
      });
      expect(updateFileStatusMock).toHaveBeenCalledWith({
        fileId: 'file-1',
        chatId: 'chat-1',
        status: 'processed',
      });
      expect(startPollingFileStatusMock).not.toHaveBeenCalled();
    });
  });

  it('calls onUploadComplete after local upload succeeds', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);
    const onUploadComplete = vi.fn();

    const { container } = render(
      <ChatInput onSendMessage={vi.fn()} onUploadComplete={onUploadComplete} activeChatId="chat-1" />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'diagram.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-1', [file]);
      expect(onUploadComplete).toHaveBeenCalledTimes(1);
      expect(onUploadComplete).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            fileId: 'file-1',
            filename: 'diagram.png',
            mimetype: 'image/png',
            size: file.size,
            status: 'processed',
          }),
        ],
        'chat-1'
      );
    });
  });


  it('turns processed existing-chat uploads into conversation references before sending', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1', thumbnail_url: '/thumb.png' }]);
    const onSendMessage = vi.fn();

    function Harness() {
      const [attachments, setAttachments] = React.useState<any[]>([]);

      return (
        <ChatInput
          onSendMessage={onSendMessage}
          activeChatId="chat-1"
          conversationAttachments={attachments}
          onUploadComplete={(files = []) => {
            setAttachments((current) => [
              ...current,
              ...files
                .filter((file) => file.status === 'processed')
                .map((file) => ({
                  source: 'conversation',
                  fileId: file.fileId,
                  filename: file.filename,
                  mimetype: file.mimetype,
                  status: 'processed',
                  thumbnailUrl: file.thumbnailUrl,
                })),
            ]);
          }}
        />
      );
    }

    const { container } = render(<Harness />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'diagram.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '移除资料 diagram.png' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '移除 diagram.png' })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '分析这张图',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(onSendMessage).toHaveBeenCalledWith(
      '分析这张图',
      [
        {
          fileId: 'file-1',
          filename: 'diagram.png',
          mimeType: 'image/png',
          previewUrl: '/thumb.png',
        },
      ],
      undefined
    );
    expect(uploadFilesMock).toHaveBeenCalledTimes(1);
  });

  it('turns processed new-chat uploads into a single conversation reference before sending', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1', thumbnail_url: '/thumb.png' }]);
    const onSendMessage = vi.fn();

    function Harness() {
      const [attachments, setAttachments] = React.useState<any[]>([]);

      return (
        <ChatInput
          onSendMessage={onSendMessage}
          activeChatId={null}
          conversationAttachments={attachments}
          onUploadComplete={(files = []) => {
            setAttachments((current) => [
              ...current,
              ...files
                .filter((file) => file.status === 'processed')
                .map((file) => ({
                  source: 'conversation',
                  fileId: file.fileId,
                  filename: file.filename,
                  mimetype: file.mimetype,
                  status: 'processed',
                  thumbnailUrl: file.thumbnailUrl,
                })),
            ]);
          }}
        />
      );
    }

    const { container } = render(<Harness />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'diagram.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '移除资料 diagram.png' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '移除 diagram.png' })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '分析这张图',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(onSendMessage).toHaveBeenCalledWith(
      '分析这张图',
      [
        {
          fileId: 'file-1',
          filename: 'diagram.png',
          mimeType: 'image/png',
          previewUrl: '/thumb.png',
        },
      ],
      expect.stringMatching(/^uuid-/)
    );
    expect(uploadFilesMock).toHaveBeenCalledTimes(1);
  });

  it('sends selected conversation files without uploading them again', () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    const onSendMessage = vi.fn();
    const onClearConversationAttachments = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        activeChatId="chat-1"
        conversationAttachments={[
          {
            source: 'conversation',
            fileId: 'file-existing',
            filename: '已有资料.png',
            mimetype: 'image/png',
            status: 'processed',
            thumbnailUrl: 'https://cdn.example.com/existing-thumb.png',
          },
        ]}
        onClearConversationAttachments={onClearConversationAttachments}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '请总结这份资料',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(uploadFilesMock).not.toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][0]).toBe('请总结这份资料');
    expect(onSendMessage.mock.calls[0][1]).toEqual([
      {
        fileId: 'file-existing',
        filename: '已有资料.png',
        mimeType: 'image/png',
        previewUrl: 'https://cdn.example.com/existing-thumb.png',
      },
    ]);
    expect(onClearConversationAttachments).toHaveBeenCalledTimes(1);
  });

  it('sends when only a selected conversation image is present', () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    const onSendMessage = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        activeChatId="chat-1"
        conversationAttachments={[
          {
            source: 'conversation',
            fileId: 'file-existing',
            filename: '仅资料.png',
            mimetype: 'image/png',
            status: 'processed',
            thumbnailUrl: '/thumb.png',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][0]).toBe('');
    expect(onSendMessage.mock.calls[0][1]).toEqual([
      {
        fileId: 'file-existing',
        filename: '仅资料.png',
        mimeType: 'image/png',
        previewUrl: '/thumb.png',
      },
    ]);
  });

  it('removes selected conversation file from composer without deleting backend file', () => {
    currentState.auth.isAuthenticated = true;
    const onRemoveConversationAttachment = vi.fn();

    render(
      <ChatInput
        onSendMessage={vi.fn()}
        activeChatId="chat-1"
        conversationAttachments={[
          {
            source: 'conversation',
            fileId: 'file-existing',
            filename: '保留后端资料.png',
            mimetype: 'image/png',
            status: 'processed',
            thumbnailUrl: '/thumb.png',
          },
        ]}
        onRemoveConversationAttachment={onRemoveConversationAttachment}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '移除资料 保留后端资料.png' }));

    expect(onRemoveConversationAttachment).toHaveBeenCalledTimes(1);
    expect(onRemoveConversationAttachment).toHaveBeenCalledWith('file-existing');
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('ignores a completed upload result after the user removes the in-flight attachment', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    let resolveUpload: (value: Array<{ file_id: string; thumbnail_url?: string }>) => void = () => {};
    uploadFilesMock.mockImplementation(
      () =>
        new Promise<Array<{ file_id: string; thumbnail_url?: string }>>((resolve) => {
          resolveUpload = resolve;
        })
    );
    const onUploadComplete = vi.fn();

    const { container } = render(
      <ChatInput onSendMessage={vi.fn()} onUploadComplete={onUploadComplete} activeChatId="chat-1" />
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'cancel-me.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-1', [file]);
      expect(screen.getByRole('button', { name: '移除 cancel-me.png' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '移除 cancel-me.png' }));
    expect(screen.queryByText('cancel-me.png')).toBeNull();

    await act(async () => {
      resolveUpload([{ file_id: 'file-cancelled', thumbnail_url: '/cancelled-thumb.png' }]);
    });

    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(addFileIdMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-cancelled',
      })
    );
    expect(updateFileStatusMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-cancelled',
      })
    );
    expect(deleteFileMock).toHaveBeenCalledWith('file-cancelled');
  });

  it('does not surface an upload failure after the user removes the in-flight attachment', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    let rejectUpload: (reason?: unknown) => void = () => {};
    uploadFilesMock.mockImplementation(
      () =>
        new Promise<Array<{ file_id: string }>>((_resolve, reject) => {
          rejectUpload = reject;
        })
    );

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'abort-me.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-1', [file]);
      expect(screen.getByRole('button', { name: '移除 abort-me.png' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '移除 abort-me.png' }));

    await act(async () => {
      rejectUpload(new Error('signal is aborted without reason'));
    });

    expect(screen.queryByText('abort-me.png')).toBeNull();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('allows the same file to be uploaded again after cancelling the first in-flight upload', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    const uploadResolvers: Array<(value: Array<{ file_id: string; thumbnail_url?: string }>) => void> = [];
    uploadFilesMock.mockImplementation(
      () =>
        new Promise<Array<{ file_id: string; thumbnail_url?: string }>>((resolve) => {
          uploadResolvers.push(resolve);
        })
    );
    const onUploadComplete = vi.fn();

    const { container } = render(
      <ChatInput onSendMessage={vi.fn()} onUploadComplete={onUploadComplete} activeChatId="chat-1" />
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'retry-after-cancel.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '移除 retry-after-cancel.png' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '移除 retry-after-cancel.png' }));
    await waitFor(() => {
      expect(screen.queryByText('retry-after-cancel.png')).toBeNull();
    });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: '移除 retry-after-cancel.png' })).toBeInTheDocument();
    });

    await act(async () => {
      uploadResolvers[1]([{ file_id: 'file-second', thumbnail_url: '/second-thumb.png' }]);
    });

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledTimes(1);
      expect(onUploadComplete).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            fileId: 'file-second',
            filename: 'retry-after-cancel.png',
            mimetype: 'image/png',
            thumbnailUrl: '/second-thumb.png',
            status: 'processed',
          }),
        ],
        'chat-1'
      );
    });

    await act(async () => {
      uploadResolvers[0]([{ file_id: 'file-first', thumbnail_url: '/first-thumb.png' }]);
    });

    expect(onUploadComplete).toHaveBeenCalledTimes(1);
    expect(addFileIdMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-first',
      })
    );
    expect(deleteFileMock).toHaveBeenCalledWith('file-first');
  });

  it('ignores an upload result when reset switches to another chat before it resolves', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    let resolveUpload: (value: Array<{ file_id: string }>) => void = () => {};
    uploadFilesMock.mockImplementation(
      () =>
        new Promise<Array<{ file_id: string }>>((resolve) => {
          resolveUpload = resolve;
        })
    );

    const { container, rerender } = render(
      <ChatInput onSendMessage={vi.fn()} activeChatId="chat-a" resetSignal="chat-a" />
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'pending.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-a', [file]);
    });

    rerender(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-b" resetSignal="chat-b" />);
    addFileIdMock.mockClear();
    updateFileStatusMock.mockClear();
    startPollingFileStatusMock.mockClear();

    await act(async () => {
      resolveUpload([{ file_id: 'file-stale' }]);
    });

    expect(addFileIdMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-a',
      })
    );
    expect(updateFileStatusMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-a',
      })
    );
    expect(startPollingFileStatusMock).not.toHaveBeenCalledWith(
      'file-stale',
      'chat-a',
      expect.anything(),
      expect.anything()
    );
  });

  it.each([
    ['logout', { isAuthenticated: false, user: null, token: null }],
    ['A→B', { isAuthenticated: true, user: { id: 'user-b' }, token: 'token-user-b' }],
  ])('invalidates a pending upload on auth %s and never carries the attachment forward', async (_label, nextAuth) => {
    configureAuthenticatedVisionModel('user-a');
    const uploadRequest = createDeferred<Array<{ file_id: string; thumbnail_url?: string }>>();
    uploadFilesMock.mockReturnValue(uploadRequest.promise);
    const onUploadComplete = vi.fn();
    const onClearConversationAttachments = vi.fn();
    const onSendMessage = vi.fn();

    const { container, rerender } = render(
      <ChatInput
        onSendMessage={onSendMessage}
        onUploadComplete={onUploadComplete}
        onClearConversationAttachments={onClearConversationAttachments}
        activeChatId="chat-a"
      />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'user-a.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-a', [file]);
      expect(screen.getByText('user-a.png')).toBeInTheDocument();
    });

    Object.assign(currentState.auth, nextAuth);
    rerender(
      <ChatInput
        onSendMessage={onSendMessage}
        onUploadComplete={onUploadComplete}
        onClearConversationAttachments={onClearConversationAttachments}
        activeChatId="chat-a"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('user-a.png')).toBeNull();
      expect(onClearConversationAttachments).toHaveBeenCalled();
      expect(clearFilesMock).toHaveBeenCalledWith('chat-a');
    });
    addFileIdMock.mockClear();
    updateFileStatusMock.mockClear();
    startPollingFileStatusMock.mockClear();
    toastMock.mockClear();

    await act(async () => {
      uploadRequest.resolve([{ file_id: 'file-user-a', thumbnail_url: '/user-a.png' }]);
      await uploadRequest.promise;
    });

    expect(deleteFileMock).toHaveBeenCalledWith('file-user-a');
    expect(addFileIdMock).not.toHaveBeenCalled();
    expect(updateFileStatusMock).not.toHaveBeenCalled();
    expect(startPollingFileStatusMock).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('user-a.png')).toBeNull();
  });

  it.each([
    ['logout', { type: 'auth/logout' }],
    ['A→B', { type: 'auth/testSwitch', payload: 'user-b' }],
  ])('reads store identity after auth %s even before React rerender commits', async (_label, authAction) => {
    configureAuthenticatedVisionModel('user-a');
    const uploadRequest = createDeferred<Array<{ file_id: string }>>();
    uploadFilesMock.mockReturnValue(uploadRequest.promise);
    const onUploadComplete = vi.fn();

    const { container } = render(
      <ChatInput onSendMessage={vi.fn()} onUploadComplete={onUploadComplete} activeChatId="chat-a" />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'store-window.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      storeDispatchMock(authAction);
    });
    addFileIdMock.mockClear();
    updateFileStatusMock.mockClear();
    startPollingFileStatusMock.mockClear();
    toastMock.mockClear();

    await act(async () => {
      uploadRequest.resolve([{ file_id: 'file-store-window' }]);
      await uploadRequest.promise;
    });

    expect(deleteFileMock).toHaveBeenCalledWith('file-store-window');
    expect(addFileIdMock).not.toHaveBeenCalled();
    expect(updateFileStatusMock).not.toHaveBeenCalled();
    expect(startPollingFileStatusMock).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('invalidates a pending upload on unmount and best-effort deletes a late file_id', async () => {
    configureAuthenticatedVisionModel('user-a');
    const uploadRequest = createDeferred<Array<{ file_id: string }>>();
    uploadFilesMock.mockReturnValue(uploadRequest.promise);
    const onUploadComplete = vi.fn();

    const { container, unmount } = render(
      <ChatInput onSendMessage={vi.fn()} onUploadComplete={onUploadComplete} activeChatId="chat-a" />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'unmount.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-a', [file]);
    });

    unmount();
    addFileIdMock.mockClear();
    updateFileStatusMock.mockClear();
    startPollingFileStatusMock.mockClear();
    toastMock.mockClear();

    await act(async () => {
      uploadRequest.resolve([{ file_id: 'file-after-unmount' }]);
      await uploadRequest.promise;
    });

    expect(deleteFileMock).toHaveBeenCalledWith('file-after-unmount');
    expect(addFileIdMock).not.toHaveBeenCalled();
    expect(updateFileStatusMock).not.toHaveBeenCalled();
    expect(startPollingFileStatusMock).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('drops a late upload rejection after logout without local error or toast', async () => {
    configureAuthenticatedVisionModel('user-a');
    const uploadRequest = createDeferred<Array<{ file_id: string }>>();
    uploadFilesMock.mockReturnValue(uploadRequest.promise);

    const { container, rerender } = render(
      <ChatInput onSendMessage={vi.fn()} activeChatId="chat-a" />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'logout-error.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledTimes(1);
    });

    Object.assign(currentState.auth, { isAuthenticated: false, user: null, token: null });
    rerender(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-a" />);
    toastMock.mockClear();

    await act(async () => {
      uploadRequest.reject(new Error('上传失败'));
      await uploadRequest.promise.catch(() => undefined);
    });

    expect(screen.queryByText('logout-error.png')).toBeNull();
    expect(screen.queryByText('上传失败')).toBeNull();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('stops polling on auth switch and rejects a late poll callback before any producer side effect', async () => {
    configureAuthenticatedVisionModel('user-a');
    const uploadRequest = createDeferred<Array<{ file_id: string }>>();
    uploadFilesMock.mockReturnValue(uploadRequest.promise);

    const { container, rerender } = render(
      <ChatInput onSendMessage={vi.fn()} activeChatId="chat-a" />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'polling.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledTimes(1);
    });
    Object.defineProperty(file, 'type', {
      configurable: true,
      value: 'application/pdf',
    });

    await act(async () => {
      uploadRequest.resolve([{ file_id: 'file-polling' }]);
      await uploadRequest.promise;
    });
    await waitFor(() => {
      expect(startPollingFileStatusMock).toHaveBeenCalledTimes(1);
    });
    const pollCallback = startPollingFileStatusMock.mock.calls[0][3];
    const isProducerActive = startPollingFileStatusMock.mock.calls[0][4];
    expect(isProducerActive()).toBe(true);

    Object.assign(currentState.auth, {
      isAuthenticated: true,
      user: { id: 'user-b' },
      token: 'token-user-b',
    });
    rerender(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-a" />);

    expect(isProducerActive()).toBe(false);
    expect(stopPollingFileStatusMock).toHaveBeenCalledWith('file-polling');
    expect(deleteFileMock).toHaveBeenCalledWith('file-polling');
    updateFileStatusMock.mockClear();
    toastMock.mockClear();

    act(() => {
      pollCallback({ success: true });
    });

    expect(updateFileStatusMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.queryByText('polling.png')).toBeNull();
  });

  it('uses stable accessible actions for upload, reasoning, send and stop', () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    const onSendMessage = vi.fn();
    const onStopStreaming = vi.fn();

    const { rerender } = render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStopStreaming={onStopStreaming}
        activeChatId="chat-1"
      />,
    );

    expect(screen.getByRole('button', { name: '上传图片' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '思考模式' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '思考模式' }));
    expect(setReasoningEnabledMock).toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '你好',
      },
    });

    expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    expect(onSendMessage).toHaveBeenCalledWith('你好');

    currentState.conversation.reasoningEnabled = true;
    rerender(
      <ChatInput
        onSendMessage={onSendMessage}
        onStopStreaming={onStopStreaming}
        activeChatId="chat-1"
      />,
    );

    expect(screen.getByRole('button', { name: '思考模式' })).toHaveAttribute('aria-pressed', 'true');

    currentState.stream.isStreaming = true;
    rerender(
      <ChatInput
        onSendMessage={onSendMessage}
        onStopStreaming={onStopStreaming}
        activeChatId="chat-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
    expect(onStopStreaming).toHaveBeenCalledTimes(1);

    onSendMessage.mockClear();
    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: { value: '不应在生成中发送' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      key: 'Enter',
      code: 'Enter',
    });
    expect(onStopStreaming).toHaveBeenCalledTimes(2);
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('renders composer as a structured input panel with toolbar and attachment status area', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const panel = screen.getByRole('group', { name: '消息输入区' });
    expect(panel.className).toContain('rounded-xl');
    expect(screen.getByRole('toolbar', { name: '消息工具栏' })).toBeInTheDocument();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'hello.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('list', { name: '已添加附件' })).toBeInTheDocument();
      expect(screen.getByText('hello.png')).toBeInTheDocument();
    });
  });

  it('uses the active chat model capabilities instead of a stale global selection', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-unsupported';
    currentState.models.models = [
      {
        id: 'model-unsupported',
        provider: 'qwen',
        capabilities: {
          vision: false,
          deepThinking: false,
        },
      },
      {
        id: 'model-supported',
        provider: 'openai',
        capabilities: {
          vision: true,
          deepThinking: false,
        },
      },
    ];
    currentState.conversation.byId = {
      'chat-1': {
        id: 'chat-1',
        model_id: 'model-supported',
      },
    };
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'hello.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('openai', 'model-supported', 'chat-1', [file]);
    });

    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: '当前选择的模型不支持文件上传功能',
      })
    );
  });

  it('uses the selected model when new-chat mode explicitly clears the active chat', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-supported';
    currentState.models.models = [
      {
        id: 'legacy-model',
        provider: 'qwen',
        capabilities: {
          vision: false,
          deepThinking: false,
        },
      },
      {
        id: 'model-supported',
        provider: 'openai',
        capabilities: {
          vision: true,
          deepThinking: false,
        },
      },
    ];
    currentState.conversation.byId = {
      'chat-1': {
        id: 'chat-1',
        model_id: 'legacy-model',
      },
    };
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId={null} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'hello.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      // 无 activeChatId 时回退到 pendingChatIdRef.current（由 uuidMock 生成）
      expect(uploadFilesMock).toHaveBeenCalledWith('openai', 'model-supported', expect.stringMatching(/^uuid-/), [file]);
    });
  });

  it('blocks the composer when the current selected model is unavailable', () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'legacy-model';
    currentState.models.models = [
      {
        id: 'legacy-model',
        provider: 'qwen',
        enabled: false,
        capabilities: {
          vision: false,
          deepThinking: false,
        },
      },
    ];

    render(<ChatInput onSendMessage={vi.fn()} />);

    expect(screen.getByPlaceholderText('当前会话模型不可用，请新建会话后继续')).toBeTruthy();
    expect(screen.getByText('当前会话绑定的模型已不可用。请新建会话后切换到可用模型再继续聊天。')).toBeTruthy();
  });

  it('skips duplicate files in the same batch and warns the user', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const duplicateA = new File(['image'], 'same.png', { type: 'image/png', lastModified: 1 });
    const duplicateB = new File(['image'], 'same.png', { type: 'image/png', lastModified: 1 });

    fireEvent.change(fileInput, {
      target: {
        files: [duplicateA, duplicateB],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-1', [duplicateA]);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '已跳过重复文件',
        type: 'warning',
      })
    );
  });

  it('removes a failed image upload', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockRejectedValue(new Error('文件处理失败，请重试'));

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'remove-me.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '移除 remove-me.png' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '移除 remove-me.png' }));

    expect(stopPollingFileStatusMock).not.toHaveBeenCalled();
    expect(screen.queryByText('remove-me.png')).toBeNull();
  });

  it('shows readable retry actions when image upload fails', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockRejectedValue(new Error('文件上传超时，请重试'));

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'hello.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('文件处理超时，请重新上传')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '重试上传 hello.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '移除 hello.png' })).toBeTruthy();
  });

  it('retries a failed file upload from the inline action', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock
      .mockRejectedValueOnce(new Error('文件处理失败，请重试'))
      .mockResolvedValueOnce([{ file_id: 'file-2' }]);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'hello.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重试上传 hello.png' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '重试上传 hello.png' }));

    await waitFor(() => {
      expect(stopPollingFileStatusMock).not.toHaveBeenCalled();
      expect(uploadFilesMock).toHaveBeenCalledTimes(2);
      expect(uploadFilesMock).toHaveBeenLastCalledWith('qwen', 'model-1', 'chat-1', [file]);
      expect(addFileIdMock).toHaveBeenLastCalledWith({
        chatId: 'chat-1',
        fileId: 'file-2',
        fileIndex: 0,
      });
    });
  });

  it('blocks sending when failed files still need attention', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockRejectedValue(new Error('文件处理失败，请重试'));
    const onSendMessage = vi.fn();

    const { container } = render(<ChatInput onSendMessage={onSendMessage} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'hello.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重试上传 hello.png' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '带失败文件也想发送',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先重试或移除失败文件',
        type: 'warning',
      })
    );
  });

  it('blocks selected conversation images when the current model has no vision', () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'text-model';
    currentState.models.models = [
      {
        id: 'text-model',
        provider: 'qwen',
        capabilities: {
          vision: false,
          deepThinking: false,
        },
      },
    ];
    const onSendMessage = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        activeChatId="chat-1"
        conversationAttachments={[
          {
            source: 'conversation',
            fileId: 'file-1',
            filename: 'diagram.png',
            mimetype: 'image/png',
            status: 'processed',
            thumbnailUrl: '/thumb.png',
          },
        ]}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '分析图片',
      },
    });

    expect(screen.getByText('当前模型不支持图片理解，请切换到支持读图的模型或移除图片资料')).toBeTruthy();
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled();

    fireEvent.keyDown(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      key: 'Enter',
      code: 'Enter',
    });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('blocks Enter sending for uploaded images after switching to a text-only model', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'vision-model';
    currentState.models.models = [
      {
        id: 'vision-model',
        provider: 'qwen',
        capabilities: {
          vision: true,
          deepThinking: false,
        },
      },
      {
        id: 'text-model',
        provider: 'qwen',
        capabilities: {
          vision: false,
          deepThinking: false,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1', thumbnail_url: '/thumb.png' }]);
    const onSendMessage = vi.fn();

    const { container, rerender } = render(<ChatInput onSendMessage={onSendMessage} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'diagram.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'vision-model', 'chat-1', [file]);
      expect(screen.getByText('diagram.png')).toBeTruthy();
    });

    currentState.models.selectedModelId = 'text-model';
    rerender(<ChatInput onSendMessage={onSendMessage} activeChatId="chat-1" />);

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '分析图片',
      },
    });

    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled();
    fireEvent.keyDown(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      key: 'Enter',
      code: 'Enter',
    });

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '当前模型不支持图片理解，请切换到支持读图的模型或移除图片资料',
        type: 'warning',
      })
    );
  });

  it('ignores stale non-image conversation files and sends only text', () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'text-model';
    currentState.models.models = [
      {
        id: 'text-model',
        provider: 'qwen',
        capabilities: {
          vision: false,
          deepThinking: false,
        },
      },
    ];
    const onSendMessage = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        activeChatId="chat-1"
        conversationAttachments={[
          {
            source: 'conversation',
            fileId: 'file-1',
            filename: 'notes.txt',
            mimetype: 'text/plain',
            status: 'processed',
          },
        ]}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '总结资料',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(onSendMessage).toHaveBeenCalledWith('总结资料');
  });

  it('blocks send action for unauthenticated users', () => {
    const onSendMessage = vi.fn();
    render(<ChatInput onSendMessage={onSendMessage} activeChatId="chat-1" />);

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: {
        value: '你好',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先登录后再发送消息',
        type: 'warning',
      })
    );
    expect(triggerLoginDialogMock).toHaveBeenCalledTimes(1);
  });
});
