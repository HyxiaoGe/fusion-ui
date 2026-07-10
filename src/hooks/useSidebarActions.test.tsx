import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dispatchMock,
  getStateMock,
  routerPushMock,
  toastMock,
  getConversationMock,
  loadConversationDetailMock,
  getConversationDetailRequestMetadataMock,
  invalidateConversationDetailMock,
  isStaleConversationDetailRequestErrorMock,
  buildChatFromServerConversationMock,
  deleteConversationMock,
  generateChatTitleMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  getStateMock: vi.fn(),
  routerPushMock: vi.fn(),
  toastMock: vi.fn(),
  getConversationMock: vi.fn(),
  loadConversationDetailMock: vi.fn(),
  getConversationDetailRequestMetadataMock: vi.fn(),
  invalidateConversationDetailMock: vi.fn(),
  isStaleConversationDetailRequestErrorMock: vi.fn(),
  buildChatFromServerConversationMock: vi.fn(),
  deleteConversationMock: vi.fn(),
  generateChatTitleMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("@/redux/hooks", () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock("@/redux/store", () => ({
  store: {
    getState: getStateMock,
  },
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/lib/api/chat", () => ({
  deleteConversation: deleteConversationMock,
  getConversation: getConversationMock,
  renameConversation: vi.fn(),
}));

vi.mock("@/lib/chat/conversationDetailResource", () => ({
  loadConversationDetail: loadConversationDetailMock,
  getConversationDetailRequestMetadata: getConversationDetailRequestMetadataMock,
  invalidateConversationDetail: invalidateConversationDetailMock,
  isStaleConversationDetailRequestError: isStaleConversationDetailRequestErrorMock,
}));

vi.mock("@/lib/api/title", () => ({
  generateChatTitle: generateChatTitleMock,
}));

vi.mock("@/lib/chat/conversationHydration", () => ({
  buildChatFromServerConversation: buildChatFromServerConversationMock,
}));

import { useSidebarActions } from "./useSidebarActions";

describe("useSidebarActions", () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    getStateMock.mockReset();
    routerPushMock.mockClear();
    toastMock.mockClear();
    getConversationMock.mockReset();
    loadConversationDetailMock.mockReset();
    getConversationDetailRequestMetadataMock.mockReset();
    getConversationDetailRequestMetadataMock.mockReturnValue(null);
    invalidateConversationDetailMock.mockReset();
    isStaleConversationDetailRequestErrorMock.mockReset();
    isStaleConversationDetailRequestErrorMock.mockReturnValue(false);
    buildChatFromServerConversationMock.mockReset();
    deleteConversationMock.mockReset();
    generateChatTitleMock.mockReset();
    generateChatTitleMock.mockResolvedValue("生成后的标题");
  });

  it("prefetchConversation 在本地没有正文时拉取并写入 Redux", async () => {
    getStateMock.mockReturnValue({
      conversation: {
        byId: {
          "chat-a": { id: "chat-a", messages: [] },
        },
        hydrationStatus: {},
      },
      stream: { isStreaming: false, conversationId: null },
    });
    loadConversationDetailMock.mockResolvedValue({
      id: "chat-a",
      title: "已预取",
      model_id: "model-a",
      messages: [{ id: "msg-a", role: "assistant", content: [], timestamp: 1 }],
      createdAt: 1,
      updatedAt: 2,
    });

    const { result } = renderHook(() => useSidebarActions());

    await act(async () => {
      await result.current.prefetchConversation("chat-a");
    });

    expect(loadConversationDetailMock).toHaveBeenCalledWith("chat-a", expect.any(Object));
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "conversation/mergeHydratedConversation",
        payload: expect.objectContaining({
          conversation: expect.objectContaining({ id: "chat-a", title: "已预取" }),
        }),
      })
    );
  });

  it("prefetchConversation 在会话详情已水合完成时跳过请求", async () => {
    getStateMock.mockReturnValue({
      conversation: {
        byId: {
          "chat-a": { id: "chat-a", messages: [{ id: "msg-a" }] },
        },
        hydrationStatus: { "chat-a": "done" },
      },
      stream: { isStreaming: false, conversationId: null },
    });

    const { result } = renderHook(() => useSidebarActions());

    await act(async () => {
      await result.current.prefetchConversation("chat-a");
    });

    expect(loadConversationDetailMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("hover 预取未完成时点击导航不重复请求且立即 push", () => {
    getStateMock.mockReturnValue({
      conversation: {
        byId: { "chat-a": { id: "chat-a", messages: [] } },
        hydrationStatus: {},
      },
      stream: { isStreaming: false, conversationId: null },
    });
    loadConversationDetailMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSidebarActions());

    act(() => {
      void result.current.prefetchConversation("chat-a");
      result.current.selectConversation("chat-a");
    });

    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith("/chat/chat-a");
  });

  it("冷点击不会等待详情请求完成才执行路由 push", () => {
    getStateMock.mockReturnValue({
      conversation: {
        byId: { "chat-a": { id: "chat-a", messages: [] } },
        hydrationStatus: {},
      },
      stream: { isStreaming: false, conversationId: null },
    });
    let requestResolved = false;
    loadConversationDetailMock.mockReturnValue(
      new Promise(() => {}).then(() => {
        requestResolved = true;
      })
    );
    const { result } = renderHook(() => useSidebarActions());

    act(() => {
      result.current.selectConversation("chat-a");
    });

    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith("/chat/chat-a");
    expect(requestResolved).toBe(false);
  });

  it("预取请求失效时不再 merge 也不回写 error 或 idle", async () => {
    const staleError = new Error("stale");
    getStateMock.mockReturnValue({
      conversation: {
        byId: { "chat-a": { id: "chat-a", messages: [] } },
        hydrationStatus: {},
      },
      stream: { isStreaming: false, conversationId: null },
    });
    loadConversationDetailMock.mockRejectedValue(staleError);
    isStaleConversationDetailRequestErrorMock.mockImplementation((error) => error === staleError);
    const { result } = renderHook(() => useSidebarActions());

    await act(async () => {
      await result.current.prefetchConversation("chat-a");
    });

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: "conversation/setHydrationStatus", payload: { id: "chat-a", status: "loading" } })
    );
  });

  it("删除对话成功后跳转到正式新建对话页", async () => {
    deleteConversationMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSidebarActions());

    act(() => {
      result.current.openDeleteDialog("chat-a");
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(invalidateConversationDetailMock).toHaveBeenCalledWith("chat-a");
    expect(deleteConversationMock).toHaveBeenCalledWith("chat-a");
    expect(invalidateConversationDetailMock.mock.invocationCallOrder[0])
      .toBeLessThan(deleteConversationMock.mock.invocationCallOrder[0]);
    expect(routerPushMock).toHaveBeenCalledWith("/chat/new");
  });

  it("生成标题后只标记当前会话 metadata 为 dirty", async () => {
    const { result } = renderHook(() => useSidebarActions());

    await act(async () => {
      await result.current.generateTitle("chat-a", [
        {
          id: "message-a",
          role: "user",
          content: [{ type: "text", id: "block-a", text: "你好" }],
          timestamp: 1,
        },
      ]);
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "conversation/requestConversationListRefresh",
        payload: "chat-a",
      })
    );
  });
});
