import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pointer 或 focus 短暂停留后离开不会预取", () => {
    const onPrefetchChat = vi.fn();

    render(
      <ChatItem
        {...baseProps}
        onPrefetchChat={onPrefetchChat}
      />
    );

    const item = screen.getByText("待预取对话").closest("[data-conversation-id]");
    expect(item).toBeTruthy();

    fireEvent.pointerEnter(item!, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(149));
    fireEvent.pointerLeave(item!);
    act(() => vi.advanceTimersByTime(1));

    fireEvent.focus(item!);
    act(() => vi.advanceTimersByTime(149));
    fireEvent.blur(item!, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(1));

    expect(onPrefetchChat).not.toHaveBeenCalled();
  });

  it("pointer 或 focus 明确停留 150ms 后预取一次", () => {
    const onPrefetchChat = vi.fn();

    render(<ChatItem {...baseProps} onPrefetchChat={onPrefetchChat} />);

    const item = screen.getByText("待预取对话").closest("[data-conversation-id]");
    fireEvent.pointerEnter(item!, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(150));

    expect(onPrefetchChat).toHaveBeenCalledTimes(1);
    expect(onPrefetchChat).toHaveBeenCalledWith("chat-a");
  });

  it("focus 明确停留 150ms 后预取一次", () => {
    const onPrefetchChat = vi.fn();

    render(<ChatItem {...baseProps} onPrefetchChat={onPrefetchChat} />);

    const item = screen.getByText("待预取对话").closest("[data-conversation-id]");
    fireEvent.focus(item!);
    act(() => vi.advanceTimersByTime(150));

    expect(onPrefetchChat).toHaveBeenCalledTimes(1);
    expect(onPrefetchChat).toHaveBeenCalledWith("chat-a");
  });

  it("pointerdown 立即预取且点击选择不等待", () => {
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
    fireEvent.pointerDown(item!, { pointerType: "mouse" });
    fireEvent.click(item!);

    expect(onPrefetchChat).toHaveBeenCalledTimes(1);
    expect(onSelectChat).toHaveBeenCalledWith("chat-a");
  });

  it("更多操作 trigger 不会冒泡触发会话预取或选择", () => {
    const onPrefetchChat = vi.fn();
    const onSelectChat = vi.fn();

    render(
      <ChatItem
        {...baseProps}
        onSelectChat={onSelectChat}
        onPrefetchChat={onPrefetchChat}
      />
    );

    const moreButton = screen.getByTitle("更多操作");
    const item = screen.getByText("待预取对话").closest("[data-conversation-id]");
    fireEvent.pointerEnter(item!, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerDown(moreButton, { pointerType: "mouse" });
    fireEvent.click(moreButton);
    act(() => vi.advanceTimersByTime(50));

    expect(onPrefetchChat).not.toHaveBeenCalled();
    expect(onSelectChat).not.toHaveBeenCalled();
  });

  it("流式输出时在右侧显示尊重减少动态偏好的旋转状态", () => {
    const { rerender, container } = render(
      <ChatItem
        {...baseProps}
        isStreaming
      />
    );

    const status = screen.getByRole("status", { name: "待预取对话 正在输出" });
    expect(status).toBeInTheDocument();
    expect(status).toHaveClass("pointer-events-none");
    expect(status.querySelector("svg")).toHaveClass("animate-spin", "motion-reduce:animate-none");
    expect(container.querySelector('[title="更多操作"]')).toHaveClass("group-hover:opacity-60");

    rerender(<ChatItem {...baseProps} isStreaming={false} />);

    expect(screen.queryByRole("status", { name: "待预取对话 正在输出" })).toBeNull();
  });
});
