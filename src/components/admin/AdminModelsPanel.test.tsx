import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ getAdminModels: vi.fn(), getAdminModel: vi.fn() }));
vi.mock('@/lib/api/adminAudit', () => apiMocks);

import AdminModelsPanel, { formatModelHealthCheckedAt } from './AdminModelsPanel';

const model = {
  model_id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'moonshot', provider_display: 'Moonshot',
  catalog_status: 'active', catalog_availability: 'available',
  health: { status: 'healthy', error: null, checked_at: 1783828800 },
  capabilities: { deepThinking: true, vision: true, functionCalling: true, secretKey: false },
  conversation_count: 12, user_count: 5, assistant_message_count: 34,
  input_tokens: 1200, output_tokens: 800, last_used_at: '2026-07-12T00:00:00Z',
  agent_run_count: 7, agent_error_count: 1,
  latest_performance_run: { run_id: 'perf-1', status: 'completed', environment: 'production', started_at: '2026-07-11T00:00:00Z', finished_at: '2026-07-11T00:10:00Z' },
};
const page = { items: [model], total: 1, page: 1, page_size: 25, total_pages: 1, has_next: false, has_prev: false };
const detail = {
  ...model,
  context_window_tokens: 131072,
  max_output_tokens: 8192,
  knowledge_cutoff: '2025-01',
  description: '适合长文本与 Agent 任务',
  cost_tier: 'medium',
  recommended_for: ['长文本', 'Agent'],
};
const noop = () => undefined;

function ControlledModelsPanel({ onViewConversations = noop, initialModelId = null }: {
  onViewConversations?: (modelId: string) => void;
  initialModelId?: string | null;
}) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(initialModelId);
  return <AdminModelsPanel onForbidden={noop} selectedModelId={selectedModelId} onOpen={setSelectedModelId} onBack={() => setSelectedModelId(null)} onViewConversations={onViewConversations} />;
}

describe('AdminModelsPanel', () => {
  beforeEach(() => {
    apiMocks.getAdminModels.mockReset().mockResolvedValue(page);
    apiMocks.getAdminModel.mockReset().mockResolvedValue(detail);
  });

  it('列表紧凑展示模型健康、能力和使用摘要，不泄露配置凭据', async () => {
    render(<ControlledModelsPanel />);
    const row = (await screen.findByText('Kimi K2.5')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Moonshot')).toBeInTheDocument();
    expect(within(row).getByText('健康')).toBeInTheDocument();
    expect(within(row).getByText(/检测于 .*北京时间/)).toBeInTheDocument();
    expect(within(row).getByText('深度思考')).toBeInTheDocument();
    expect(within(row).getByText(/12 个对话/)).toBeInTheDocument();
    expect(within(row).getByText(/5 位用户/)).toBeInTheDocument();
    expect(within(row).getByText(/34 条回复/)).toBeInTheDocument();
    expect(row).toHaveTextContent('2,000');
    expect(row).not.toHaveTextContent('secretKey');
    expect(row.closest('table')).toHaveClass('min-w-[1050px]');
    expect(within(row.closest('table') as HTMLElement).getByText('最近活动')).toBeInTheDocument();
    expect(within(row.closest('table') as HTMLElement).queryByText('最近使用')).toBeNull();
    expect(screen.getByText(/Token 仅为当前已持久化助手消息用量，不等同平台全部调用或计费账单。/)).toBeInTheDocument();
  });

  it('列表提示被安全跳过的异常历史模型数量，但不展示脏模型 ID', async () => {
    apiMocks.getAdminModels.mockResolvedValue({
      ...page,
      excluded_invalid_model_count: 2,
    });
    render(<ControlledModelsPanel />);
    expect(await screen.findByText('有 2 条异常模型记录未展示，请检查历史数据')).toBeInTheDocument();
    expect(screen.queryByText('retired/model\u0000broken')).toBeNull();
  });

  it('模型目录降级时显示低干扰告警', async () => {
    apiMocks.getAdminModels.mockResolvedValue({
      ...page,
      items: [{ ...model, catalog_status: 'unknown' }],
      catalog_availability: 'degraded',
      excluded_invalid_model_count: 0,
    });
    render(<ControlledModelsPanel />);
    expect(await screen.findByText('模型目录暂时不可用，当前信息可能来自缓存或仅包含历史数据。')).toBeInTheDocument();
    const row = screen.getByText('Kimi K2.5').closest('tr') as HTMLElement;
    expect(within(row).getByText('状态未知')).toBeInTheDocument();
    expect(within(row).queryByText('历史')).toBeNull();
    expect(screen.getByRole('option', { name: '状态未知' })).toHaveValue('unknown');
  });

  it('模型目录正常且列表为空时只显示正常空态', async () => {
    apiMocks.getAdminModels.mockResolvedValue({
      ...page,
      items: [],
      total: 0,
      total_pages: 0,
      catalog_availability: 'available',
      excluded_invalid_model_count: 0,
    });
    render(<ControlledModelsPanel />);
    expect(await screen.findByText('没有匹配的模型')).toBeInTheDocument();
    expect(screen.queryByText('模型目录暂时不可用，当前信息可能来自缓存或仅包含历史数据。')).toBeNull();
    expect(screen.queryByText(/异常模型记录未展示/)).toBeNull();
  });

  it('目录状态 unknown 在详情中显示状态未知，不误标为历史模型', async () => {
    apiMocks.getAdminModel.mockResolvedValue({ ...detail, catalog_status: 'unknown' });
    render(<ControlledModelsPanel initialModelId="kimi-k2.5" />);
    const view = await screen.findByLabelText('模型详情 kimi-k2.5');
    expect(view).toHaveTextContent('目录状态状态未知');
    expect(view).not.toHaveTextContent('目录状态历史模型');
  });

  it('直接深链的 active 模型详情在目录降级时仍显示降级告警', async () => {
    apiMocks.getAdminModel.mockResolvedValue({ ...detail, catalog_availability: 'degraded' });
    render(<ControlledModelsPanel initialModelId="kimi-k2.5" />);
    const view = await screen.findByLabelText('模型详情 kimi-k2.5');
    expect(view).toHaveTextContent('目录状态当前模型');
    expect(view).toHaveTextContent('模型目录暂时不可用，当前信息可能来自缓存或仅包含历史数据。');
  });

  it('详情展示安全运营信息并可关联查看该模型对话', async () => {
    const onViewConversations = vi.fn();
    render(<ControlledModelsPanel onViewConversations={onViewConversations} />);
    await screen.findByText('Kimi K2.5');
    fireEvent.click(screen.getByRole('button', { name: '查看模型详情 kimi-k2.5' }));
    const view = await screen.findByLabelText('模型详情 kimi-k2.5');
    expect(apiMocks.getAdminModel).toHaveBeenCalledWith('kimi-k2.5', expect.any(AbortSignal));
    expect(view).toHaveTextContent('131,072');
    expect(view).toHaveTextContent('8,192');
    expect(view).toHaveTextContent('检测时间');
    expect(view).toHaveTextContent('北京时间');
    expect(view).toHaveTextContent('12 个对话');
    expect(view).toHaveTextContent('7 次 Agent 运行');
    expect(view).toHaveTextContent('1 次错误');
    expect(view).toHaveTextContent('perf-1');
    expect(view).toHaveTextContent('适合长文本与 Agent 任务');
    expect(view).toHaveTextContent('Token 仅为当前已持久化助手消息用量，不等同平台全部调用或计费账单。');
    expect(view).toHaveTextContent('最近活动');
    expect(view).not.toHaveTextContent('最近使用');
    expect(view).not.toHaveTextContent('价格参考');
    expect(view).not.toHaveTextContent('api_key');
    fireEvent.click(within(view).getByRole('button', { name: '查看该模型的对话' }));
    expect(onViewConversations).toHaveBeenCalledWith('kimi-k2.5');
  });

  it('URL 深链模型 ID 可直接恢复详情，切换 ID 会中止旧请求', async () => {
    apiMocks.getAdminModel.mockImplementation(() => new Promise(() => undefined));
    const { rerender } = render(<AdminModelsPanel onForbidden={noop} selectedModelId="model-a" onOpen={noop} onBack={noop} onViewConversations={noop} />);
    await waitFor(() => expect(apiMocks.getAdminModel).toHaveBeenCalledWith('model-a', expect.any(AbortSignal)));
    const firstSignal = apiMocks.getAdminModel.mock.calls[0][1] as AbortSignal;
    rerender(<AdminModelsPanel onForbidden={noop} selectedModelId="model-b" onOpen={noop} onBack={noop} onViewConversations={noop} />);
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
    expect(apiMocks.getAdminModel).toHaveBeenLastCalledWith('model-b', expect.any(AbortSignal));
  });

  it('异常模型只在详情展示后端分类后的安全异常说明', async () => {
    const unhealthy = { ...model, health: { status: 'unhealthy', error: '服务商认证失败，请检查服务配置', checked_at: null } };
    apiMocks.getAdminModels.mockResolvedValue({ ...page, items: [unhealthy] });
    apiMocks.getAdminModel.mockResolvedValue({ ...detail, ...unhealthy });
    render(<ControlledModelsPanel />);
    const row = (await screen.findByText('Kimi K2.5')).closest('tr') as HTMLElement;
    expect(within(row).getByText('异常')).toBeInTheDocument();
    expect(within(row).queryByText('服务商认证失败，请检查服务配置')).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: '查看模型详情 kimi-k2.5' }));
    const view = await screen.findByLabelText('模型详情 kimi-k2.5');
    expect(view).toHaveTextContent('异常说明');
    expect(view).toHaveTextContent('服务商认证失败，请检查服务配置');
  });

  it('历史模型详情对 provider、成本、推荐场景和压测状态做中文安全展示', async () => {
    apiMocks.getAdminModel.mockResolvedValue({
      ...detail,
      model_id: 'model-history',
      name: '历史模型',
      provider: null,
      provider_display: null,
      catalog_status: 'historical',
      health: { status: 'unknown', error: null, checked_at: '2026-07-12T00:00:00Z' },
      cost_tier: 'low',
      recommended_for: ['agent', 'coding', 'long_context', 'fast_response', 'general', 'custom'],
      capabilities: { searchCapable: true, webSearch: true },
      latest_performance_run: {
        run_id: 'perf-history', status: 'completed', environment: 'production',
        started_at: null, finished_at: null,
      },
    });
    render(<ControlledModelsPanel initialModelId="model-history" />);
    const view = await screen.findByLabelText('模型详情 model-history');
    expect(view).toHaveTextContent('model-history · 未记录');
    expect(view).not.toHaveTextContent('model-history · ·');
    expect(view).toHaveTextContent('成本层级低');
    expect(view).toHaveTextContent('Agent、编程、长上下文、快速响应、通用、custom');
    expect(view).toHaveTextContent('状态已完成');
    expect(view).toHaveTextContent('环境生产环境');
    expect(view).toHaveTextContent('检测时间2026/7/12 08:00:00（北京时间）');
    expect(view).toHaveTextContent('联网搜索');
    expect(view).not.toHaveTextContent('网页搜索');
  });

  it('健康检测时间兼容 epoch 秒、ISO 与空值', () => {
    expect(formatModelHealthCheckedAt(1783828800)).toContain('北京时间');
    expect(formatModelHealthCheckedAt('2026-07-12T00:00:00Z')).toBe('2026/7/12 08:00:00（北京时间）');
    expect(formatModelHealthCheckedAt(null)).toBe('尚未检测');
  });
});
