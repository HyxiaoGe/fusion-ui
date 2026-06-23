import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ContentBlock, FileBlock, Message } from '@/types/conversation';

import UserMessage from './UserMessage';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'user-1',
    role: 'user',
    content: [{ type: 'text', id: 'text-1', text: '请总结这份材料' }],
    timestamp: 1,
    ...overrides,
  };
}

function renderUserMessage({
  message = makeMessage(),
  blocksToRender = message.content,
  messageText = '请总结这份材料',
  onRetry = vi.fn(),
  onEdit = vi.fn(),
  onViewImage = vi.fn(),
}: {
  message?: Message;
  blocksToRender?: ContentBlock[];
  messageText?: string;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onViewImage?: (block: FileBlock) => void;
} = {}) {
  render(
    <UserMessage
      message={message}
      blocksToRender={blocksToRender}
      messageText={messageText}
      onRetry={onRetry}
      onEdit={onEdit}
      onViewImage={onViewImage}
    />,
  );

  return { onRetry, onEdit, onViewImage };
}

describe('UserMessage', () => {
  it('渲染普通用户文本', () => {
    renderUserMessage();

    expect(screen.getByText('请总结这份材料')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
  });

  it('用户文本渲染为有边界的轻量气泡', () => {
    renderUserMessage();

    const bubble = screen.getByLabelText('用户消息内容');

    expect(bubble.className).toContain('border');
    expect(bubble.className).toContain('shadow');
    expect(bubble.className).toContain('rounded-xl');
  });

  it('渲染 failed 状态提示和重新发送操作', () => {
    const message = makeMessage({ status: 'failed' });
    const { onRetry } = renderUserMessage({ message });

    expect(screen.getByText('发送失败，请重新发送')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新发送' }));

    expect(onRetry).toHaveBeenCalledWith('user-1');
  });

  it('编辑态按 Ctrl+Enter 保存并退出编辑', () => {
    const { onEdit } = renderUserMessage();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const textarea = screen.getByPlaceholderText('编辑您的消息...');
    fireEvent.change(textarea, { target: { value: '更新后的问题' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(onEdit).toHaveBeenCalledWith('user-1', '更新后的问题');
    expect(screen.queryByPlaceholderText('编辑您的消息...')).toBeNull();
    expect(screen.getByText('请总结这份材料')).toBeInTheDocument();
  });

  it('编辑态按 Esc 取消并恢复原内容', () => {
    const { onEdit } = renderUserMessage();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const textarea = screen.getByPlaceholderText('编辑您的消息...');
    fireEvent.change(textarea, { target: { value: '不会保存的内容' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('编辑您的消息...')).toBeNull();
    expect(screen.getByText('请总结这份材料')).toBeInTheDocument();
  });

  it('点击图片文件 block 时交给父组件查看', () => {
    const imageBlock: FileBlock = {
      type: 'file',
      id: 'file-1',
      file_id: 'img-1',
      filename: 'diagram.png',
      mime_type: 'image/png',
      thumbnail_url: 'https://example.com/diagram.png',
    };
    const { onViewImage } = renderUserMessage({
      blocksToRender: [imageBlock, { type: 'text', id: 'text-1', text: '看这张图' }],
      messageText: '看这张图',
    });

    fireEvent.click(screen.getByAltText('diagram.png'));

    expect(onViewImage).toHaveBeenCalledWith(imageBlock);
  });
});
