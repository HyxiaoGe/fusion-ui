import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('AdminUsersPanel', () => {
  beforeEach(() => {
    apiMocks.getAdminUsers.mockReset().mockResolvedValue(page);
    apiMocks.getAdminUser.mockReset();
  });

  it('同昵称同脱敏邮箱时仍稳定展示 username 与 user_id', async () => {
    render(<AdminUsersPanel onForbidden={vi.fn()} />);

    await screen.findAllByText('同名用户');
    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('@beta')).toBeInTheDocument();
    expect(screen.getByText('user-alpha')).toBeInTheDocument();
    expect(screen.getByText('user-beta')).toBeInTheDocument();
    expect(screen.getAllByText('s***@example.com')).toHaveLength(2);
  });

  it('用户详情展示 loading 和完整身份，列表条件变化会中止并清空旧详情', async () => {
    let resolveDetail!: (value: Record<string, unknown>) => void;
    apiMocks.getAdminUser.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<AdminUsersPanel onForbidden={vi.fn()} />);
    await screen.findByText('@alpha');

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-alpha' }));

    expect(screen.getByRole('status')).toHaveTextContent('正在读取用户详情');
    const detailSignal = apiMocks.getAdminUser.mock.calls[0][1] as AbortSignal;
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

  it('刷新列表会先中止延迟详情并清空 loading、详情与错误', async () => {
    let resolveDetail!: (value: Record<string, unknown>) => void;
    apiMocks.getAdminUser.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<AdminUsersPanel onForbidden={vi.fn()} />);
    await screen.findByText('@alpha');
    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-alpha' }));
    const detailSignal = apiMocks.getAdminUser.mock.calls[0][1] as AbortSignal;
    expect(screen.getByRole('status')).toHaveTextContent('正在读取用户详情');
    apiMocks.getAdminUsers
      .mockRejectedValueOnce(new Error('用户列表刷新失败'))
      .mockResolvedValueOnce(page);

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
