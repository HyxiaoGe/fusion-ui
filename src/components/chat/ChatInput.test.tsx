import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentState,
  dispatchMock,
  useAppDispatchMock,
  useAppSelectorMock,
  reactReduxUseSelectorMock,
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

describe('ChatInput', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    useAppDispatchMock.mockReturnValue(dispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector(currentState));
    reactReduxUseSelectorMock.mockImplementation(selector => selector(currentState));
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

  it('blocks file upload button for unauthenticated users', () => {
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

    fireEvent.click(screen.getByLabelText('上传文件'));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先登录后再上传文件',
        type: 'warning',
      })
    );
    expect(triggerLoginDialogMock).toHaveBeenCalledTimes(1);
  });

  it('focuses the composer when autoFocus is enabled', () => {
    render(<ChatInput onSendMessage={vi.fn()} autoFocus />);

    expect(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）')).toHaveFocus();
  });

  it('uploads selected files and starts polling when authenticated', async () => {
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
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

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
        status: 'parsing',
      });
      expect(startPollingFileStatusMock).toHaveBeenCalledWith(
        'file-1',
        'chat-1',
        dispatchMock,
        expect.any(Function)
      );
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
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-1', [file]);
      expect(onUploadComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onUploadComplete again after non-image processing finishes', async () => {
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
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(startPollingFileStatusMock).toHaveBeenCalledTimes(1);
      expect(onUploadComplete).toHaveBeenCalledTimes(1);
    });

    const onComplete = startPollingFileStatusMock.mock.calls[0][3] as (result: {
      success: boolean;
      errorMessage?: string;
    }) => void;
    await act(async () => {
      onComplete({ success: true });
    });

    expect(onUploadComplete).toHaveBeenCalledTimes(2);
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

  it('sends when only a selected conversation file is present', () => {
    currentState.auth.isAuthenticated = true;
    const onSendMessage = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        activeChatId="chat-1"
        conversationAttachments={[
          {
            source: 'conversation',
            fileId: 'file-existing',
            filename: '仅资料.pdf',
            mimetype: 'application/pdf',
            status: 'processed',
            thumbnailUrl: null,
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
        filename: '仅资料.pdf',
        mimeType: 'application/pdf',
        previewUrl: undefined,
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
            filename: '保留后端资料.pdf',
            mimetype: 'application/pdf',
            status: 'processed',
            thumbnailUrl: null,
          },
        ]}
        onRemoveConversationAttachment={onRemoveConversationAttachment}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '移除资料 保留后端资料.pdf' }));

    expect(onRemoveConversationAttachment).toHaveBeenCalledTimes(1);
    expect(onRemoveConversationAttachment).toHaveBeenCalledWith('file-existing');
    expect(deleteFileMock).not.toHaveBeenCalled();
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
    const file = new File(['hello'], 'pending.txt', { type: 'text/plain' });

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

    expect(screen.getByRole('button', { name: '上传文件' })).toBeEnabled();
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
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('list', { name: '已添加附件' })).toBeInTheDocument();
      expect(screen.getByText('hello.txt')).toBeInTheDocument();
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
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

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
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

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
    const duplicateA = new File(['hello'], 'same.txt', { type: 'text/plain', lastModified: 1 });
    const duplicateB = new File(['hello'], 'same.txt', { type: 'text/plain', lastModified: 1 });

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

  it('removes a failed file and clears its polling state', async () => {
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
    const file = new File(['hello'], 'remove-me.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(startPollingFileStatusMock).toHaveBeenCalledTimes(1);
    });

    const onComplete = startPollingFileStatusMock.mock.calls[0][3] as (result: {
      success: boolean;
      errorMessage?: string;
    }) => void;
    await act(async () => {
      onComplete({
        success: false,
        errorMessage: '文件处理失败，请重试',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '移除 remove-me.txt' }));

    expect(stopPollingFileStatusMock).toHaveBeenCalledWith('file-1');
    expect(screen.queryByText('remove-me.txt')).toBeNull();
  });

  it('shows readable retry actions when file processing fails', async () => {
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
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(startPollingFileStatusMock).toHaveBeenCalledTimes(1);
    });

    const onComplete = startPollingFileStatusMock.mock.calls[0][3] as (result: {
      success: boolean;
      errorMessage?: string;
    }) => void;

    await act(async () => {
      onComplete({
        success: false,
        errorMessage: '文件处理超时，请重试',
      });
    });

    expect(screen.getByText('文件处理超时，请重新上传')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重试上传 hello.txt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '移除 hello.txt' })).toBeTruthy();
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
      .mockResolvedValueOnce([{ file_id: 'file-1' }])
      .mockResolvedValueOnce([{ file_id: 'file-2' }]);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(startPollingFileStatusMock).toHaveBeenCalledTimes(1);
    });

    const firstComplete = startPollingFileStatusMock.mock.calls[0][3] as (result: {
      success: boolean;
      errorMessage?: string;
    }) => void;
    await act(async () => {
      firstComplete({
        success: false,
        errorMessage: '文件处理失败，请重试',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '重试上传 hello.txt' }));

    await waitFor(() => {
      expect(stopPollingFileStatusMock).toHaveBeenCalledWith('file-1');
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
    uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);
    const onSendMessage = vi.fn();

    const { container } = render(<ChatInput onSendMessage={onSendMessage} activeChatId="chat-1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(startPollingFileStatusMock).toHaveBeenCalledTimes(1);
    });

    const onComplete = startPollingFileStatusMock.mock.calls[0][3] as (result: {
      success: boolean;
      errorMessage?: string;
    }) => void;
    await act(async () => {
      onComplete({
        success: false,
        errorMessage: '文件处理失败，请重试',
      });
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

  it('allows selected non-image conversation files on text-only models', () => {
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

    expect(onSendMessage).toHaveBeenCalledWith(
      '总结资料',
      [
        {
          fileId: 'file-1',
          filename: 'notes.txt',
          mimeType: 'text/plain',
          previewUrl: undefined,
        },
      ],
      undefined
    );
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
