import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n';
import type { ContextUsage } from '@/types/conversation';
import ContextStatus from './ContextStatus';

const actualUsage: ContextUsage = {
  status: 'trimmed',
  window_tokens: 262_144,
  estimated_tokens_before: 232_305,
  estimated_tokens_after: 192_280,
  actual_prompt_tokens: 147_811,
  removed_turns: 1,
  removed_messages: 2,
  removed_tool_transactions: 0,
  round_index: 1,
};

describe('ContextStatus', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('以低干扰入口展示剩余比例，会话 ID 独占一行且不生硬换行', () => {
    const conversationId = '40e593b8-81c4-4932-b05b-f0265bab2379';
    render(<ContextStatus conversationId={conversationId} usage={actualUsage} />);

    const trigger = screen.getByRole('button', { name: '查看上下文状态，剩余 43%' });
    expect(trigger).toHaveTextContent('43%');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '上下文状态' });
    expect(dialog).toHaveClass(
      'w-[calc(100vw-1.5rem)]',
      'max-w-[24rem]',
      'max-h-[min(70vh,30rem)]',
      'overflow-y-auto',
    );
    expect(screen.getByText('会话 ID')).toBeInTheDocument();
    expect(screen.getByText('本轮输入（实际）')).toBeInTheDocument();
    const conversationSection = screen.getByTestId('context-conversation-section');
    const conversationValue = screen.getByTestId('context-conversation-id');
    expect(conversationSection).toContainElement(conversationValue);
    expect(conversationSection).toHaveClass('min-w-0');
    expect(conversationValue).toHaveTextContent(conversationId);
    expect(conversationValue).toHaveAttribute('title', conversationId);
    expect(conversationValue).toHaveClass('truncate', 'whitespace-nowrap');
    expect(screen.getByText('147,811 / 262,144 Token')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '已使用 57%，剩余 43%');
    expect(screen.getByText('已自动优化')).toBeInTheDocument();
    expect(screen.getByText('已移除 1 个历史轮次、2 条消息')).toBeInTheDocument();
    expect(screen.getByText('仅优化发送给模型的上下文，页面聊天记录未删除。')).toBeInTheDocument();
  });

  it('支持 Escape 关闭详情并将焦点还给入口', async () => {
    render(<ContextStatus conversationId="chat-keyboard" usage={actualUsage} />);

    const trigger = screen.getByRole('button', { name: '查看上下文状态，剩余 43%' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog', { name: '上下文状态' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('未知窗口只显示可访问入口，不展示虚假百分比', () => {
    render(<ContextStatus conversationId="chat-unknown" usage={{
      ...actualUsage,
      status: 'bypass_unknown_window',
      window_tokens: null,
      actual_prompt_tokens: 2_000,
    }} />);

    const trigger = screen.getByRole('button', { name: '查看上下文状态' });
    expect(trigger).not.toHaveTextContent('%');
    fireEvent.click(trigger);
    expect(screen.getByText('当前模型暂未提供上下文窗口信息')).toBeInTheDocument();
  });

  it('已知窗口但估算尚未完成时展示计算中，不误报未知窗口', () => {
    render(<ContextStatus conversationId="chat-calculating" usage={{
      ...actualUsage,
      status: 'no_op_fast_path',
      actual_prompt_tokens: null,
      estimated_tokens_after: null,
    }} />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态' }));
    expect(screen.getByText('正在计算本轮上下文用量')).toBeInTheDocument();
    expect(screen.queryByText('当前模型暂未提供上下文窗口信息')).toBeNull();
  });

  it('pending 时保留入口并明确显示计算中', () => {
    render(<ContextStatus conversationId="chat-pending" usage={null} phase="estimated" pending />);

    const trigger = screen.getByRole('button', { name: '查看上下文状态，计算中' });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getAllByText('计算中').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('正在计算本轮上下文用量')).toBeInTheDocument();
  });

  it.each([
    ['required_context_over_budget', '本轮未发送', '必要上下文超过模型窗口，本轮请求未发送。'],
    ['estimator_unavailable', '上下文检查失败', '暂时无法计算本轮上下文，本轮请求未发送。'],
  ])('错误状态 %s 展示失败语义且不误报自动优化', (status, label, description) => {
    render(<ContextStatus
      conversationId="chat-error"
      usage={{ ...actualUsage, status, actual_prompt_tokens: null, removed_turns: 0, removed_messages: 0 }}
      phase="error"
    />);

    fireEvent.click(screen.getByRole('button', { name: `查看上下文状态，${label}` }));
    expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.queryByText('已自动优化')).toBeNull();
  });

  it('在浏览器语言为英文时仍固定展示中文', async () => {
    await i18n.changeLanguage('en-US');
    render(<ContextStatus conversationId="chat-en" usage={actualUsage} />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(screen.getByText('仅优化发送给模型的上下文，页面聊天记录未删除。')).toBeInTheDocument();
  });
});
