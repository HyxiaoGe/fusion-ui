import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentState,
  dispatchMock,
  useAppDispatchMock,
  useAppSelectorMock,
  toastMock,
  triggerLoginDialogMock,
  uploadFilesMock,
  startPollingFileStatusMock,
  setUploadingMock,
  setUploadProgressMock,
  setErrorMock,
  addFileIdMock,
  createFileWithPreviewMock,
  registerPluginMock,
} = vi.hoisted(() => {
  const action = (type: string) => vi.fn((payload?: unknown) => ({ type, payload }));

  return {
    currentState: {
      auth: {
        isAuthenticated: false,
      },
    } as any,
    dispatchMock: vi.fn(),
    useAppDispatchMock: vi.fn(),
    useAppSelectorMock: vi.fn(),
    toastMock: vi.fn(),
    triggerLoginDialogMock: vi.fn(),
    uploadFilesMock: vi.fn(),
    startPollingFileStatusMock: vi.fn(),
    setUploadingMock: action('fileUpload/setUploading'),
    setUploadProgressMock: action('fileUpload/setUploadProgress'),
    setErrorMock: action('fileUpload/setError'),
    addFileIdMock: action('fileUpload/addFileId'),
    createFileWithPreviewMock: vi.fn((file: File) => ({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: '',
    })),
    registerPluginMock: vi.fn(),
  };
});

let latestFilePondProps: any = null;

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock('@/lib/api/files', () => ({
  uploadFiles: uploadFilesMock,
}));

vi.mock('@/lib/utils/fileHelpers', () => ({
  createFileWithPreview: createFileWithPreviewMock,
}));

vi.mock('@/redux/slices/fileUploadSlice', () => ({
  addFileId: addFileIdMock,
  setError: setErrorMock,
  setUploadProgress: setUploadProgressMock,
  setUploading: setUploadingMock,
}));

vi.mock('@/lib/api/FileStatusPoller', () => ({
  startPollingFileStatus: startPollingFileStatusMock,
  stopAllPolling: vi.fn(),
  stopPollingFileStatus: vi.fn(),
}));

vi.mock('react-filepond', () => ({
  registerPlugin: registerPluginMock,
  FilePond: React.forwardRef((props: any, ref) => {
    latestFilePondProps = props;
    React.useImperativeHandle(ref, () => ({
      removeFiles: vi.fn(),
    }));

    return React.createElement(
      'div',
      { 'data-testid': 'filepond' },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
            latestFilePondProps.server.process(
              'files',
              file,
              {},
              vi.fn(),
              vi.fn(),
              vi.fn(),
              vi.fn()
            );
          },
        },
        'trigger-process'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => latestFilePondProps.onabortprocessing?.({}),
        },
        'trigger-abort'
      )
    );
  }),
}));

vi.mock('filepond-plugin-file-validate-size', () => ({ default: {} }));
vi.mock('filepond-plugin-file-validate-type', () => ({ default: {} }));
vi.mock('filepond-plugin-image-exif-orientation', () => ({ default: {} }));
vi.mock('filepond-plugin-image-preview', () => ({ default: {} }));

import FileUpload from './FileUpload';

describe('FileUpload', () => {
  beforeEach(() => {
    latestFilePondProps = null;
    dispatchMock.mockReset();
    useAppDispatchMock.mockReturnValue(dispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector(currentState));
    toastMock.mockReset();
    triggerLoginDialogMock.mockReset();
    uploadFilesMock.mockReset();
    startPollingFileStatusMock.mockReset();
    setUploadingMock.mockClear();
    setUploadProgressMock.mockClear();
    setErrorMock.mockClear();
    addFileIdMock.mockClear();
    createFileWithPreviewMock.mockClear();
    currentState.auth.isAuthenticated = false;
    vi.stubGlobal('triggerLoginDialog', triggerLoginDialogMock);
  });

  it('blocks upload processing when the user is not authenticated', () => {
    render(
      <FileUpload
        files={[]}
        onFilesChange={vi.fn()}
        provider="qwen"
        model="qwen-max"
        conversationId="chat-1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger-process' }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先登录后再上传文件',
        type: 'warning',
      })
    );
    expect(triggerLoginDialogMock).toHaveBeenCalledTimes(1);
    expect(uploadFilesMock).not.toHaveBeenCalled();
  });

  it('uploads a file, updates redux state and starts polling when authenticated', async () => {
    currentState.auth.isAuthenticated = true;
    uploadFilesMock.mockResolvedValue(['file-1']);
    startPollingFileStatusMock.mockImplementation(
      (_fileId: string, _chatId: string, _dispatch: unknown, onComplete?: (success: boolean) => void) => {
        onComplete?.(true);
      }
    );

    const onFilesChange = vi.fn();
    const onUploadComplete = vi.fn();

    render(
      <FileUpload
        files={[]}
        onFilesChange={onFilesChange}
        provider="qwen"
        model="qwen-max"
        conversationId="chat-1"
        onUploadComplete={onUploadComplete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger-process' }));

    await waitFor(() => {
      expect(uploadFilesMock).toHaveBeenCalledWith(
        'qwen',
        'qwen-max',
        'chat-1',
        [expect.objectContaining({ name: 'hello.txt' })],
        expect.any(AbortController)
      );
      expect(setUploadingMock).toHaveBeenCalledWith(true);
      expect(setUploadProgressMock).toHaveBeenCalledWith(0);
      expect(addFileIdMock).toHaveBeenCalledWith({
        chatId: 'chat-1',
        fileId: 'file-1',
        fileIndex: 0,
      });
      expect(startPollingFileStatusMock).toHaveBeenCalledWith(
        'file-1',
        'chat-1',
        dispatchMock,
        expect.any(Function)
      );
      expect(onFilesChange).toHaveBeenCalledWith([
        expect.objectContaining({
          fileId: 'file-1',
          status: 'parsing',
        }),
      ]);
      expect(onUploadComplete).toHaveBeenCalledWith(['file-1']);
    });
  });

  it('resets upload state and clears files when upload is aborted', () => {
    currentState.auth.isAuthenticated = true;
    const onFilesChange = vi.fn();

    render(
      <FileUpload
        files={[]}
        onFilesChange={onFilesChange}
        provider="qwen"
        model="qwen-max"
        conversationId="chat-1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger-abort' }));

    expect(setUploadingMock).toHaveBeenCalledWith(false);
    expect(setUploadProgressMock).toHaveBeenCalledWith(0);
    expect(onFilesChange).toHaveBeenCalledWith([]);
  });
});
