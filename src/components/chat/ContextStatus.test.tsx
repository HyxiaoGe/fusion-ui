import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n';
import type { ContextUsage } from '@/types/conversation';
import ContextStatus, {
  CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY,
  CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY,
  CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
} from './ContextStatus';

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
    localStorage.clear();
    sessionStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
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
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuetext', '已使用 57%，剩余 43%');
    expect(progress).toHaveClass(
      'h-2',
      'border',
      'border-border/70',
      'bg-muted',
      'shadow-inner',
    );
    expect(screen.getByText('已自动优化')).toBeInTheDocument();
    expect(screen.getByText('已移除 1 个历史轮次、2 条消息')).toBeInTheDocument();
    expect(screen.getByText('为控制上下文长度，系统可能减少模型本轮读取的早期内容；当前对话中的历史消息会完整保留。')).toBeInTheDocument();
  });

  it('点击上下文入口只临时展开，不会开启全局默认展开', () => {
    render(<ContextStatus conversationId="chat-temporary-open" usage={actualUsage} />);

    const trigger = screen.getByRole('button', { name: '查看上下文状态，剩余 43%' });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '回答完成后自动展开' })).not.toBeChecked();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
  });

  it('只有全局开关会持久化默认展开，关闭开关不强制收起当前面板', () => {
    render(<ContextStatus conversationId="chat-default-open" usage={actualUsage} />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    const toggle = screen.getByRole('switch', { name: '回答完成后自动展开' });
    fireEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('false');
  });

  it('estimated 不展示估算数值；有 confirmed actual 时保留数值并低干扰标记更新中', () => {
    const { rerender } = render(<ContextStatus
      conversationId="chat-updating"
      usage={null}
      phase="estimated"
      pending
    />);
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    expect(screen.getAllByText('计算中').length).toBeGreaterThan(0);
    expect(screen.queryByText(/18,000/)).toBeNull();

    rerender(<ContextStatus
      conversationId="chat-updating"
      usage={actualUsage}
      phase="estimated"
      updating
    />);
    expect(screen.getByTestId('context-updating-indicator')).toHaveTextContent('更新中');
    expect(screen.getByText('147,811 / 262,144 Token')).toBeInTheDocument();
  });

  it('final 无 actual 显示暂不可用；窗口未知但 actual 已知仍展示实际 Token', () => {
    const { rerender } = render(<ContextStatus
      conversationId="chat-unavailable"
      usage={null}
      phase="final"
    />);
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态' }));
    expect(screen.getAllByText('暂不可用').length).toBeGreaterThan(0);
    expect(screen.queryByText('计算中')).toBeNull();

    rerender(<ContextStatus
      conversationId="chat-unavailable"
      usage={actualUsage}
      phase="final"
      latestActualUnavailable
    />);
    expect(screen.getByText('最近一次实际输入')).toBeInTheDocument();
    expect(screen.getByText('147,811 / 262,144 Token')).toBeInTheDocument();
    expect(screen.getByText('本轮未返回实际用量，当前显示最近一次实际结果。')).toBeInTheDocument();

    rerender(<ContextStatus
      conversationId="chat-unavailable"
      usage={{ ...actualUsage, window_tokens: null, actual_prompt_tokens: 2_000 }}
      phase="final"
    />);
    expect(screen.getAllByText('窗口未知').length).toBeGreaterThan(0);
    expect(screen.getByText('2,000 Token')).toBeInTheDocument();
  });

  it('临时关闭当前面板不会关闭全局默认展开', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    render(<ContextStatus conversationId="chat-toggle" usage={actualUsage} />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));

    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
  });

  it('临时展开不会在页面刷新后继续展开', async () => {
    const conversationId = 'chat-refresh-open';
    const first = render(<ContextStatus conversationId={conversationId} usage={actualUsage} />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
    first.unmount();

    render(<ContextStatus conversationId={conversationId} usage={actualUsage} />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());
  });

  it('全局默认开启时临时关闭，刷新后仍按全局偏好展开', async () => {
    const conversationId = 'chat-refresh-closed';
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const first = render(<ContextStatus conversationId={conversationId} usage={actualUsage} />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
    first.unmount();

    render(<ContextStatus conversationId={conversationId} usage={actualUsage} />);
    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
  });

  it('存储为展开时服务端水合不报错，并在浏览器绘制前恢复展开', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ContextStatus conversationId="chat-hydration-open" usage={actualUsage} />,
    );
    document.body.appendChild(container);

    const recoverableErrors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(
        container,
        <ContextStatus conversationId="chat-hydration-open" usage={actualUsage} />,
        { onRecoverableError: (error) => recoverableErrors.push(error) },
      );
      await Promise.resolve();
    });

    expect(recoverableErrors).toEqual([]);
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });

  it('展开与关闭状态在全部对话间同步，并在切换后保持', async () => {
    const view = render(<ContextStatus conversationId="chat-a" usage={actualUsage} />);

    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    fireEvent.click(screen.getByRole('switch', { name: '回答完成后自动展开' }));
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');

    view.rerender(<ContextStatus conversationId="chat-b" usage={null} phase="estimated" pending />);
    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');

    view.rerender(<ContextStatus conversationId="chat-a" usage={actualUsage} />);
    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
  });

  it('首轮生成期间保持收起，正常结束并拿到实际值后才自动展开一次', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const { rerender } = render(<ContextStatus
      conversationId="chat-first-round"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);

    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();

    rerender(<ContextStatus
      conversationId="chat-first-round"
      usage={actualUsage}
      phase="final"
      isStreaming
      isFirstConversationTurn
    />);
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();

    rerender(<ContextStatus
      conversationId="chat-first-round"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);
    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '回答完成后自动展开' }));
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());
    rerender(<ContextStatus
      conversationId="chat-first-round"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
  });

  it('全局已展开时，新会话首轮发送后先收起，回答完成才重新展开', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const { rerender } = render(<ContextStatus
      conversationId="chat-new-while-open"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    });

    rerender(<ContextStatus
      conversationId="chat-new-while-open"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);
    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
  });

  it('首轮生成期间切走、后台完成后再返回，仍按首轮完成规则自动展开', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const view = render(<ContextStatus
      conversationId="chat-background-a"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);

    view.rerender(<ContextStatus conversationId="chat-background-b" usage={actualUsage} />);
    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(screen.getByTestId('context-conversation-id')).toHaveTextContent('chat-background-b');

    view.rerender(<ContextStatus
      conversationId="chat-background-a"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
  });

  it('首轮生成期间刷新，完成态恢复后仍只自动展开这次真实任务', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const first = render(<ContextStatus
      conversationId="chat-refresh-pending-first"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);
    expect(sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY)).toContain(
      'chat-refresh-pending-first',
    );
    first.unmount();

    render(<ContextStatus
      conversationId="chat-refresh-pending-first"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
    expect(sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('直接打开历史单轮对话不会被误判为刚完成的首轮', async () => {
    render(<ContextStatus
      conversationId="chat-historical-single-turn"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    });
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('首轮流中手动开启后临时会话 ID 物化，仍保持开启', async () => {
    const view = render(<ContextStatus
      conversationId="temp-chat-id"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId="run-first"
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();

    view.rerender(<ContextStatus
      conversationId="server-chat-id"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId="run-first"
    />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
  });

  it('首个 run_started 同时迁移会话 ID 与建立 runId 时保留手动关闭', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const view = render(<ContextStatus
      conversationId="temp-before-run"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId={null}
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    view.rerender(<ContextStatus
      conversationId="server-after-run"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId="run-started"
    />);
    view.rerender(<ContextStatus
      conversationId="server-after-run"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
      activeRunId={null}
    />);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());
  });

  it('流结束将 runId 清空时保留用户临时展开', async () => {
    const view = render(<ContextStatus
      conversationId="chat-run-complete"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId="run-completing"
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    view.rerender(<ContextStatus
      conversationId="chat-run-complete"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
      activeRunId={null}
    />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
  });

  it('首轮流中手动开启后 runId 从空值建立，仍保持开启', async () => {
    const view = render(<ContextStatus
      conversationId="chat-run-establish"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId={null}
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    view.rerender(<ContextStatus
      conversationId="chat-run-establish"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId="run-established"
    />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
  });

  it('用户全局关闭后，新会话生成与首轮完成都保持关闭', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const view = render(<ContextStatus conversationId="chat-close-before-new" usage={actualUsage} />);
    const toggle = await screen.findByRole('switch', { name: '回答完成后自动展开' });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());

    view.rerender(<ContextStatus
      conversationId="chat-new-after-close"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());

    view.rerender(<ContextStatus
      conversationId="chat-new-after-close"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    });
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('false');
  });

  it('首轮生成中明确关闭后，即使刷新重挂也不会在完成时重新打开', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const first = render(<ContextStatus
      conversationId="chat-close-during-first-round"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toContain(
      'chat-close-during-first-round',
    );
    first.unmount();

    const refreshed = render(<ContextStatus
      conversationId="chat-close-during-first-round"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);
    refreshed.rerender(<ContextStatus
      conversationId="chat-close-during-first-round"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    });
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('首轮生成中明确关闭后切换会话，返回完成态仍保持关闭', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const view = render(<ContextStatus
      conversationId="chat-suppressed-background"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
      activeRunId="run-background"
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    view.rerender(<ContextStatus conversationId="chat-other" usage={actualUsage} />);
    view.rerender(<ContextStatus
      conversationId="chat-suppressed-background"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
      activeRunId={null}
    />);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('后续轮次、失败结果和用户手动关闭都不会触发自动展开', async () => {
    const subsequent = render(<ContextStatus
      conversationId="chat-subsequent"
      usage={actualUsage}
      phase="estimated"
      updating
      isStreaming
    />);
    subsequent.rerender(<ContextStatus
      conversationId="chat-subsequent"
      usage={actualUsage}
      phase="final"
    />);
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    subsequent.unmount();

    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const failed = render(<ContextStatus
      conversationId="chat-failed"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);
    failed.rerender(<ContextStatus
      conversationId="chat-failed"
      usage={null}
      phase="error"
      errorKind="check_failed"
      isFirstConversationTurn
    />);
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    failed.rerender(<ContextStatus
      conversationId="chat-failed"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);
    failed.rerender(<ContextStatus
      conversationId="chat-failed"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);
    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    failed.unmount();
    localStorage.clear();
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');

    const manual = render(<ContextStatus
      conversationId="chat-manual"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
    manual.rerender(<ContextStatus
      conversationId="chat-manual"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
  });

  it('首轮失败后进入第二轮，不会把第二轮成功误判成首轮完成而自动展开', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const view = render(<ContextStatus
      conversationId="chat-first-failed-then-second"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);

    view.rerender(<ContextStatus
      conversationId="chat-first-failed-then-second"
      usage={null}
      phase="error"
      errorKind="check_failed"
      isFirstConversationTurn
    />);
    view.rerender(<ContextStatus
      conversationId="chat-first-failed-then-second"
      usage={null}
      phase="estimated"
      pending
      isStreaming
    />);
    view.rerender(<ContextStatus
      conversationId="chat-first-failed-then-second"
      usage={actualUsage}
      phase="final"
    />);

    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
  });

  it('全局默认开启时点击弹层外部保持展开', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    render(<ContextStatus conversationId="chat-outside" usage={actualUsage} />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body);
      fireEvent.click(document.body);
    });

    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBe('true');
  });

  it('全局默认关闭时临时展开，点击弹层外部正常关闭', async () => {
    render(<ContextStatus conversationId="chat-temporary-outside" usage={actualUsage} />);
    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，剩余 43%' }));
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body);
      fireEvent.click(document.body);
    });

    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
  });

  it('忽略已被临时点击污染的旧版键，升级后重新等待用户明确选择', async () => {
    localStorage.setItem('fusion.context-status.open.v1', 'true');
    localStorage.setItem('fusion.context-status.default-open.v1', 'true');
    sessionStorage.setItem('fusion.context-status.open.v1', 'true');
    render(<ContextStatus conversationId="chat-legacy-ignored" usage={actualUsage} />);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull());
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
  });

  it('没有任何历史状态时默认保持关闭', async () => {
    render(<ContextStatus conversationId="chat-no-stored-state" usage={actualUsage} />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    });
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
  });

  it('自动展开不会抢走消息输入焦点', async () => {
    localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, 'true');
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    const { rerender } = render(<ContextStatus
      conversationId="chat-focus"
      usage={null}
      phase="estimated"
      pending
      isStreaming
      isFirstConversationTurn
    />);
    rerender(<ContextStatus
      conversationId="chat-focus"
      usage={actualUsage}
      phase="final"
      isFirstConversationTurn
    />);

    expect(await screen.findByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(textarea).toHaveFocus();
    textarea.remove();
  });

  it('Escape 只关闭当前面板，不修改回答完成后的自动展开偏好', () => {
    render(<ContextStatus conversationId="chat-keyboard" usage={actualUsage} />);

    const trigger = screen.getByRole('button', { name: '查看上下文状态，剩余 43%' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog', { name: '上下文状态' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).toBeNull();
    expect(localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY)).toBeNull();
  });

  it('未知窗口只显示可访问入口，不展示虚假百分比', () => {
    render(<ContextStatus conversationId="chat-unknown" usage={{
      ...actualUsage,
      status: 'bypass_unknown_window',
      window_tokens: null,
      actual_prompt_tokens: 2_000,
    }} />);

    const trigger = screen.getByRole('button', { name: '查看上下文状态，窗口未知' });
    expect(trigger).not.toHaveTextContent('%');
    fireEvent.click(trigger);
    expect(screen.getByText('当前模型暂未提供上下文窗口信息')).toBeInTheDocument();
  });

  it('已知窗口但估算尚未完成时展示计算中，不误报未知窗口', () => {
    render(<ContextStatus
      conversationId="chat-calculating"
      usage={{
        ...actualUsage,
        status: 'no_op_fast_path',
        actual_prompt_tokens: null,
        estimated_tokens_after: null,
      }}
      phase="estimated"
      pending
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看上下文状态，计算中' }));
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
    expect(screen.getByText('为控制上下文长度，系统可能减少模型本轮读取的早期内容；当前对话中的历史消息会完整保留。')).toBeInTheDocument();
  });
});
