import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConversationMock, buildChatFromServerConversationMock } = vi.hoisted(() => ({
  getConversationMock: vi.fn(),
  buildChatFromServerConversationMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  getConversation: getConversationMock,
}));

vi.mock('./conversationHydration', () => ({
  buildChatFromServerConversation: buildChatFromServerConversationMock,
}));

import {
  getConversationDetailRequestMetadata,
  invalidateAllConversationDetails,
  invalidateConversationDetail,
  isStaleConversationDetailRequestError,
  loadConversationDetail,
  resetConversationDetailResource,
} from './conversationDetailResource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('conversationDetailResource', () => {
  beforeEach(() => {
    resetConversationDetailResource();
    getConversationMock.mockReset();
    buildChatFromServerConversationMock.mockReset();
    buildChatFromServerConversationMock.mockImplementation((data) => data);
  });

  it('hover 请求未完成时路由水合复用同一个 GET', async () => {
    const pending = deferred<any>();
    getConversationMock.mockReturnValue(pending.promise);

    const hoverPromise = loadConversationDetail('chat-a');
    const routePromise = loadConversationDetail('chat-a');

    expect(routePromise).toBe(hoverPromise);
    expect(getConversationMock).toHaveBeenCalledTimes(1);

    pending.resolve({ id: 'chat-a', messages: [] });
    await expect(routePromise).resolves.toEqual({ id: 'chat-a', messages: [] });
  });

  it('共享请求始终携带首个真实 GET 开始时的统一元数据快照', async () => {
    const pending = deferred<any>();
    getConversationMock.mockReturnValue(pending.promise);
    const firstMetadata = {
      title: '旧标题',
      model_id: 'model-old',
      updatedAt: 1,
      messageSignatures: {},
    };
    const hoverPromise = loadConversationDetail('chat-a', { requestMetadata: firstMetadata });
    const routePromise = loadConversationDetail('chat-a', {
      requestMetadata: {
        title: '本地新标题',
        model_id: 'model-new',
        updatedAt: 2,
        messageSignatures: {},
      },
    });

    expect(routePromise).toBe(hoverPromise);
    expect(getConversationDetailRequestMetadata(routePromise)).toEqual(firstMetadata);

    pending.resolve({ id: 'chat-a', messages: [] });
    await routePromise;
  });

  it('失败后清理 singleflight 以便后续重试', async () => {
    getConversationMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ id: 'chat-a', messages: [] });

    await expect(loadConversationDetail('chat-a')).rejects.toThrow('temporary failure');
    await expect(loadConversationDetail('chat-a')).resolves.toEqual({ id: 'chat-a', messages: [] });

    expect(getConversationMock).toHaveBeenCalledTimes(2);
  });

  it('删除会话使尚未完成的详情请求失效且不能复活旧数据', async () => {
    const pending = deferred<any>();
    getConversationMock.mockReturnValue(pending.promise);
    const request = loadConversationDetail('chat-a');

    invalidateConversationDetail('chat-a');
    pending.resolve({ id: 'chat-a', messages: [] });

    await expect(request).rejects.toSatisfy(isStaleConversationDetailRequestError);
  });

  it('logout 或全量 reset 使所有尚未完成的详情请求失效', async () => {
    const chatA = deferred<any>();
    const chatB = deferred<any>();
    getConversationMock
      .mockReturnValueOnce(chatA.promise)
      .mockReturnValueOnce(chatB.promise);
    const requestA = loadConversationDetail('chat-a');
    const requestB = loadConversationDetail('chat-b');

    invalidateAllConversationDetails();
    chatA.resolve({ id: 'chat-a', messages: [] });
    chatB.resolve({ id: 'chat-b', messages: [] });

    await expect(requestA).rejects.toSatisfy(isStaleConversationDetailRequestError);
    await expect(requestB).rejects.toSatisfy(isStaleConversationDetailRequestError);
  });
});
