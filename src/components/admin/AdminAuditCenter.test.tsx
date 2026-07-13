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
  getAdminModels: vi.fn(),
  getAdminModel: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
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
  forwardUrl() {
    if (this.historyIndex < this.history.length - 1) this.historyIndex += 1;
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
      forward: navigationMocks.forward,
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

const modelSummary = {
  model_id: 'model-a', name: '模型 A', provider: 'deepseek', provider_display: 'DeepSeek',
  catalog_status: 'active', health: { status: 'healthy' },
  capabilities: { vision: true, deepThinking: true, fileSupport: true, functionCalling: true },
  conversation_count: 1, user_count: 1, assistant_message_count: 2, input_tokens: 3, output_tokens: 4,
  last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
};

describe('AdminAuditCenter', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach(mock => mock.mockReset().mockResolvedValue(emptyPage));
    navigationMocks.push.mockReset().mockImplementation((url: string) => navigationMocks.pushUrl(url));
    navigationMocks.replace.mockReset().mockImplementation((url: string) => navigationMocks.replaceUrl(url));
    navigationMocks.back.mockReset().mockImplementation(() => navigationMocks.backUrl());
    navigationMocks.forward.mockReset().mockImplementation(() => navigationMocks.forwardUrl());
    navigationMocks.pathname = '/admin';
    navigationMocks.seed('/admin');
  });

  it('提供五个独立管理页签并默认加载用户列表', async () => {
    render(<AdminAuditCenter />);

    expect(screen.getByRole('tab', { name: '用户' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '模型' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '压测' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '访问审计' })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalled());
  });

  it('模型详情使用 URL/history，并可把 model_id 关联到对话筛选', async () => {
    const model = {
      model_id: 'model-a', name: '模型 A', provider: 'provider-a', provider_display: '提供商 A',
      catalog_status: 'active', health: { status: 'healthy' }, capabilities: { vision: true },
      conversation_count: 1, user_count: 1, assistant_message_count: 2, input_tokens: 3, output_tokens: 4,
      last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
    };
    apiMocks.getAdminModels.mockResolvedValue({ ...emptyPage, total: 1, total_pages: 1, items: [model] });
    apiMocks.getAdminModel.mockResolvedValue({
      ...model, context_window_tokens: 1000, max_output_tokens: 100, knowledge_cutoff: null,
      description: null, cost_tier: null, recommended_for: [], pricing: null,
    });
    navigationMocks.seed('/admin?tab=models');
    render(<AdminAuditCenter />);
    await screen.findByText('模型 A');
    fireEvent.click(screen.getByRole('button', { name: '查看模型详情 model-a' }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith('/admin?tab=models&model_id=model-a', { scroll: false });
    const detail = await screen.findByLabelText('模型详情 model-a');
    fireEvent.click(within(detail).getByRole('button', { name: '查看该模型的对话' }));
    expect(navigationMocks.push).toHaveBeenLastCalledWith('/admin?tab=conversations&model_id=model-a', { scroll: false });
    expect(await screen.findByLabelText('模型 ID')).toHaveValue('model-a');
    expect(apiMocks.getAdminConversations).toHaveBeenCalledWith(expect.objectContaining({ model_id: 'model-a' }), expect.any(AbortSignal));
    act(() => navigationMocks.backUrl());
    expect(await screen.findByLabelText('模型详情 model-a')).toBeInTheDocument();
  });

  it('模型详情在 UI 打开时返回走 back，直接深链返回规范化到模型列表', async () => {
    const model = {
      model_id: 'model-history', name: '历史测试模型', provider: 'p', provider_display: 'P',
      catalog_status: 'historical', health: { status: 'unknown' }, capabilities: {},
      conversation_count: 0, user_count: 0, assistant_message_count: 0, input_tokens: 0, output_tokens: 0,
      last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
    };
    apiMocks.getAdminModels.mockResolvedValue({ ...emptyPage, total: 1, total_pages: 1, items: [model] });
    apiMocks.getAdminModel.mockResolvedValue({ ...model, context_window_tokens: null, max_output_tokens: null, knowledge_cutoff: null, description: null, cost_tier: null, recommended_for: [], pricing: null });
    navigationMocks.seed('/admin?tab=models');
    const { unmount } = render(<AdminAuditCenter />);
    await screen.findByText('历史测试模型');
    fireEvent.click(screen.getByRole('button', { name: '查看模型详情 model-history' }));
    fireEvent.click(within(await screen.findByLabelText('模型详情 model-history')).getByRole('button', { name: '返回模型列表' }));
    expect(navigationMocks.back).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: '查看模型详情 model-history' })).toBeInTheDocument();
    expect(navigationMocks.search).toBe('tab=models');
    unmount();

    navigationMocks.seed('/admin?tab=models&model_id=model-history');
    render(<AdminAuditCenter />);
    fireEvent.click(within(await screen.findByLabelText('模型详情 model-history')).getByRole('button', { name: '返回模型列表' }));
    expect(navigationMocks.replace).toHaveBeenLastCalledWith('/admin?tab=models', { scroll: false });
  });

  it('模型详情返回 403 时清理 model_id 并卸载运营内容', async () => {
    apiMocks.getAdminModel.mockRejectedValue(new ApiError('FORBIDDEN', '需要管理员权限', 'req-model'));
    navigationMocks.seed('/admin?tab=models&model_id=model-sensitive');
    render(<AdminAuditCenter />);
    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(navigationMocks.replace).toHaveBeenLastCalledWith('/admin', { scroll: false });
    expect(screen.queryByLabelText('模型详情 model-sensitive')).toBeNull();
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

  it('路由提交变慢时仍立即切换页签并开始加载目标面板', async () => {
    navigationMocks.push.mockImplementation(() => undefined);
    render(<AdminAuditCenter />);
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(1));

    fireEvent.mouseDown(screen.getByRole('tab', { name: '模型' }), { button: 0, ctrlKey: false });

    expect(screen.getByRole('tab', { name: '模型' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-state', 'inactive');
    await waitFor(() => expect(apiMocks.getAdminModels).toHaveBeenCalledTimes(1));
    expect(navigationMocks.search).toBe('');
  });

  it('只挂载访问过的页签，切回时保留草稿且不重复请求列表', async () => {
    render(<AdminAuditCenter />);
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(1));
    expect(apiMocks.getAdminConversations).not.toHaveBeenCalled();
    expect(apiMocks.getAdminModels).not.toHaveBeenCalled();
    expect(apiMocks.getAdminPerformanceRuns).not.toHaveBeenCalled();
    expect(apiMocks.getAdminAuditEvents).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('搜索用户'), { target: { value: '尚未提交的草稿' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: '模型' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(apiMocks.getAdminModels).toHaveBeenCalledTimes(1));
    fireEvent.mouseDown(screen.getByRole('tab', { name: '用户' }), { button: 0, ctrlKey: false });

    expect(screen.getByLabelText('搜索用户')).toHaveValue('尚未提交的草稿');
    expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(1);
    expect(apiMocks.getAdminConversations).not.toHaveBeenCalled();
    expect(apiMocks.getAdminPerformanceRuns).not.toHaveBeenCalled();
    expect(apiMocks.getAdminAuditEvents).not.toHaveBeenCalled();
  });

  it('方向键只移动页签焦点，不触发导航或加载', async () => {
    render(<AdminAuditCenter />);
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(1));
    const usersTab = screen.getByRole('tab', { name: '用户' });
    usersTab.focus();

    fireEvent.keyDown(usersTab, { key: 'ArrowRight' });

    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-state', 'active');
    expect(apiMocks.getAdminConversations).not.toHaveBeenCalled();

    const conversationsTab = screen.getByRole('tab', { name: '对话' });
    await waitFor(() => expect(conversationsTab).toHaveFocus());
    fireEvent.keyDown(conversationsTab, { key: 'Enter', code: 'Enter' });
    fireEvent.keyUp(conversationsTab, { key: 'Enter', code: 'Enter' });
    expect(navigationMocks.push).toHaveBeenCalledWith('/admin?tab=conversations', { scroll: false });
  });

  it('切换后隐藏旧面板并卸载模型下拉框和能力浮层 Portal', async () => {
    apiMocks.getAdminModels.mockResolvedValue({
      ...emptyPage,
      total: 1,
      total_pages: 1,
      items: [modelSummary],
      provider_options: [{ value: 'deepseek', label: 'DeepSeek' }],
    });
    navigationMocks.seed('/admin?tab=models');
    render(<AdminAuditCenter />);
    await screen.findByText('模型 A');

    fireEvent.click(screen.getByLabelText('模型提供商'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    act(() => navigationMocks.setUrl('/admin'));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    const modelsPanel = document.getElementById(screen.getByRole('tab', { name: '模型' }).getAttribute('aria-controls')!);
    expect(modelsPanel).toHaveClass('data-[state=inactive]:hidden');
    expect(modelsPanel).toHaveAttribute('data-state', 'inactive');
    expect(modelsPanel).toHaveAttribute('hidden');

    fireEvent.mouseDown(screen.getByRole('tab', { name: '模型' }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /显示另外 2 项能力/ }));
    expect(screen.getByLabelText('其余模型能力')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '用户' }), { button: 0, ctrlKey: false });
    expect(screen.queryByLabelText('其余模型能力')).toBeNull();
  });

  it('模型深链首屏只挂载目标页签，不预取其他管理列表', async () => {
    apiMocks.getAdminModels.mockResolvedValue({ ...emptyPage, items: [modelSummary] });
    navigationMocks.seed('/admin?tab=models');
    render(<AdminAuditCenter />);

    await screen.findByText('模型 A');
    expect(apiMocks.getAdminModels).toHaveBeenCalledTimes(1);
    expect(apiMocks.getAdminUsers).not.toHaveBeenCalled();
    expect(apiMocks.getAdminConversations).not.toHaveBeenCalled();
    expect(apiMocks.getAdminPerformanceRuns).not.toHaveBeenCalled();
    expect(apiMocks.getAdminAuditEvents).not.toHaveBeenCalled();
  });

  it('浏览器返回会覆盖乐观状态并同步到历史页签', async () => {
    render(<AdminAuditCenter />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '模型' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByRole('tab', { name: '模型' })).toHaveAttribute('data-state', 'active'));

    act(() => navigationMocks.backUrl());

    await waitFor(() => expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-state', 'active'));
    expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(1);
  });

  it('浏览器前进会恢复已访问页签且复用缓存数据', async () => {
    render(<AdminAuditCenter />);
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(1));
    fireEvent.mouseDown(screen.getByRole('tab', { name: '模型' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(apiMocks.getAdminModels).toHaveBeenCalledTimes(1));

    act(() => navigationMocks.backUrl());
    await waitFor(() => expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-state', 'active'));
    act(() => navigationMocks.forwardUrl());

    await waitFor(() => expect(screen.getByRole('tab', { name: '模型' })).toHaveAttribute('data-state', 'active'));
    expect(apiMocks.getAdminUsers).toHaveBeenCalledTimes(1);
    expect(apiMocks.getAdminModels).toHaveBeenCalledTimes(1);
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
