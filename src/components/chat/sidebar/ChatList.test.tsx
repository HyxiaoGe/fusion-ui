import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationListItem } from "@/hooks/useConversationList";

const { mockChatItemRender } = vi.hoisted(() => ({
  mockChatItemRender: vi.fn(),
}));

vi.mock("./ChatItem", () => ({
  default: ({ chat, isStreaming }: { chat: ConversationListItem; isStreaming?: boolean }) => {
    mockChatItemRender(chat.id, isStreaming);
    return <div data-testid="chat-item">{chat.title}</div>;
  },
}));

import ChatList from "./ChatList";

describe("ChatList", () => {
  beforeEach(() => {
    mockChatItemRender.mockClear();
  });

  const createStableProps = () => {
    const chats: ConversationListItem[] = [
      {
        id: "chat-a",
        title: "稳定对话",
        model_id: "model-a",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ];

    return {
      chats,
      sortedAndGroupedChats: [{ groupLabel: "今天", groupChats: chats }],
      activeChatId: "chat-a",
      streamingConversationId: null as string | null,
      modelNameById: new Map([["model-a", "测试模型"]]),
      isLoadingServerList: false,
      isLoadingMoreServer: false,
      containerRef: React.createRef<HTMLDivElement>(),
      handleSelectChat: vi.fn(),
      handleStartEditing: vi.fn(),
      handleDeleteChat: vi.fn(),
      handleGenerateTitle: vi.fn(),
      formatDate: vi.fn(() => "06/23/2026"),
      sentinelRef: React.createRef<HTMLDivElement>(),
    };
  };

  it("隐藏对话列表滚动条但保留滚动容器", () => {
    render(<ChatList {...createStableProps()} />);

    expect(screen.getByTestId("chat-list-scroll-container")).toHaveClass("scrollbar-hide");
  });

  it("props 引用保持相同时 rerender 不重复渲染列表项", () => {
    const stableProps = createStableProps();

    const { rerender } = render(<ChatList {...stableProps} />);
    expect(mockChatItemRender).toHaveBeenCalledTimes(1);

    rerender(<ChatList {...stableProps} />);

    expect(mockChatItemRender).toHaveBeenCalledTimes(1);
  });

  it("只把当前流式会话标记为正在输出", () => {
    const stableProps = createStableProps();

    render(<ChatList {...stableProps} streamingConversationId="chat-a" />);

    expect(mockChatItemRender).toHaveBeenCalledWith("chat-a", true);
  });
});
