import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConversationListItem } from "@/hooks/useConversationList";

const { mockChatItemRender } = vi.hoisted(() => ({
  mockChatItemRender: vi.fn(),
}));

vi.mock("./ChatItem", () => ({
  default: ({ chat }: { chat: ConversationListItem }) => {
    mockChatItemRender(chat.id);
    return <div data-testid="chat-item">{chat.title}</div>;
  },
}));

import ChatList from "./ChatList";

describe("ChatList", () => {
  it("props 引用保持相同时 rerender 不重复渲染列表项", () => {
    const chats: ConversationListItem[] = [
      {
        id: "chat-a",
        title: "稳定对话",
        model_id: "model-a",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ];
    const sortedAndGroupedChats = [{ groupLabel: "今天", groupChats: chats }];
    const stableProps = {
      chats,
      sortedAndGroupedChats,
      activeChatId: "chat-a",
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

    const { rerender } = render(<ChatList {...stableProps} />);
    expect(mockChatItemRender).toHaveBeenCalledTimes(1);

    rerender(<ChatList {...stableProps} />);

    expect(mockChatItemRender).toHaveBeenCalledTimes(1);
  });
});
