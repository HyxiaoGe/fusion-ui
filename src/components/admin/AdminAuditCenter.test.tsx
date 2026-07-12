import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';

const apiMocks = vi.hoisted(() => ({
  getAdminUsers: vi.fn(),
  getAdminUser: vi.fn(),
  getAdminConversations: vi.fn(),
  getAdminConversation: vi.fn(),
  getAdminConversationMessages: vi.fn(),
  getAdminConversationToolCalls: vi.fn(),
  getAdminConversationAgentRuns: vi.fn(),
  getAdminConversationFiles: vi.fn(),
  getAdminPerformanceRuns: vi.fn(),
  getAdminPerformanceRun: vi.fn(),
  getAdminAuditEvents: vi.fn(),
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);

import AdminAuditCenter from './AdminAuditCenter';

const emptyPage = {
  items: [], total: 0, page: 1, page_size: 25, total_pages: 0, has_next: false, has_prev: false,
};

describe('AdminAuditCenter', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach(mock => mock.mockReset().mockResolvedValue(emptyPage));
  });

  it('提供四个独立管理页签并默认加载用户列表', async () => {
    render(<AdminAuditCenter />);

    expect(screen.getByRole('tab', { name: '用户' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '压测' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '访问审计' })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalled());
  });

  it('切换到对话页后加载全局对话，不读取普通聊天状态', async () => {
    apiMocks.getAdminConversations.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'conv-1', title: '压测会话', model_id: 'gpt-5', created_at: null, updated_at: null,
        user: { id: 'user-1', username: 'tester', nickname: null, email_masked: 't***@example.com' },
        message_count: 2, tool_call_count: 1, file_count: 0, input_tokens: 10, output_tokens: 20,
        latest_agent_status: 'completed',
      }],
    });
    render(<AdminAuditCenter initialTab="conversations" />);

    expect(await screen.findByText('压测会话')).toBeInTheDocument();
    expect(apiMocks.getAdminConversations).toHaveBeenCalled();
  });

  it('从用户详情跳转到对话页并立即应用该用户 ID 筛选', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
      total: 1,
      total_pages: 1,
      items: [{
        id: 'user-1', username: 'tester', nickname: '测试用户', email_masked: 't***@example.com',
        is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
        conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
      }],
    });
    apiMocks.getAdminUser.mockResolvedValue({
      id: 'user-1', username: 'tester', nickname: '测试用户', email: 'tester@example.com',
      email_masked: 't***@example.com', is_superuser: false, created_at: null, updated_at: null,
      last_active_at: null, conversation_count: 1, message_count: 2, tool_call_count: 3,
      input_tokens: 4, output_tokens: 5, system_prompt: null,
    });
    render(<AdminAuditCenter />);
    await screen.findByText('@tester');

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-1' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看该用户的对话' }));

    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByRole('tab', { name: '对话' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-1');
  });

  it('关联用户筛选只服务本次导航，离开后普通进入对话不复用旧用户', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
      total: 1,
      total_pages: 1,
      items: [{
        id: 'user-a', username: 'user-a', nickname: '用户 A', email_masked: 'a***@example.com',
        is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
        conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
      }],
    });
    apiMocks.getAdminUser.mockResolvedValue({
      id: 'user-a', username: 'user-a', nickname: '用户 A', email: 'a@example.com',
      email_masked: 'a***@example.com', is_superuser: false, created_at: null, updated_at: null,
      last_active_at: null, conversation_count: 1, message_count: 2, tool_call_count: 3,
      input_tokens: 4, output_tokens: 5, system_prompt: null,
    });
    render(<AdminAuditCenter />);
    await screen.findByText('@user-a');
    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-a' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看该用户的对话' }));
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'user-a' }),
      expect.any(AbortSignal),
    ));

    fireEvent.mouseDown(screen.getByRole('tab', { name: '用户' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-state', 'active'));
    fireEvent.mouseDown(screen.getByRole('tab', { name: '对话' }), { button: 0, ctrlKey: false });

    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ user_id: 'user-a' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('');
  });

  it('连续从用户详情进入对话时使用最新选择的用户 B', async () => {
    const userItems = ['a', 'b'].map(suffix => ({
      id: `user-${suffix}`, username: `user-${suffix}`, nickname: `用户 ${suffix.toUpperCase()}`,
      email_masked: `${suffix}***@example.com`, is_superuser: false, created_at: null, updated_at: null,
      last_active_at: null, conversation_count: 1, message_count: 2, tool_call_count: 3,
      input_tokens: 4, output_tokens: 5,
    }));
    apiMocks.getAdminUsers.mockResolvedValue({ ...emptyPage, total: 2, total_pages: 1, items: userItems });
    apiMocks.getAdminUser.mockImplementation((userId: string) => Promise.resolve({
      ...userItems.find(user => user.id === userId), email: `${userId}@example.com`, system_prompt: null,
    }));
    render(<AdminAuditCenter />);
    await screen.findByText('@user-a');

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-a' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看该用户的对话' }));
    await waitFor(() => expect(screen.getByLabelText('用户 ID')).toHaveValue('user-a'));
    fireEvent.mouseDown(screen.getByRole('tab', { name: '用户' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-state', 'active'));
    fireEvent.click(await screen.findByRole('button', { name: '查看用户详情 user-b' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看该用户的对话' }));

    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'user-b' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-b');
  });

  it('关联用户跳转后遇到 403 会卸载审计内容并清除用户筛选展示', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
      total: 1,
      total_pages: 1,
      items: [{
        id: 'user-sensitive', username: 'sensitive', nickname: null, email_masked: 's***@example.com',
        is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
        conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
      }],
    });
    apiMocks.getAdminUser.mockResolvedValue({
      id: 'user-sensitive', username: 'sensitive', nickname: null, email: 'sensitive@example.com',
      email_masked: 's***@example.com', is_superuser: false, created_at: null, updated_at: null,
      last_active_at: null, conversation_count: 1, message_count: 2, tool_call_count: 3,
      input_tokens: 4, output_tokens: 5, system_prompt: null,
    });
    render(<AdminAuditCenter />);
    await screen.findByText('@sensitive');
    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-sensitive' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看该用户的对话' }));
    await waitFor(() => expect(screen.getByLabelText('用户 ID')).toHaveValue('user-sensitive'));
    apiMocks.getAdminConversations.mockRejectedValue(new ApiError('FORBIDDEN', '需要管理员权限', 'req-linked'));

    fireEvent.click(screen.getByRole('button', { name: '刷新对话列表' }));

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('user-sensitive')).toBeNull();
  });

  it('后端 403 时立即清空敏感内容并显示权限失效', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'user-1', username: 'secret-user', nickname: null, email_masked: 's***@example.com',
        is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
        conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
      }],
    });
    const { rerender } = render(<AdminAuditCenter />);
    expect(await screen.findByText('@secret-user')).toBeInTheDocument();

    apiMocks.getAdminUsers.mockRejectedValue(new ApiError('FORBIDDEN', 'Forbidden', 'req-1'));
    fireEvent.click(screen.getByRole('button', { name: '刷新用户列表' }));
    rerender(<AdminAuditCenter />);

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByText('@secret-user')).toBeNull();
  });

  it('敏感用户详情返回 403 时同样卸载并清空已加载列表', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'user-1', username: 'secret-user', nickname: null, email_masked: 's***@example.com',
        is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
        conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
      }],
    });
    apiMocks.getAdminUser.mockRejectedValue(new ApiError('FORBIDDEN', '需要管理员权限', 'req-detail'));
    render(<AdminAuditCenter />);
    expect(await screen.findByText('@secret-user')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-1' }));

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByText('@secret-user')).toBeNull();
  });

  it('压测详情返回 403 时卸载整个审计中心并清空压测列表', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({
      ...emptyPage,
      total: 1,
      total_pages: 1,
      items: [{
        run_id: 'perf-sensitive', environment: 'production', model_id: null, status: 'completed',
        schema_version: 2, started_at: null, finished_at: null, created_at: '2026-07-12T00:00:00Z',
      }],
    });
    apiMocks.getAdminPerformanceRun.mockRejectedValue(new ApiError('FORBIDDEN', '需要管理员权限', 'req-perf'));
    render(<AdminAuditCenter initialTab="performance" />);
    expect(await screen.findByText('perf-sensitive')).toBeInTheDocument();
    expect(screen.getByText('完整执行')).toBeInTheDocument();
    expect(screen.getByText(/模型未采集/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看压测详情 perf-sensitive' }));

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByText('perf-sensitive')).toBeNull();
  });
});
