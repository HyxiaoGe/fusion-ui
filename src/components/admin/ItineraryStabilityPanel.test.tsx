import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAdminItineraryStability: vi.fn(),
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);

import ItineraryStabilityPanel from './ItineraryStabilityPanel';

const response = {
  scope: {
    created_from: '2026-07-26T10:00:00+08:00',
    created_to: '2026-07-27T10:00:00+08:00',
    timezone: 'Asia/Shanghai',
    sample_definition: 'terminal_run_with_travel_tool',
    excluded_running_count: 1,
    excluded_interrupted_count: 2,
    excluded_unlinked_count: 3,
  },
  summary: {
    itinerary: { total: 40, complete: 28, partial: 9, failed: 3 },
    run_latency_ms: { sample_count: 40, p50_ms: 18400, p95_ms: 72600 },
    product_tools: { total: 126, success: 103, degraded: 8, failed: 15, timeout: 2 },
    tool_latency_ms: { sample_count: 124, p50_ms: 920, p95_ms: 8600 },
    signals: {
      upstream_error: 6,
      repair_required: 5,
      repair_retryable: 3,
      repair_requires_user_input: 2,
      repair_retry_exhausted: 1,
      travel_budget_exhausted: 2,
      server_budget_exhausted: 1,
      agent_limit_reached: 1,
    },
  },
  by_model: [{
    model_id: 'kimi-k2.5',
    itinerary: { total: 20, complete: 15, partial: 4, failed: 1 },
    run_latency_ms: { sample_count: 20, p50_ms: 15000, p95_ms: 61000 },
    product_tools: { total: 60, success: 52, degraded: 3, failed: 5, timeout: 1 },
    tool_latency_ms: { sample_count: 60, p50_ms: 800, p95_ms: 7000 },
    signals: {
      upstream_error: 2,
      repair_required: 3,
      repair_retryable: 2,
      repair_requires_user_input: 1,
      repair_retry_exhausted: 0,
      travel_budget_exhausted: 1,
      server_budget_exhausted: 0,
      agent_limit_reached: 0,
    },
  }],
  by_tool: [{
    tool_name: 'search_flights',
    calls: { total: 32, success: 24, degraded: 2, failed: 6, timeout: 1 },
    latency_ms: { sample_count: 32, p50_ms: 900, p95_ms: 8200 },
    upstream_error: 4,
    budget_exhausted: 1,
  }],
};

const noop = () => undefined;

describe('ItineraryStabilityPanel', () => {
  beforeEach(() => {
    apiMocks.getAdminItineraryStability.mockReset().mockResolvedValue(response);
  });

  it('展示时间窗口、总览、按模型和按工具统计，不暴露参数或原始错误', async () => {
    render(<ItineraryStabilityPanel onForbidden={noop} />);

    expect(await screen.findByRole('heading', { name: '智能行程稳定性' })).toBeInTheDocument();
    expect(screen.getByLabelText('行程交付总览')).toHaveTextContent('Complete28');
    expect(screen.getByLabelText('行程交付总览')).toHaveTextContent('Partial9');
    expect(screen.getByLabelText('行程交付总览')).toHaveTextContent('Failed3');
    expect(screen.getByLabelText('产品工具总览')).toHaveTextContent('成功103');
    expect(screen.getByLabelText('产品工具总览')).toHaveTextContent('失败15');
    expect(response.summary.product_tools.total).toBe(
      response.summary.product_tools.success
      + response.summary.product_tools.degraded
      + response.summary.product_tools.failed,
    );
    expect(response.by_tool[0].calls.total).toBe(
      response.by_tool[0].calls.success
      + response.by_tool[0].calls.degraded
      + response.by_tool[0].calls.failed,
    );
    expect(screen.getByLabelText('延迟总览')).toHaveTextContent('行程 P5018.4s');
    expect(screen.getByLabelText('异常信号总览')).toHaveTextContent('上游错误6');
    expect(screen.getByText('1 个运行中、2 个已中断、3 个缺少终态关联样本未计入交付结果')).toBeInTheDocument();

    const modelTable = screen.getByRole('table', { name: '按模型统计' });
    expect(within(modelTable).getByText('kimi-k2.5')).toBeInTheDocument();
    expect(within(modelTable).getByText('75%')).toBeInTheDocument();

    const toolTable = screen.getByRole('table', { name: '按工具统计' });
    expect(within(toolTable).getByText('航班查询')).toBeInTheDocument();
    expect(within(toolTable).getByText('32')).toBeInTheDocument();

    expect(document.body).not.toHaveTextContent('input_params');
    expect(document.body).not.toHaveTextContent('raw upstream failure');
    expect(apiMocks.getAdminItineraryStability).toHaveBeenCalledWith(
      expect.objectContaining({
        created_from: expect.stringMatching(/\+08:00$/),
        created_to: expect.stringMatching(/\+08:00$/),
      }),
      expect.any(AbortSignal),
    );
  });

  it('支持切换七天窗口并按精确模型 ID 重新查询', async () => {
    render(<ItineraryStabilityPanel onForbidden={noop} />);
    await screen.findByText('kimi-k2.5');

    fireEvent.click(screen.getByRole('button', { name: '最近 7 天' }));
    fireEvent.change(screen.getByRole('textbox', { name: '行程模型 ID' }), {
      target: { value: '  qwen-max-latest  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用行程筛选' }));

    await waitFor(() => expect(apiMocks.getAdminItineraryStability).toHaveBeenLastCalledWith(
      expect.objectContaining({ model_id: 'qwen-max-latest' }),
      expect.any(AbortSignal),
    ));
    const query = apiMocks.getAdminItineraryStability.mock.calls.at(-1)?.[0];
    const durationMs = new Date(query.created_to).getTime() - new Date(query.created_from).getTime();
    expect(durationMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(screen.getByRole('button', { name: '最近 7 天' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('展示稳定加载、空态和错误重试', async () => {
    let resolveRequest!: (value: typeof response) => void;
    apiMocks.getAdminItineraryStability.mockReturnValueOnce(new Promise(resolve => {
      resolveRequest = resolve;
    }));
    const { unmount } = render(<ItineraryStabilityPanel onForbidden={noop} />);

    expect(screen.getByRole('status')).toHaveTextContent('正在读取');
    await act(async () => resolveRequest({
      ...response,
      summary: {
        ...response.summary,
        itinerary: { total: 0, complete: 0, partial: 0, failed: 0 },
        product_tools: { total: 0, success: 0, degraded: 0, failed: 0 },
      },
      by_model: [],
      by_tool: [],
    }));
    expect(await screen.findByText('当前时间窗口内暂无可计入的智能行程样本')).toBeInTheDocument();
    expect(screen.getByText('1 个运行中、2 个已中断、3 个缺少终态关联样本未计入交付结果'))
      .toBeInTheDocument();
    unmount();

    apiMocks.getAdminItineraryStability
      .mockReset()
      .mockRejectedValueOnce(new Error('行程稳定性读取失败'))
      .mockResolvedValueOnce(response);
    render(<ItineraryStabilityPanel onForbidden={noop} />);
    expect(await screen.findByText('行程稳定性读取失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载行程稳定性' }));
    await waitFor(() => expect(apiMocks.getAdminItineraryStability).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('kimi-k2.5')).toBeInTheDocument();
  });
});
