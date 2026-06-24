import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChatItem from "./ChatItem";
import type { ConversationListItem } from "@/hooks/useConversationList";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
}));

const chat: ConversationListItem = {
  id: "chat-a",
  title: "待预取对话",
  model_id: "model-a",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const baseProps = {
  chat,
  isActive: false,
  modelNameById: new Map([["model-a", "测试模型"]]),
  onSelectChat: vi.fn(),
  onStartEditing: vi.fn(),
  onDeleteChat: vi.fn(),
  onGenerateTitle: vi.fn(),
  formatDate: vi.fn(() => "06/24/2026"),
};

describe("ChatItem", () => {
  it("在 hover 和按下时预取会话正文但不阻塞点击选择", () => {
    const onPrefetchChat = vi.fn();
    const onSelectChat = vi.fn();

    render(
      <ChatItem
        {...baseProps}
        onSelectChat={onSelectChat}
        onPrefetchChat={onPrefetchChat}
      />
    );

    const item = screen.getByText("待预取对话").closest("[data-conversation-id]");
    expect(item).toBeTruthy();

    fireEvent.mouseEnter(item!);
    fireEvent.mouseDown(item!);
    fireEvent.click(item!);

    expect(onPrefetchChat).toHaveBeenCalledWith("chat-a");
    expect(onPrefetchChat).toHaveBeenCalledTimes(2);
    expect(onSelectChat).toHaveBeenCalledWith("chat-a");
  });
});
