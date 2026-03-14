import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getFileStatusMock, updateFileStatusMock } = vi.hoisted(() => ({
  getFileStatusMock: vi.fn(),
  updateFileStatusMock: vi.fn((payload: unknown) => ({
    type: 'fileUpload/updateFileStatus',
    payload,
  })),
}));

vi.mock('@/lib/api/files', () => ({
  getFileStatus: getFileStatusMock,
}));

vi.mock('@/redux/slices/fileUploadSlice', () => ({
  updateFileStatus: updateFileStatusMock,
}));

import {
  FileStatusPoller,
  startPollingFileStatus,
  stopAllPolling,
  stopPollingFileStatus,
} from './FileStatusPoller';

describe('FileStatusPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getFileStatusMock.mockReset();
    updateFileStatusMock.mockClear();
  });

  afterEach(() => {
    stopAllPolling();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('dispatches processed status and completes successfully', async () => {
    const dispatch = vi.fn();
    const onComplete = vi.fn();
    getFileStatusMock.mockResolvedValue({
      status: 'processed',
      error_message: undefined,
    });

    const poller = new FileStatusPoller({
      fileId: 'file-1',
      chatId: 'chat-1',
      dispatch,
      onComplete,
    });

    poller.start();
    await vi.runAllTimersAsync();

    expect(getFileStatusMock).toHaveBeenCalledWith('file-1');
    expect(updateFileStatusMock).toHaveBeenCalledWith({
      fileId: 'file-1',
      chatId: 'chat-1',
      status: 'processed',
      errorMessage: undefined,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'fileUpload/updateFileStatus',
      payload: {
        fileId: 'file-1',
        chatId: 'chat-1',
        status: 'processed',
        errorMessage: undefined,
      },
    });
    expect(onComplete).toHaveBeenCalledWith({
      success: true,
      errorMessage: undefined,
    });
  });

  it('retries after a status lookup failure and eventually completes', async () => {
    const dispatch = vi.fn();
    const onComplete = vi.fn();
    getFileStatusMock
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        status: 'parsing',
        error_message: undefined,
      })
      .mockResolvedValueOnce({
        status: 'processed',
        error_message: undefined,
      });

    const poller = new FileStatusPoller({
      fileId: 'file-2',
      dispatch,
      onComplete,
    });

    poller.start();
    await vi.runAllTimersAsync();

    expect(getFileStatusMock).toHaveBeenCalledTimes(3);
    expect(updateFileStatusMock).toHaveBeenNthCalledWith(1, {
      fileId: 'file-2',
      chatId: undefined,
      status: 'parsing',
      errorMessage: undefined,
    });
    expect(updateFileStatusMock).toHaveBeenNthCalledWith(2, {
      fileId: 'file-2',
      chatId: undefined,
      status: 'processed',
      errorMessage: undefined,
    });
    expect(onComplete).toHaveBeenCalledWith({
      success: true,
      errorMessage: undefined,
    });
  });

  it('replaces an existing poller when the same file starts polling again', async () => {
    const firstDispatch = vi.fn();
    const secondDispatch = vi.fn();
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();

    getFileStatusMock.mockResolvedValue({
      status: 'processed',
      error_message: undefined,
    });

    startPollingFileStatus('file-3', 'chat-a', firstDispatch, firstComplete);
    startPollingFileStatus('file-3', 'chat-b', secondDispatch, secondComplete);

    await vi.runAllTimersAsync();

    expect(getFileStatusMock).toHaveBeenCalledTimes(2);
    expect(firstDispatch).toHaveBeenCalledTimes(1);
    expect(firstDispatch).toHaveBeenCalledWith({
      type: 'fileUpload/updateFileStatus',
      payload: {
        fileId: 'file-3',
        chatId: 'chat-a',
        status: 'processed',
        errorMessage: undefined,
      },
    });
    expect(firstComplete).toHaveBeenCalledWith({
      success: true,
      errorMessage: undefined,
    });
    expect(secondDispatch).toHaveBeenCalledWith({
      type: 'fileUpload/updateFileStatus',
      payload: {
        fileId: 'file-3',
        chatId: 'chat-b',
        status: 'processed',
        errorMessage: undefined,
      },
    });
    expect(secondComplete).toHaveBeenCalledWith({
      success: true,
      errorMessage: undefined,
    });
  });

  it('stops an active poller before it dispatches more updates', async () => {
    const dispatch = vi.fn();
    getFileStatusMock
      .mockResolvedValueOnce({
        status: 'parsing',
        error_message: undefined,
      })
      .mockResolvedValue({
        status: 'processed',
        error_message: undefined,
      });

    startPollingFileStatus('file-4', 'chat-4', dispatch);
    await vi.advanceTimersByTimeAsync(0);
    stopPollingFileStatus('file-4');
    await vi.runAllTimersAsync();

    expect(getFileStatusMock).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'fileUpload/updateFileStatus',
      payload: {
        fileId: 'file-4',
        chatId: 'chat-4',
        status: 'parsing',
        errorMessage: undefined,
      },
    });
  });
});
