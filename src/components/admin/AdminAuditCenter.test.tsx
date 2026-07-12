import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  pathname: '/admin',
  search: '',
  history: ['/admin'],
  historyIndex: 0,
  listeners: new Set<() => void>(),
  publish(url: string) {
    this.search = url.split('?')[1] ?? '';
    this.listeners.forEach(listener => listener());
  },
  seed(url: string) {
    this.history = [url];
    this.historyIndex = 0;
    this.publish(url);
  },
  pushUrl(url: string) {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(url);
    this.historyIndex += 1;
    this.publish(url);
  },
  replaceUrl(url: string) {
    this.history[this.historyIndex] = url;
    this.publish(url);
  },
  backUrl() {
    if (this.historyIndex > 0) this.historyIndex -= 1;
    this.publish(this.history[this.historyIndex]);
  },
  setUrl(url: string) {
    this.history[this.historyIndex] = url;
    this.publish(url);
  },
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);
vi.mock('next/navigation', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    usePathname: () => navigationMocks.pathname,
    useRouter: () => ({
      push: navigationMocks.push,
      replace: navigationMocks.replace,
      back: navigationMocks.back,
    }),
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        listener => {
          navigationMocks.listeners.add(listener);
          return () => navigationMocks.listeners.delete(listener);
        },
        () => navigationMocks.search,
        () => navigationMocks.search,
      );
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

import AdminAuditCenter from './AdminAuditCenter';

const emptyPage = {
  items: [], total: 0, page: 1, page_size: 25, total_pages: 0, has_next: false, has_prev: false,
};

describe('AdminAuditCenter', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach(mock => mock.mockReset().mockResolvedValue(emptyPage));
    navigationMocks.push.mockReset().mockImplementation((url: string) => navigationMocks.pushUrl(url));
    navigationMocks.replace.mockReset().mockImplementation((url: string) => navigationMocks.replaceUrl(url));
    navigationMocks.back.mockReset().mockImplementation(() => navigationMocks.backUrl());
    navigationMocks.pathname = '/admin';
    navigationMocks.seed('/admin');
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
    navigationMocks.seed('/admin?tab=conversations');
    render(<AdminAuditCenter />);

    expect(await screen.findByText('压测会话')).toBeInTheDocument();
    expect(apiMocks.getAdminConversations).toHaveBeenCalled();
  });

  it('点击页签写入历史并清除详情参数', async () => {
    navigationMocks.seed('/admin?tab=users&user_id=user-1');
    render(<AdminAuditCenter />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: '对话', hidden: true }), { button: 0, ctrlKey: false });

    expect(navigationMocks.push).toHaveBeenCalledWith('/admin?tab=conversations', { scroll: false });
  });

  it('用户详情由 URL 恢复；UI 打开后关闭走 back，直接深链关闭回父列表', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
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
    const { unmount } = render(<AdminAuditCenter />);
    await screen.findByText('@tester');

    fireEvent.click(screen.getByRole('button', { name: '查看用户详情 user-1' }));
    expect(navigationMocks.push).toHaveBeenCalledWith('/admin?tab=users&user_id=user-1', { scroll: false });
    const dialog = await screen.findByRole('dialog', { name: '用户详情' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(navigationMocks.back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '用户详情' })).toBeNull());
    expect(navigationMocks.search).toBe('');
    unmount();

    navigationMocks.seed('/admin?tab=users&user_id=user-1');
    render(<AdminAuditCenter />);
    const deepLinkDialog = await screen.findByRole('dialog', { name: '用户详情' });
    navigationMocks.replace.mockClear();
    fireEvent.click(within(deepLinkDialog).getByRole('button', { name: 'Close' }));
    expect(navigationMocks.replace).toHaveBeenCalledWith('/admin', { scroll: false });
  });

  it('用户详情到用户对话使用 replace，对话详情 push 且返回走 back', async () => {
    apiMocks.getAdminConversations.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'conv-1', title: '用户对话', model_id: 'gpt-5', created_at: null, updated_at: null,
        user: { id: 'user-1', username: 'tester', nickname: null, email_masked: 't***@example.com' },
        message_count: 2, tool_call_count: 1, file_count: 0, input_tokens: 10, output_tokens: 20,
        latest_agent_status: 'completed',
      }],
    });
    apiMocks.getAdminConversation.mockResolvedValue({
      id: 'conv-1', title: '用户对话', model_id: 'gpt-5', created_at: null, updated_at: null,
      user: { id: 'user-1', username: 'tester', nickname: null, email_masked: 't***@example.com' },
    });
    navigationMocks.seed('/admin?tab=conversations&user_id=user-1');
    const { unmount } = render(<AdminAuditCenter />);
    await screen.findByText('用户对话');

    fireEvent.click(screen.getByRole('button', { name: '查看对话详情 conv-1' }));
    expect(navigationMocks.push).toHaveBeenCalledWith(
      '/admin?tab=conversations&user_id=user-1&conversation_id=conv-1',
      { scroll: false },
    );
    const detail = await screen.findByLabelText('对话详情 conv-1');
    fireEvent.click(within(detail).getByRole('button', { name: '返回对话列表' }));
    expect(navigationMocks.back).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: '查看对话详情 conv-1' })).toBeInTheDocument();
    expect(navigationMocks.search).toBe('tab=conversations&user_id=user-1');
    unmount();

    navigationMocks.seed('/admin?tab=conversations&user_id=user-1&conversation_id=conv-1');
    render(<AdminAuditCenter />);
    const deepDetail = await screen.findByLabelText('对话详情 conv-1');
    navigationMocks.replace.mockClear();
    fireEvent.click(within(deepDetail).getByRole('button', { name: '返回对话列表' }));
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/admin?tab=conversations&user_id=user-1',
      { scroll: false },
    );
  });

  it('浏览器历史参数变化会恢复页签、用户筛选和压测详情', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        run_id: 'perf-1', environment: 'production', model_id: null, status: 'completed',
        schema_version: 2, started_at: null, finished_at: null, created_at: null,
      }],
    });
    apiMocks.getAdminPerformanceRun.mockResolvedValue({
      run_id: 'perf-1', environment: 'production', model_id: null, status: 'completed',
      schema_version: 2, started_at: null, finished_at: null, created_at: null,
      imported_by_user_id: 'admin-1', safe_summary: { stages: [], resources: null },
    });
    render(<AdminAuditCenter />);

    act(() => navigationMocks.setUrl('/admin?tab=conversations&user_id=user-pop'));
    await waitFor(() => expect(screen.getByRole('tab', { name: '对话' })).toHaveAttribute('data-state', 'active'));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-pop');

    act(() => navigationMocks.setUrl('/admin?tab=performance&run_id=perf-1'));
    expect(await screen.findByLabelText('压测详情 perf-1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '压测' })).toHaveAttribute('data-state', 'active');
  });

  it('UI 打开压测详情后收起会真实回到压测列表 URL', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        run_id: 'perf-ui', environment: 'production', model_id: null, status: 'completed',
        schema_version: 2, started_at: null, finished_at: null, created_at: null,
      }],
    });
    apiMocks.getAdminPerformanceRun.mockResolvedValue({
      run_id: 'perf-ui', environment: 'production', model_id: null, status: 'completed',
      schema_version: 2, started_at: null, finished_at: null, created_at: null,
      imported_by_user_id: 'admin-1', safe_summary: { stages: [], resources: null },
    });
    navigationMocks.seed('/admin?tab=performance');
    render(<AdminAuditCenter />);
    await screen.findByText('perf-ui');

    fireEvent.click(screen.getByRole('button', { name: '查看压测详情 perf-ui' }));
    expect(await screen.findByLabelText('压测详情 perf-ui')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起压测详情 perf-ui' }));

    await waitFor(() => expect(screen.queryByLabelText('压测详情 perf-ui')).toBeNull());
    expect(navigationMocks.search).toBe('tab=performance');
  });

  it('手动把用户筛选从 A 改成 B 后同步 URL，打开详情继续使用 B', async () => {
    apiMocks.getAdminConversations.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'conv-b', title: 'B 的对话', model_id: 'gpt-5', created_at: null, updated_at: null,
        user: { id: 'user-b', username: 'b', nickname: null, email_masked: 'b***@example.com' },
        message_count: 1, tool_call_count: 0, file_count: 0, input_tokens: 1, output_tokens: 2,
        latest_agent_status: null,
      }],
    });
    navigationMocks.seed('/admin?tab=conversations&user_id=user-a');
    const { unmount } = render(<AdminAuditCenter />);
    await screen.findByText('B 的对话');

    fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: 'user-b' } });
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
    expect(navigationMocks.replace).toHaveBeenLastCalledWith(
      '/admin?tab=conversations&user_id=user-b',
      { scroll: false },
    );
    await waitFor(() => expect(apiMocks.getAdminConversations.mock.calls.filter(
      ([query]) => query.user_id === 'user-b',
    )).toHaveLength(1));
    unmount();

    render(<AdminAuditCenter />);
    expect(await screen.findByLabelText('用户 ID')).toHaveValue('user-b');
    await waitFor(() => expect(apiMocks.getAdminConversations.mock.calls.filter(
      ([query]) => query.user_id === 'user-b',
    )).toHaveLength(2));

    fireEvent.click(await screen.findByRole('button', { name: '查看对话详情 conv-b' }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith(
      '/admin?tab=conversations&user_id=user-b&conversation_id=conv-b',
      { scroll: false },
    );
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

    expect(navigationMocks.replace).toHaveBeenLastCalledWith(
      '/admin?tab=conversations&user_id=user-1',
      { scroll: false },
    );

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
    navigationMocks.seed('/admin?tab=performance');
    render(<AdminAuditCenter />);
    expect(await screen.findByText('perf-sensitive')).toBeInTheDocument();
    expect(screen.getByText('完整执行')).toBeInTheDocument();
    expect(screen.getByText(/模型未采集/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看压测详情 perf-sensitive' }));

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByText('perf-sensitive')).toBeNull();
    expect(navigationMocks.replace).toHaveBeenLastCalledWith('/admin', { scroll: false });
  });
});
