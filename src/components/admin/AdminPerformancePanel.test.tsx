import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAdminPerformanceRuns: vi.fn(),
  getAdminPerformanceRun: vi.fn(),
  importAdminPerformanceRun: vi.fn(),
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);

import AdminPerformancePanel from './AdminPerformancePanel';

const emptyPage = {
  items: [], total: 0, page: 1, page_size: 25, total_pages: 0, has_next: false, has_prev: false,
};

const listRun = {
  run_id: 'perf-20260712-l4',
  environment: 'production',
  model_id: 'deepseek-chat',
  status: 'stopped',
  schema_version: 2,
  started_at: '2026-07-12T00:00:00Z',
  finished_at: '2026-07-12T00:30:00Z',
  created_at: '2026-07-12T00:31:00Z',
};

describe('AdminPerformancePanel', () => {
  beforeEach(() => {
    apiMocks.getAdminPerformanceRuns.mockReset().mockResolvedValue(emptyPage);
    apiMocks.getAdminPerformanceRun.mockReset();
    apiMocks.importAdminPerformanceRun.mockReset().mockResolvedValue({ run_id: 'perf-new', created: true });
  });

  it('展示列表加载与空状态', async () => {
    let resolvePage!: (value: typeof emptyPage) => void;
    apiMocks.getAdminPerformanceRuns.mockReturnValue(new Promise(resolve => { resolvePage = resolve; }));

    render(<AdminPerformancePanel onForbidden={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('正在读取');
    await act(async () => resolvePage(emptyPage));
    expect(await screen.findByText('暂无压测记录')).toBeInTheDocument();
  });

  it('展示列表错误并允许重试', async () => {
    apiMocks.getAdminPerformanceRuns.mockRejectedValueOnce(new Error('压测列表读取失败'));

    render(<AdminPerformancePanel onForbidden={vi.fn()} />);

    expect(await screen.findByText('压测列表读取失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    await waitFor(() => expect(apiMocks.getAdminPerformanceRuns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('暂无压测记录')).toBeInTheDocument();
  });

  it('点击记录后加载并结构化展示 L1-L4 安全详情', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({ ...emptyPage, items: [listRun], total: 1, total_pages: 1 });
    let resolveDetail!: (value: typeof listRun & { safe_summary: Record<string, unknown>; imported_by_user_id: string }) => void;
    apiMocks.getAdminPerformanceRun.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<AdminPerformancePanel onForbidden={vi.fn()} />);
    await screen.findByText(listRun.run_id);

    const detailButton = screen.getByRole('button', { name: `查看压测详情 ${listRun.run_id}` });
    fireEvent.click(detailButton);

    expect(apiMocks.getAdminPerformanceRun).toHaveBeenCalledWith(listRun.run_id, expect.any(AbortSignal));
    const loadingDetail = screen.getByLabelText(`压测详情 ${listRun.run_id}`);
    expect(detailButton).toHaveAttribute('aria-controls', loadingDetail.id);
    expect(loadingDetail).toHaveAttribute('aria-labelledby', `${loadingDetail.id}-title`);
    expect(document.getElementById(`${loadingDetail.id}-title`)).toHaveTextContent(`压测详情 · ${listRun.run_id}`);
    expect(loadingDetail).toHaveTextContent('正在读取');

    await act(async () => resolveDetail({
      ...listRun,
      imported_by_user_id: 'admin-1',
      safe_summary: {
        stopped: true,
        stop_reasons: ['resource:monitoring_unavailable'],
        rps: 42.5,
        p95_ms: 880,
        error_rate: 0.01,
        stages: [
          { scenario: 'conversation_list', kind: 'http', concurrency: 10, requests: 100, failed: 0, p95_ms: null },
          { scenario: 'sse_short', kind: 'sse', concurrency: 2, flows: 10, p95_ttft_ms: 900 },
          {
            scenario: 'disconnect_reconnect', kind: 'recovery', success_rate: 0.98,
            recovery_latency_p95_ms: 500, lost_events: 0, ordering_errors: 0,
          },
          { scenario: 'cancel_stream', kind: 'stop', stop_attempted: true, stop_latency_p95_ms: 160 },
          {
            scenario: 'steady_chat', kind: 'soak', duration_seconds: 1800,
            skipped_ticks: 2, tokens_per_second_p95: 23.5,
          },
        ],
        resources: {
          api: { cpu_percent: 81.5, memory_mib: 512.25, restarts: 0, oom: false },
          postgres: { connections: 42 },
          redis: { rejected_connections: 0, evicted_keys: 0 },
          host: { memory_percent: 66.5 },
          nginx: { connections: 88 },
          litellm: { cpu_percent: 44 },
        },
        cleanup: { conversations_deleted: 9, tokens_revoked: 2, errors: [] },
        prompt: 'private-prompt-must-not-render',
      },
    }));

    const detail = await screen.findByLabelText(`压测详情 ${listRun.run_id}`);
    expect(detail).toHaveTextContent('门禁停止');
    expect(detail).toHaveTextContent('状态仅表示压测流程结果，不等同于零错误或服务崩溃');
    expect(detail).toHaveTextContent('resource:monitoring_unavailable');
    expect(detail).toHaveTextContent('conversation_list');
    expect(detail).toHaveTextContent('断线恢复 P95');
    expect(detail).toHaveTextContent('500 ms');
    expect(detail).toHaveTextContent('首次可见输出 P95');
    expect(detail).toHaveTextContent('未覆盖事件下界');
    expect(detail).toHaveTextContent('顺序错误');
    expect(detail).toHaveTextContent('未覆盖事件下界0');
    expect(detail).toHaveTextContent('估算 Token/秒 P95');
    expect(detail).toHaveTextContent('停止场景耗时 P95');
    expect(detail).toHaveTextContent('耗时 P95未采集');
    expect(detail).toHaveTextContent('API');
    expect(detail).toHaveTextContent('CPU 窗口峰值');
    expect(detail).toHaveTextContent('连接窗口峰值');
    expect(detail).toHaveTextContent('重启增量');
    expect(detail).toHaveTextContent('清理对话');
    expect(detail).toHaveTextContent('9');
    expect(detail).toHaveTextContent('未采集');
    expect(detail).toHaveTextContent('未报告清理错误');
    expect(detail).toHaveTextContent('北京时间');
    expect(detail).toHaveTextContent('2026/7/12 08:00:00（北京时间）');
    expect(screen.getAllByText('L1')).toHaveLength(1);
    expect(screen.getAllByText('L2')).toHaveLength(1);
    expect(screen.getAllByText('L3')).toHaveLength(2);
    expect(screen.getAllByText('L4')).toHaveLength(1);
    expect(screen.getByTestId('performance-stage-grid')).toHaveClass('grid-cols-1');
    expect(detail).not.toHaveTextContent('private-prompt-must-not-render');
  });

  it('详情错误保持列表并支持独立重试', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({ ...emptyPage, items: [listRun], total: 1, total_pages: 1 });
    apiMocks.getAdminPerformanceRun
      .mockRejectedValueOnce(new Error('压测详情读取失败'))
      .mockResolvedValueOnce({
        ...listRun,
        imported_by_user_id: 'admin-1',
        safe_summary: { stages: [], resources: null },
      });
    render(<AdminPerformancePanel onForbidden={vi.fn()} />);
    await screen.findByText(listRun.run_id);

    fireEvent.click(screen.getByRole('button', { name: `查看压测详情 ${listRun.run_id}` }));

    expect(await screen.findByText('压测详情读取失败')).toBeInTheDocument();
    expect(screen.getByText(listRun.run_id)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载详情' }));
    await waitFor(() => expect(apiMocks.getAdminPerformanceRun).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('暂无阶段汇总')).toBeInTheDocument();
    expect(screen.getByText('资源未采集')).toBeInTheDocument();
  });

  it('切换或收起详情时中止旧请求并卸载内容', async () => {
    const anotherRun = { ...listRun, run_id: 'perf-20260712-next' };
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({
      ...emptyPage,
      items: [listRun, anotherRun],
      total: 2,
      total_pages: 1,
    });
    apiMocks.getAdminPerformanceRun.mockImplementation(() => new Promise(() => undefined));
    render(<AdminPerformancePanel onForbidden={vi.fn()} />);
    await screen.findByText(listRun.run_id);

    fireEvent.click(screen.getByRole('button', { name: `查看压测详情 ${listRun.run_id}` }));
    const firstSignal = apiMocks.getAdminPerformanceRun.mock.calls[0][1] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: `查看压测详情 ${anotherRun.run_id}` }));

    await waitFor(() => expect(firstSignal.aborted).toBe(true));
    expect(screen.queryByLabelText(`压测详情 ${listRun.run_id}`)).toBeNull();
    expect(screen.getByLabelText(`压测详情 ${anotherRun.run_id}`)).toBeInTheDocument();

    const secondSignal = apiMocks.getAdminPerformanceRun.mock.calls[1][1] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: `收起压测详情 ${anotherRun.run_id}` }));
    await waitFor(() => expect(secondSignal.aborted).toBe(true));
    expect(screen.queryByLabelText(`压测详情 ${anotherRun.run_id}`)).toBeNull();
  });
});
