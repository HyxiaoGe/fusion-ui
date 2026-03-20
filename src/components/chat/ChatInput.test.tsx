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
        selectedModelId: null,
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
    } as any,
    dispatchMock: vi.fn(),
    useAppDispatchMock: vi.fn(),
    useAppSelectorMock: vi.fn(),
    reactReduxUseSelectorMock: vi.fn(),
    toastMock: vi.fn(),
    triggerLoginDialogMock: vi.fn(),
    uploadFilesMock: vi.fn(),
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
    startPollingFileStatusMock.mockReset();
    stopPollingFileStatusMock.mockReset();
    setReasoningEnabledMock.mockClear();
    clearFilesMock.mockClear();
    addFileIdMock.mockClear();
    updateFileStatusMock.mockClear();
    uuidMock.mockClear();
    currentState.models.models = [];
    currentState.models.selectedModelId = null;
    currentState.conversation.reasoningEnabled = false;
    currentState.conversation.byId = {};
    currentState.stream.isStreaming = false;
    currentState.fileUpload.files = {};
    currentState.fileUpload.fileIds = {};
    currentState.fileUpload.processingFiles = {};
    currentState.fileUpload.isUploading = false;
    currentState.fileUpload.uploadProgress = 0;
    currentState.auth.isAuthenticated = false;
    vi.stubGlobal('triggerLoginDialog', triggerLoginDialogMock);
  });

  it('blocks file upload button for unauthenticated users', () => {
    render(<ChatInput onSendMessage={vi.fn()} />);

    fireEvent.click(screen.getByTitle('上传文件'));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先登录后再上传文件',
        type: 'warning',
      })
    );
    expect(triggerLoginDialogMock).toHaveBeenCalledTimes(1);
  });

  it('uploads selected files and starts polling when authenticated', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          fileSupport: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue(['file-1']);

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

  it('uses the active chat model capabilities instead of a stale global selection', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-unsupported';
    currentState.models.models = [
      {
        id: 'model-unsupported',
        provider: 'qwen',
        capabilities: {
          fileSupport: false,
          deepThinking: false,
        },
      },
      {
        id: 'model-supported',
        provider: 'openai',
        capabilities: {
          fileSupport: true,
          deepThinking: false,
        },
      },
    ];
    currentState.conversation.byId = {
      'chat-1': {
        id: 'chat-1',
        model: 'model-supported',
      },
    };
    uploadFilesMock.mockResolvedValue(['file-1']);

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
          fileSupport: false,
          deepThinking: false,
        },
      },
      {
        id: 'model-supported',
        provider: 'openai',
        capabilities: {
          fileSupport: true,
          deepThinking: false,
        },
      },
    ];
    currentState.conversation.byId = {
      'chat-1': {
        id: 'chat-1',
        model: 'legacy-model',
      },
    };
    uploadFilesMock.mockResolvedValue(['file-1']);

    const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId={null} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('openai', 'model-supported', 'default-chat', [file]);
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
          fileSupport: false,
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
          fileSupport: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue(['file-1']);

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
          fileSupport: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue(['file-1']);

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

    fireEvent.click(screen.getByRole('button', { name: '移除文件 remove-me.txt' }));

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
          fileSupport: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue(['file-1']);

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
    expect(screen.getByRole('button', { name: '重试上传' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '移除文件' })).toBeTruthy();
  });

  it('retries a failed file upload from the inline action', async () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          fileSupport: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock
      .mockResolvedValueOnce(['file-1'])
      .mockResolvedValueOnce(['file-2']);

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

    fireEvent.click(screen.getByRole('button', { name: '重试上传' }));

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
          fileSupport: true,
          deepThinking: true,
        },
      },
    ];
    uploadFilesMock.mockResolvedValue(['file-1']);
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

    fireEvent.change(screen.getByPlaceholderText('输入您的问题...'), {
      target: {
        value: '带失败文件也想发送',
      },
    });

    fireEvent.click(screen.getAllByRole('button').at(-1) as HTMLElement);

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先重试或移除失败文件',
        type: 'warning',
      })
    );
  });

  it('blocks send action for unauthenticated users', () => {
    const onSendMessage = vi.fn();
    render(<ChatInput onSendMessage={onSendMessage} activeChatId="chat-1" />);

    fireEvent.change(screen.getByPlaceholderText('输入您的问题...'), {
      target: {
        value: '你好',
      },
    });

    fireEvent.click(screen.getAllByRole('button').at(-1) as HTMLElement);

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
