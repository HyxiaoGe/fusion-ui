import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';

const apiMocks = vi.hoisted(() => ({
  getAdminConversations: vi.fn(),
  getAdminConversation: vi.fn(),
  getAdminConversationMessages: vi.fn(),
  getAdminConversationToolCalls: vi.fn(),
  getAdminConversationAgentRuns: vi.fn(),
  getAdminConversationFiles: vi.fn(),
  getAdminModels: vi.fn(),
  getAdminModel: vi.fn(),
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);
vi.mock('@/components/models/ProviderIcon', () => ({
  default: ({ providerId }: { providerId: string }) => (
    <span data-testid={`provider-icon-${providerId}`} aria-label={`${providerId} icon`} />
  ),
}));

import AdminConversationsPanel from './AdminConversationsPanel';

const emptyPage = {
  items: [], total: 0, page: 1, page_size: 25, total_pages: 0, has_next: false, has_prev: false,
};

const conversations = ['alpha', 'beta'].map((username, index) => ({
  id: `conv-${index + 1}`,
  title: `对话 ${index + 1}`,
  user: { id: `user-${username}`, username, nickname: '同名用户', email_masked: 's***@example.com' },
  model_id: 'gpt-5', message_count: 1, tool_call_count: 1, file_count: 0,
  latest_agent_status: 'completed', input_tokens: 1, output_tokens: 2,
  created_at: null, updated_at: null,
}));
const noop = () => undefined;

function ControlledConversationsPanel({
  active = true, userIdFilter, modelIdFilter, onUserFilterChange = noop, onFiltersChange, onForbidden = noop,
}: { active?: boolean; userIdFilter?: string; modelIdFilter?: string; onUserFilterChange?: (userId?: string) => void; onFiltersChange?: (filters: { userId?: string; modelId?: string }) => void; onForbidden?: () => void }) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  return (
    <AdminConversationsPanel
      active={active}
      onForbidden={onForbidden}
      userIdFilter={userIdFilter}
      modelIdFilter={modelIdFilter}
      onUserFilterChange={onUserFilterChange}
      onFiltersChange={onFiltersChange}
      selectedConversationId={selectedConversationId}
      onOpen={setSelectedConversationId}
      onBack={() => setSelectedConversationId(null)}
    />
  );
}

describe('AdminConversationsPanel', () => {
  beforeEach(() => {
    const modelItems = [
      {
        model_id: 'model-a', name: '模型 Alpha', provider: 'provider-a', provider_display: '提供商 A',
        catalog_status: 'active', catalog_availability: 'available', health: { status: 'healthy' }, capabilities: {},
        conversation_count: 1, user_count: 1, assistant_message_count: 1, input_tokens: 1, output_tokens: 1,
        last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
      },
      {
        model_id: 'model-b', name: '模型 Beta', provider: 'provider-b', provider_display: '提供商 B',
        catalog_status: 'historical', catalog_availability: 'available', health: null, capabilities: {},
        conversation_count: 1, user_count: 1, assistant_message_count: 1, input_tokens: 1, output_tokens: 1,
        last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
      },
    ];
    apiMocks.getAdminModels.mockReset().mockImplementation(({ q = '' }: { q?: string }) => {
      const normalized = q.toLowerCase();
      const items = modelItems.filter(model => !normalized
        || model.name.toLowerCase().includes(normalized)
        || model.model_id.toLowerCase().includes(normalized));
      return Promise.resolve({
        ...emptyPage, items, total: items.length, total_pages: items.length ? 1 : 0,
        catalog_availability: 'available', excluded_invalid_model_count: 0, provider_options: [],
      });
    });
    apiMocks.getAdminModel.mockReset().mockImplementation((modelId: string) => {
      const model = modelItems.find(item => item.model_id === modelId);
      if (model) return Promise.resolve(model);
      if (modelId === 'retired-model-v1') {
        return Promise.resolve({
          ...modelItems[1],
          model_id: modelId,
          name: '历史模型',
          provider: null,
          provider_display: null,
          catalog_status: 'historical',
        });
      }
      return Promise.reject(new Error('模型不存在'));
    });
    apiMocks.getAdminConversations.mockReset().mockResolvedValue({
      ...emptyPage, items: conversations, total: 2, total_pages: 1,
    });
    apiMocks.getAdminConversation.mockReset().mockResolvedValue(conversations[0]);
    apiMocks.getAdminConversationMessages.mockReset().mockResolvedValue(emptyPage);
    apiMocks.getAdminConversationFiles.mockReset().mockResolvedValue(emptyPage);
    apiMocks.getAdminConversationAgentRuns.mockReset().mockImplementation((_id, query) => Promise.resolve({
      ...emptyPage,
      page: query.page,
      total: 26,
      total_pages: 2,
      items: [{
        id: `run-page-${query.page}`, message_id: null, user_id: 'user-alpha', status: 'completed',
        model_id: 'gpt-5', provider: 'openai', total_steps: 0, total_tool_calls: 0,
        total_duration_ms: 100, limit_reason: null, config: null, error: null,
        created_at: null, progress: null, steps: [],
      }],
    }));
    apiMocks.getAdminConversationToolCalls.mockReset().mockImplementation((_id, query) => Promise.resolve({
      ...emptyPage,
      page: query.page,
      total: 26,
      total_pages: 2,
      items: [{
        id: `tool-page-${query.page}`, message_id: null, trace_id: null, step_number: null,
        tool_name: `tool_${query.page}`, status: 'success', duration_ms: 10,
        model_id: null, provider: null, arguments: {}, result_preview: {}, error: null,
        redacted_fields: [], created_at: null,
      }],
    }));
  });

  it('列表与详情在身份碰撞时仍展示昵称、username 和 user_id', async () => {
    render(<ControlledConversationsPanel />);

    await screen.findByText('对话 1');
    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('@beta')).toBeInTheDocument();
    expect(screen.getByText('user-alpha')).toBeInTheDocument();
    expect(screen.getByText('user-beta')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看对话详情 conv-1' }));

    const detail = await screen.findByLabelText('对话详情 conv-1');
    await waitFor(() => expect(detail).toHaveTextContent('同名用户'));
    expect(detail).toHaveTextContent('@alpha');
    expect(detail).toHaveTextContent('user-alpha');
    expect(detail).toHaveTextContent('s***@example.com');
  });

  it('对话单元格展示更新时间和创建时间，全部缺失时显示时间未记录且保持紧凑宽度', async () => {
    apiMocks.getAdminConversations.mockResolvedValue({
      ...emptyPage,
      items: [
        {
          ...conversations[0],
          created_at: '2026-07-11T09:30:00Z',
          updated_at: '2026-07-12T02:15:00Z',
        },
        conversations[1],
      ],
      total: 2,
      total_pages: 1,
    });

    render(<ControlledConversationsPanel />);

    const firstTime = await screen.findByLabelText('对话时间 conv-1');
    expect(firstTime).toHaveTextContent('更新：2026/7/12 10:15:00（北京时间）');
    expect(firstTime).toHaveTextContent('创建：2026/7/11 17:30:00（北京时间）');
    expect(firstTime.textContent?.indexOf('更新：')).toBeLessThan(firstTime.textContent?.indexOf('创建：') ?? 0);

    const secondTime = screen.getByLabelText('对话时间 conv-2');
    expect(secondTime).toHaveTextContent('时间未记录');
    expect(firstTime.closest('td')).toHaveTextContent('对话 1');
    expect(firstTime.closest('table')).toHaveClass('min-w-[1100px]');
    expect(firstTime.closest('table')).not.toHaveClass('min-w-[1400px]');
  });

  it('Agent runs 与 tool calls 使用独立页码和请求', async () => {
    render(<ControlledConversationsPanel />);
    await screen.findByText('对话 1');
    fireEvent.click(screen.getByRole('button', { name: '查看对话详情 conv-1' }));

    const runsSection = await screen.findByLabelText('Agent 运行记录');
    const toolsSection = await screen.findByLabelText('工具调用记录');
    expect(within(runsSection).getByText('run-page-1')).toBeInTheDocument();
    expect(within(toolsSection).getByText('tool_1')).toBeInTheDocument();

    fireEvent.click(within(runsSection).getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(apiMocks.getAdminConversationAgentRuns).toHaveBeenCalledTimes(2));
    expect(apiMocks.getAdminConversationToolCalls).toHaveBeenCalledTimes(1);
    expect(apiMocks.getAdminConversationAgentRuns.mock.calls[1][1]).toMatchObject({ page: 2, page_size: 25 });
    expect(await within(runsSection).findByText('run-page-2')).toBeInTheDocument();

    fireEvent.click(within(toolsSection).getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(apiMocks.getAdminConversationToolCalls).toHaveBeenCalledTimes(2));
    expect(apiMocks.getAdminConversationAgentRuns).toHaveBeenCalledTimes(2);
    expect(apiMocks.getAdminConversationToolCalls.mock.calls[1][1]).toMatchObject({ page: 2, page_size: 25 });
    expect(await within(toolsSection).findByText('tool_2')).toBeInTheDocument();
  });

  it('外部用户 ID 同时同步到筛选输入和实际列表请求', async () => {
    const { rerender } = render(<ControlledConversationsPanel userIdFilter="user-alpha" />);

    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-alpha' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-alpha');

    rerender(<ControlledConversationsPanel userIdFilter="user-beta" />);
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'user-beta' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-beta');
  });

  it('手动应用用户 ID 时通知路由同步最新筛选', async () => {
    const onUserFilterChange = vi.fn();
    render(<ControlledConversationsPanel userIdFilter="user-a" onUserFilterChange={onUserFilterChange} />);
    await screen.findByText('对话 1');

    fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: '  user-b  ' } });
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));

    expect(onUserFilterChange).toHaveBeenCalledWith('user-b');
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'user-b' }),
      expect.any(AbortSignal),
    ));
  });

  it('重置筛选会清空全部草稿、立即刷新未筛选列表并同步清理路由', async () => {
    const onFiltersChange = vi.fn();
    render(<ControlledConversationsPanel userIdFilter="user-a" modelIdFilter="model-a" onFiltersChange={onFiltersChange} />);
    await screen.findByText('对话 1');

    fireEvent.change(screen.getByLabelText('搜索对话'), { target: { value: '缓存' } });
    fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: 'user-b' } });
    fireEvent.change(screen.getByLabelText('是否有工具调用'), { target: { value: 'true' } });
    fireEvent.change(screen.getByLabelText('是否有文件'), { target: { value: 'false' } });
    fireEvent.change(screen.getByLabelText('创建开始日期'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('创建结束日期'), { target: { value: '2026-07-14' } });

    const trigger = screen.getByRole('combobox', { name: '模型筛选' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: /模型 Beta.*model-b/ }));
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: '缓存', user_id: 'user-b', model_id: 'model-b', has_tools: true, has_files: false,
        created_from: '2026-07-01', created_to: '2026-07-14',
      }),
      expect.any(AbortSignal),
    ));

    fireEvent.click(screen.getByRole('button', { name: '重置筛选' }));

    expect(screen.getByLabelText('搜索对话')).toHaveValue('');
    expect(screen.getByLabelText('用户 ID')).toHaveValue('');
    expect(trigger).toHaveTextContent('模型不限');
    expect(screen.getByLabelText('是否有工具调用')).toHaveValue('');
    expect(screen.getByLabelText('是否有文件')).toHaveValue('');
    expect(screen.getByLabelText('创建开始日期')).toHaveValue('');
    expect(screen.getByLabelText('创建结束日期')).toHaveValue('');
    expect(onFiltersChange).toHaveBeenLastCalledWith({ userId: undefined, modelId: undefined });
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      { page: 1, page_size: 25 },
      expect.any(AbortSignal),
    ));
  });

  it('模型筛选默认不限，并可按名称或 ID 搜索目录选项', async () => {
    render(<ControlledConversationsPanel />);
    await screen.findByText('对话 1');

    const trigger = screen.getByRole('combobox', { name: '模型筛选' });
    expect(trigger).toHaveTextContent('模型不限');

    fireEvent.click(trigger);
    const listbox = await screen.findByRole('listbox', { name: '模型筛选选项' });
    expect(within(listbox).getByRole('option', { name: /模型 Alpha.*提供商 A.*model-a/ })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /模型 Beta.*提供商 B.*model-b/ })).toBeInTheDocument();
    expect(within(listbox).getByTestId('provider-icon-provider-a')).toBeInTheDocument();
    expect(within(listbox).getByTestId('provider-icon-provider-b')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: '搜索模型' });
    fireEvent.change(search, { target: { value: 'beta' } });
    await waitFor(() => expect(apiMocks.getAdminModels).toHaveBeenLastCalledWith(
      expect.objectContaining({ page_size: 100, q: 'beta' }), expect.any(AbortSignal),
    ));
    await waitFor(() => expect(within(listbox).queryByRole('option', { name: /模型 Alpha/ })).toBeNull());
    expect(within(listbox).getByRole('option', { name: /模型 Beta/ })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'model-a' } });
    expect(await within(listbox).findByRole('option', { name: /模型 Alpha/ })).toBeInTheDocument();
  });

  it('外部 model_id 同步到可搜索下拉和请求，手动组合筛选一次通知路由', async () => {
    const onFiltersChange = vi.fn();
    render(<ControlledConversationsPanel userIdFilter="user-a" modelIdFilter="model-a" onFiltersChange={onFiltersChange} />);
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-a', model_id: 'model-a' }), expect.any(AbortSignal),
    ));
    const trigger = screen.getByRole('combobox', { name: '模型筛选' });
    expect(trigger).toHaveTextContent('model-a');
    expect(trigger).not.toHaveTextContent('加载中');
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveTextContent('模型 Alpha'));
    expect(within(trigger).getByTestId('provider-icon-provider-a')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('option', { name: /模型 Beta.*提供商 B.*model-b/ }));
    expect(within(trigger).getByTestId('provider-icon-provider-b')).toBeInTheDocument();
    expect(onFiltersChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
    expect(onFiltersChange).toHaveBeenCalledWith({ userId: 'user-a', modelId: 'model-b' });
  });

  it('目录外的 URL 历史 model_id 仍显示临时选项并支持搜索和清除', async () => {
    const onFiltersChange = vi.fn();
    render(<ControlledConversationsPanel modelIdFilter="retired-model-v1" onFiltersChange={onFiltersChange} />);

    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenCalledWith(
      expect.objectContaining({ model_id: 'retired-model-v1' }), expect.any(AbortSignal),
    ));
    const trigger = screen.getByRole('combobox', { name: '模型筛选' });
    await waitFor(() => expect(trigger).toHaveTextContent('历史模型'));
    expect(trigger).toHaveTextContent('retired-model-v1');

    fireEvent.click(trigger);
    const listbox = await screen.findByRole('listbox', { name: '模型筛选选项' });
    await waitFor(() => expect(trigger).toHaveTextContent('历史模型'));
    const search = screen.getByRole('searchbox', { name: '搜索模型' });
    fireEvent.change(search, { target: { value: 'retired-model' } });
    expect(within(listbox).getByRole('option', { name: /历史模型.*retired-model-v1/ })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(within(listbox).getByRole('option', { name: '模型不限' }));
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
    expect(onFiltersChange).toHaveBeenCalledWith({ userId: undefined, modelId: undefined });
  });

  it('模型列表超过一页时不把未加载到的当前模型误标为历史模型', async () => {
    apiMocks.getAdminModels.mockReset().mockImplementation(({ q = '' }: { q?: string }) => {
      if (q === 'outside-page-current') {
        return Promise.resolve({
          ...emptyPage,
          items: [{
            model_id: 'outside-page-current', name: '分页外当前模型', provider: 'provider-c', provider_display: '提供商 C',
            catalog_status: 'active', catalog_availability: 'available', health: null, capabilities: {},
            conversation_count: 0, user_count: 0, assistant_message_count: 0, input_tokens: 0, output_tokens: 0,
            last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
          }],
          total: 1,
          total_pages: 1,
          catalog_availability: 'available',
          excluded_invalid_model_count: 0,
          provider_options: [],
        });
      }
      return Promise.resolve({
        ...emptyPage,
        items: [],
        total: 101,
        total_pages: 2,
        has_next: true,
        catalog_availability: 'available',
        excluded_invalid_model_count: 0,
        provider_options: [],
      });
    });
    apiMocks.getAdminModel.mockResolvedValueOnce({
      model_id: 'outside-page-current', name: '分页外当前模型', provider: 'provider-c', provider_display: '提供商 C',
      catalog_status: 'active', catalog_availability: 'available', health: null, capabilities: {},
      conversation_count: 0, user_count: 0, assistant_message_count: 0, input_tokens: 0, output_tokens: 0,
      last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
    });
    render(<ControlledConversationsPanel modelIdFilter="outside-page-current" />);

    const trigger = screen.getByRole('combobox', { name: '模型筛选' });
    await waitFor(() => expect(trigger).toHaveTextContent('分页外当前模型'));
    fireEvent.click(trigger);
    await waitFor(() => expect(apiMocks.getAdminModels).toHaveBeenCalledWith(
      expect.objectContaining({ q: '' }), expect.any(AbortSignal),
    ));
    expect(trigger).toHaveTextContent('分页外当前模型');
    expect(trigger).not.toHaveTextContent('历史模型');

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索模型' }), { target: { value: 'outside-page-current' } });
    await waitFor(() => expect(trigger).toHaveTextContent('分页外当前模型'));
  });

  it('模型结果异步插入和重排后 Enter 仍选择高亮的同一模型', async () => {
    let resolveModels: ((value: unknown) => void) | undefined;
    apiMocks.getAdminModel.mockResolvedValueOnce({
      model_id: 'model-c', name: '模型 Gamma', provider: 'provider-c', provider_display: '提供商 C',
      catalog_status: 'active', catalog_availability: 'available', health: null, capabilities: {},
      conversation_count: 0, user_count: 0, assistant_message_count: 0, input_tokens: 0, output_tokens: 0,
      last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
    });
    apiMocks.getAdminModels.mockReset().mockImplementation(() => new Promise(resolve => {
      resolveModels = resolve;
    }));
    render(<ControlledConversationsPanel modelIdFilter="model-c" />);

    const trigger = screen.getByRole('combobox', { name: '模型筛选' });
    await waitFor(() => expect(trigger).toHaveTextContent('模型 Gamma'));
    fireEvent.click(trigger);
    const search = await screen.findByRole('searchbox', { name: '搜索模型' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });

    resolveModels?.({
      ...emptyPage,
      items: [
        {
          model_id: 'model-a', name: '模型 Alpha', provider: 'provider-a', provider_display: '提供商 A',
          catalog_status: 'active', catalog_availability: 'available', health: null, capabilities: {},
          conversation_count: 0, user_count: 0, assistant_message_count: 0, input_tokens: 0, output_tokens: 0,
          last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
        },
        {
          model_id: 'model-c', name: '模型 Gamma', provider: 'provider-c', provider_display: '提供商 C',
          catalog_status: 'active', catalog_availability: 'available', health: null, capabilities: {},
          conversation_count: 0, user_count: 0, assistant_message_count: 0, input_tokens: 0, output_tokens: 0,
          last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
        },
      ],
      total: 2, total_pages: 1, catalog_availability: 'available', excluded_invalid_model_count: 0,
      provider_options: [],
    });
    await screen.findByRole('option', { name: /模型 Alpha.*model-a/ });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(trigger).toHaveTextContent('模型 Gamma');
    expect(trigger).not.toHaveTextContent('模型 Alpha');
  });

  it('搜索框支持方向键高亮、Enter 选择和 Escape 关闭', async () => {
    render(<ControlledConversationsPanel />);
    const trigger = screen.getByRole('combobox', { name: '模型筛选' });
    fireEvent.click(trigger);
    const search = await screen.findByRole('searchbox', { name: '搜索模型' });
    const firstModel = await screen.findByRole('option', { name: /模型 Alpha.*model-a/ });

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search).toHaveAttribute('aria-activedescendant', 'admin-model-filter-option-0');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search).toHaveAttribute('aria-activedescendant', firstModel.id);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(trigger).toHaveTextContent('模型 Alpha');
    expect(screen.queryByRole('listbox', { name: '模型筛选选项' })).toBeNull();

    fireEvent.click(trigger);
    const reopenedSearch = await screen.findByRole('searchbox', { name: '搜索模型' });
    fireEvent.keyDown(reopenedSearch, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: '模型筛选选项' })).toBeNull();
  });

  it('模型目录加载、空结果和失败均留在下拉内，不会误提交外层筛选表单', async () => {
    let resolveModels: ((value: unknown) => void) | undefined;
    apiMocks.getAdminModels.mockReset().mockImplementation(() => new Promise(resolve => {
      resolveModels = resolve;
    }));
    const onFiltersChange = vi.fn();
    render(<ControlledConversationsPanel onFiltersChange={onFiltersChange} />);

    fireEvent.click(screen.getByRole('combobox', { name: '模型筛选' }));
    expect(await screen.findByText('正在加载模型…')).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: '搜索模型' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onFiltersChange).not.toHaveBeenCalled();

    resolveModels?.({
      ...emptyPage, catalog_availability: 'available', excluded_invalid_model_count: 0,
      provider_options: [],
    });
    expect(await screen.findByText('没有匹配的模型')).toBeInTheDocument();

    apiMocks.getAdminModels.mockRejectedValueOnce(new Error('模型目录读取失败'));
    fireEvent.change(search, { target: { value: 'failure' } });
    expect(await screen.findByText('模型目录读取失败')).toBeInTheDocument();
  });

  it('模型目录返回 403 时沿用管理中心权限失效处理', async () => {
    const onForbidden = vi.fn();
    apiMocks.getAdminModels.mockReset().mockRejectedValue(new ApiError('FORBIDDEN', '需要管理员权限', 'req-model-filter'));
    render(<ControlledConversationsPanel onForbidden={onForbidden} />);

    fireEvent.click(screen.getByRole('combobox', { name: '模型筛选' }));
    await waitFor(() => expect(onForbidden).toHaveBeenCalledTimes(1));
  });

  it('模型搜索请求先 trim 再限制为 200 字符，并中止被后续查询替代的请求', async () => {
    const requests: Array<{
      query: { q?: string };
      signal: AbortSignal;
      resolve: (value: unknown) => void;
    }> = [];
    apiMocks.getAdminModels.mockReset().mockImplementation((query, signal) => new Promise(resolve => {
      requests.push({ query, signal, resolve });
    }));
    render(<ControlledConversationsPanel />);

    fireEvent.click(screen.getByRole('combobox', { name: '模型筛选' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    const firstRequest = requests[0];
    const longQuery = `   ${'x'.repeat(210)}   `;
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索模型' }), { target: { value: longQuery } });

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].query.q).toBe('x'.repeat(200));
    expect(firstRequest.signal.aborted).toBe(true);

    requests[1].resolve({
      ...emptyPage,
      items: [{
        model_id: 'fresh-model', name: '新结果', provider: 'p', provider_display: 'P',
        catalog_status: 'active', catalog_availability: 'available', health: null, capabilities: {},
        conversation_count: 0, user_count: 0, assistant_message_count: 0, input_tokens: 0, output_tokens: 0,
        last_used_at: null, agent_run_count: 0, agent_error_count: 0, latest_performance_run: null,
      }],
      total: 1, total_pages: 1, catalog_availability: 'available', excluded_invalid_model_count: 0,
      provider_options: [],
    });
    expect(await screen.findByRole('option', { name: /新结果.*fresh-model/ })).toBeInTheDocument();

    firstRequest.resolve({
      ...emptyPage,
      items: [{ model_id: 'stale-model', name: '过期结果', provider: null, provider_display: null, catalog_status: 'historical' }],
      total: 1, total_pages: 1, catalog_availability: 'available', excluded_invalid_model_count: 0,
      provider_options: [],
    });
    await Promise.resolve();
    expect(screen.queryByRole('option', { name: /过期结果/ })).toBeNull();
  });

  it('切换离开对话页时关闭已打开的模型筛选 Portal', async () => {
    const view = render(<ControlledConversationsPanel active />);
    fireEvent.click(screen.getByRole('combobox', { name: '模型筛选' }));
    expect(await screen.findByRole('listbox', { name: '模型筛选选项' })).toBeInTheDocument();

    view.rerender(<ControlledConversationsPanel active={false} />);
    await waitFor(() => expect(screen.queryByRole('listbox', { name: '模型筛选选项' })).toBeNull());
  });
});
