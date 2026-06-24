import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dispatchMock,
  getStateMock,
  routerPushMock,
  toastMock,
  getConversationMock,
  buildChatFromServerConversationMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  getStateMock: vi.fn(),
  routerPushMock: vi.fn(),
  toastMock: vi.fn(),
  getConversationMock: vi.fn(),
  buildChatFromServerConversationMock: vi.fn(),
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
  deleteConversation: vi.fn(),
  getConversation: getConversationMock,
  renameConversation: vi.fn(),
}));

vi.mock("@/lib/api/title", () => ({
  generateChatTitle: vi.fn(),
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
    buildChatFromServerConversationMock.mockReset();
  });

  it("prefetchConversation 在本地没有正文时拉取并写入 Redux", async () => {
    getStateMock.mockReturnValue({
      conversation: {
        byId: {
          "chat-a": { id: "chat-a", messages: [] },
        },
      },
    });
    getConversationMock.mockResolvedValue({ id: "chat-a", messages: [] });
    buildChatFromServerConversationMock.mockReturnValue({
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

    expect(getConversationMock).toHaveBeenCalledWith("chat-a");
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "conversation/upsertConversation",
        payload: expect.objectContaining({ id: "chat-a", title: "已预取" }),
      })
    );
  });

  it("prefetchConversation 在本地已有正文时跳过请求", async () => {
    getStateMock.mockReturnValue({
      conversation: {
        byId: {
          "chat-a": { id: "chat-a", messages: [{ id: "msg-a" }] },
        },
      },
    });

    const { result } = renderHook(() => useSidebarActions());

    await act(async () => {
      await result.current.prefetchConversation("chat-a");
    });

    expect(getConversationMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
