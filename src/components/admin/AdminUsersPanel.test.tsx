import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAdminUsers: vi.fn(),
  getAdminUser: vi.fn(),
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);

import AdminUsersPanel from './AdminUsersPanel';

const users = [
  {
    id: 'user-alpha', username: 'alpha', nickname: '同名用户', email_masked: 's***@example.com',
    is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
    conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
  },
  {
    id: 'user-beta', username: 'beta', nickname: '同名用户', email_masked: 's***@example.com',
    is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
    conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
  },
];

const page = {
  items: users, total: 2, page: 1, page_size: 25, total_pages: 1, has_next: false, has_prev: false,
};
const noop = () => undefined;

function ControlledUsersPanel({
  onForbidden = noop, onViewConversations = noop, initialUserId = null,
}: {
  onForbidden?: () => void;
  onViewConversations?: (userId: string) => void;
  initialUserId?: string | null;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId);
  const viewConversations = (userId: string) => {
    setSelectedUserId(null);
    onViewConversations(userId);
  };
  return (
    <AdminUsersPanel
      onForbidden={onForbidden}
      selectedUserId={selectedUserId}
      onOpen={setSelectedUserId}
      onClose={() => setSelectedUserId(null)}
      onViewConversations={viewConversations}
    />
  );
}

describe('AdminUsersPanel', () => {
  beforeEach(() => {
    apiMocks.getAdminUsers.mockReset().mockResolvedValue(page);
    apiMocks.getAdminUser.mockReset();
  });

  it('同昵称同脱敏邮箱时仍稳定展示 username 与 user_id', async () => {
    render(<ControlledUsersPanel />);

    await screen.findAllByText('同名用户');
    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('@beta')).toBeInTheDocument();
    expect(screen.getByText('user-alpha')).toBeInTheDocument();
    expect(screen.getByText('user-beta')).toBeInTheDocument();
    expect(screen.getAllByText('s***@example.com')).toHaveLength(2);
  });

  it('关闭详情会中止旧请求且不串数据，之后可继续筛选查看其他用户', async () => {
    let resolveDetail!: (value: Record<string, unknown>) => void;
    apiMocks.getAdminUser.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<ControlledUsersPanel />);
    await screen.findByText('@alpha');

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-alpha' }));

    const dialog = screen.getByRole('dialog', { name: '用户详情' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('正在读取用户详情');
    const detailSignal = apiMocks.getAdminUser.mock.calls[0][1] as AbortSignal;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.change(screen.getByLabelText('搜索用户'), { target: { value: 'beta' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() => expect(detailSignal.aborted).toBe(true));
    expect(screen.queryByText('正在读取用户详情')).toBeNull();
    await act(async () => resolveDetail({
      ...users[0], email: 'alpha@example.com', system_prompt: null,
    }));
    expect(screen.queryByText('alpha@example.com')).toBeNull();

    apiMocks.getAdminUser.mockResolvedValue({
      ...users[1], email: 'beta@example.com', system_prompt: null,
    });
    const betaRow = screen.getByText('@beta').closest('tr');
    fireEvent.click(within(betaRow as HTMLElement).getByRole('button', { name: '查看用户详情 user-beta' }));

    expect(await screen.findByText('beta@example.com')).toBeInTheDocument();
    const detail = screen.getByLabelText('用户详情 user-beta');
    expect(detail).toHaveTextContent('同名用户');
    expect(detail).toHaveTextContent('@beta');
    expect(detail).toHaveTextContent('user-beta');
  });

  it('详情弹窗立即可见，并可从详情跳转到该用户的对话', async () => {
    const onViewConversations = vi.fn();
    let resolveDetail!: (value: Record<string, unknown>) => void;
    apiMocks.getAdminUser.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<ControlledUsersPanel onViewConversations={onViewConversations} />);
    await screen.findByText('@alpha');

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-alpha' }));

    const dialog = screen.getByRole('dialog', { name: '用户详情' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('正在读取用户详情');
    await act(async () => resolveDetail({
      ...users[0], email: 'alpha@example.com', system_prompt: null,
    }));

    fireEvent.click(await within(dialog).findByRole('button', { name: '查看该用户的对话' }));
    expect(onViewConversations).toHaveBeenCalledWith('user-alpha');
    expect(screen.queryByRole('dialog', { name: '用户详情' })).toBeNull();
  });

  it('关闭详情后焦点回到原查看按钮，深链详情回到搜索框', async () => {
    apiMocks.getAdminUser.mockResolvedValue({
      ...users[0], email: 'alpha@example.com', system_prompt: null,
    });
    const { unmount } = render(<ControlledUsersPanel />);
    await screen.findByText('@alpha');
    const trigger = screen.getByRole('button', { name: '查看用户详情 user-alpha' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '用户详情' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    unmount();

    render(<ControlledUsersPanel initialUserId="user-alpha" />);
    const deepDialog = await screen.findByRole('dialog', { name: '用户详情' });
    fireEvent.click(within(deepDialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('搜索用户')));
  });

  it('首次详情失败时保持弹窗，并可重试成功', async () => {
    apiMocks.getAdminUser
      .mockRejectedValueOnce(new Error('用户详情暂时不可用'))
      .mockResolvedValueOnce({ ...users[0], email: 'alpha@example.com', system_prompt: null });
    render(<ControlledUsersPanel />);
    await screen.findByText('@alpha');

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-alpha' }));
    const dialog = screen.getByRole('dialog', { name: '用户详情' });
    expect(await within(dialog).findByText('用户详情暂时不可用')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '重试用户详情' }));

    expect(await within(dialog).findByText('alpha@example.com')).toBeInTheDocument();
    expect(apiMocks.getAdminUser).toHaveBeenCalledTimes(2);
  });

  it('关闭详情后刷新列表会清空详情状态，并支持列表失败重试', async () => {
    let resolveDetail!: (value: Record<string, unknown>) => void;
    apiMocks.getAdminUser.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<ControlledUsersPanel />);
    await screen.findByText('@alpha');
    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-alpha' }));
    const detailSignal = apiMocks.getAdminUser.mock.calls[0][1] as AbortSignal;
    expect(screen.getByRole('status')).toHaveTextContent('正在读取用户详情');
    apiMocks.getAdminUsers
      .mockRejectedValueOnce(new Error('用户列表刷新失败'))
      .mockResolvedValueOnce(page);

    fireEvent.click(within(screen.getByRole('dialog', { name: '用户详情' })).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新用户列表' }));

    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(2));
    expect(detailSignal.aborted).toBe(true);
    expect(screen.queryByText('正在读取用户详情')).toBeNull();
    expect(screen.queryByLabelText('用户详情 user-alpha')).toBeNull();
    await act(async () => resolveDetail({
      ...users[0], email: 'late-alpha@example.com', system_prompt: null,
    }));
    expect(screen.queryByText('late-alpha@example.com')).toBeNull();

    const error = await screen.findByText('用户列表刷新失败');
    fireEvent.click(within(error.parentElement as HTMLElement).getByRole('button', { name: '刷新用户列表' }));
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('@alpha')).toBeInTheDocument();
  });
});
