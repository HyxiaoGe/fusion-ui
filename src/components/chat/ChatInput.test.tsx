import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  toggleReasoningMock,
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
      chat: {
        activeChatId: 'chat-1',
        reasoningEnabled: false,
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
    toggleReasoningMock: action('chat/toggleReasoning'),
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

vi.mock('@/redux/slices/chatSlice', () => ({
  toggleReasoning: toggleReasoningMock,
}));

vi.mock('@/redux/slices/fileUploadSlice', () => ({
  clearFiles: clearFilesMock,
  addFileId: addFileIdMock,
  updateFileStatus: updateFileStatusMock,
  makeSelectChatFiles: () => (state: any, chatId: string) => state.fileUpload.files[chatId] || [],
  makeSelectChatFileIds: () => (state: any, chatId: string) => state.fileUpload.fileIds[chatId] || [],
  selectFileUploadStatuses: (state: any) => Object.values(state.fileUpload.processingFiles || {}),
}));

vi.mock('@/lib/api/files', () => ({
  uploadFiles: uploadFilesMock,
}));

vi.mock('@/lib/api/FileStatusPoller', () => ({
  startPollingFileStatus: startPollingFileStatusMock,
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

vi.mock('./FileUpload', () => ({
  default: () => React.createElement('div', { 'data-testid': 'file-upload' }),
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
    toggleReasoningMock.mockClear();
    clearFilesMock.mockClear();
    addFileIdMock.mockClear();
    updateFileStatusMock.mockClear();
    uuidMock.mockClear();
    currentState.models.models = [];
    currentState.models.selectedModelId = null;
    currentState.chat.activeChatId = 'chat-1';
    currentState.chat.reasoningEnabled = false;
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
        message: '请先登录后再使用文件上传功能',
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

    const { container } = render(<ChatInput onSendMessage={vi.fn()} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith('qwen', 'model-1', 'chat-1', [file]);
      expect(updateFileStatusMock).toHaveBeenCalledWith({
        fileId: 'temp',
        chatId: 'chat-1',
        status: 'uploading',
      });
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

  it('blocks send action for unauthenticated users', () => {
    const onSendMessage = vi.fn();
    render(<ChatInput onSendMessage={onSendMessage} />);

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
