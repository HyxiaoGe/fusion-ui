import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
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
const noop = () => undefined;

function ControlledPerformancePanel({ initialRunId = null }: { initialRunId?: string | null }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  return (
    <AdminPerformancePanel
      onForbidden={noop}
      selectedRunId={selectedRunId}
      onToggle={setSelectedRunId}
    />
  );
}

describe('AdminPerformancePanel', () => {
  beforeEach(() => {
    apiMocks.getAdminPerformanceRuns.mockReset().mockResolvedValue(emptyPage);
    apiMocks.getAdminPerformanceRun.mockReset();
    apiMocks.importAdminPerformanceRun.mockReset().mockResolvedValue({ run_id: 'perf-new', created: true });
  });

  it('展示列表加载与空状态', async () => {
    let resolvePage!: (value: typeof emptyPage) => void;
    apiMocks.getAdminPerformanceRuns.mockReturnValue(new Promise(resolve => { resolvePage = resolve; }));

    render(<ControlledPerformancePanel />);

    expect(screen.getByRole('status')).toHaveTextContent('正在读取');
    await act(async () => resolvePage(emptyPage));
    expect(await screen.findByText('暂无压测记录')).toBeInTheDocument();
  });

  it('展示列表错误并允许重试', async () => {
    apiMocks.getAdminPerformanceRuns.mockRejectedValueOnce(new Error('压测列表读取失败'));

    render(<ControlledPerformancePanel />);

    expect(await screen.findByText('压测列表读取失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    await waitFor(() => expect(apiMocks.getAdminPerformanceRuns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('暂无压测记录')).toBeInTheDocument();
  });

  it('深链 run_id 不在当前列表页时仍独立展示详情和收起入口', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({
      ...emptyPage, items: [listRun], total: 26, total_pages: 2,
    });
    apiMocks.getAdminPerformanceRun.mockResolvedValue({
      ...listRun,
      run_id: 'perf-old-page',
      imported_by_user_id: 'admin-1',
      safe_summary: { stages: [], resources: null },
    });

    render(<ControlledPerformancePanel initialRunId="perf-old-page" />);

    expect(await screen.findByLabelText('压测详情 perf-old-page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起压测详情 perf-old-page' })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.getAdminPerformanceRun).toHaveBeenCalledWith(
      'perf-old-page',
      expect.any(AbortSignal),
    ));
  });

  it('点击记录后加载并结构化展示 L1-L4 安全详情', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({ ...emptyPage, items: [listRun], total: 1, total_pages: 1 });
    let resolveDetail!: (value: typeof listRun & { safe_summary: Record<string, unknown>; imported_by_user_id: string }) => void;
    apiMocks.getAdminPerformanceRun.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<ControlledPerformancePanel />);
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
          {
            scenario: 'sse_short', kind: 'sse', concurrency: 2, duration_seconds: 12.5,
            flows: 10, p95_ttft_ms: 900,
          },
          {
            scenario: 'disconnect_reconnect', kind: 'recovery', success_rate: 0.98,
            recovery_latency_p95_ms: 500, lost_events: 0, ordering_errors: 0,
          },
          { scenario: 'cancel_stream', kind: 'stop', stop_attempted: true, stop_latency_p95_ms: 160 },
          {
            scenario: 'steady_chat', kind: 'soak', duration_seconds: 1800,
            concurrency: 2, total: 30, successful: 29, failed: 1,
            p50_ms: 1200, p95_ms: 3200, timeout_rate: 0.03,
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
    expect(detail).toHaveTextContent('实际墙钟耗时12.5 秒');
    expect(detail).toHaveTextContent('未覆盖事件下界');
    expect(detail).toHaveTextContent('顺序错误');
    expect(detail).toHaveTextContent('未覆盖事件下界0');
    expect(detail).toHaveTextContent('估算 Token/秒 P95');
    expect(detail).toHaveTextContent('每 Tick flow 数2');
    expect(detail).toHaveTextContent('Tick 样本30');
    expect(detail).toHaveTextContent('成功 Tick29');
    expect(detail).toHaveTextContent('失败 Tick1');
    expect(detail).toHaveTextContent('各窗口 P50 的 P501,200 ms');
    expect(detail).toHaveTextContent('各窗口 P95 的 P953,200 ms');
    expect(detail).toHaveTextContent('Tick 超时率3%');
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
    render(<ControlledPerformancePanel />);
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
    render(<ControlledPerformancePanel />);
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

  it('未知 schema 只显示不支持提示且不解释当前指标', async () => {
    const unknownRun = { ...listRun, run_id: 'perf-future', schema_version: 99 };
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({ ...emptyPage, items: [unknownRun], total: 1, total_pages: 1 });
    apiMocks.getAdminPerformanceRun.mockResolvedValue({
      ...unknownRun,
      imported_by_user_id: 'admin-1',
      safe_summary: {
        stages: [{ kind: 'http', p95_ms: 123 }],
        resources: { api: { cpu_percent: 99 } },
        cleanup: { conversations_deleted: 8 },
      },
    });
    render(<ControlledPerformancePanel />);
    await screen.findByText(unknownRun.run_id);

    fireEvent.click(screen.getByRole('button', { name: `查看压测详情 ${unknownRun.run_id}` }));

    const detail = await screen.findByLabelText(`压测详情 ${unknownRun.run_id}`);
    expect(detail).toHaveTextContent('暂不支持 Schema v99');
    expect(detail).not.toHaveTextContent('HTTP 基线');
    expect(detail).not.toHaveTextContent('CPU 窗口峰值');
    expect(detail).not.toHaveTextContent('清理对话');
  });

  it('刷新、筛选、翻页和导入成功都会清除详情且各触发一次列表请求', async () => {
    const page = { ...emptyPage, items: [listRun], total: 26, total_pages: 2 };
    const detail = {
      ...listRun,
      imported_by_user_id: 'admin-1',
      safe_summary: { stages: [], resources: null },
    };
    apiMocks.getAdminPerformanceRuns.mockResolvedValue(page);
    apiMocks.getAdminPerformanceRun.mockResolvedValue(detail);
    render(<ControlledPerformancePanel />);
    await screen.findByText(listRun.run_id);

    const openDetail = async () => {
      fireEvent.click(screen.getByRole('button', { name: `查看压测详情 ${listRun.run_id}` }));
      await screen.findByLabelText(`压测详情 ${listRun.run_id}`);
    };

    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: '刷新压测列表' }));
    await waitFor(() => expect(apiMocks.getAdminPerformanceRuns).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText(`压测详情 ${listRun.run_id}`)).toBeNull();

    await screen.findByText(listRun.run_id);
    await openDetail();
    fireEvent.change(screen.getByLabelText('压测环境'), { target: { value: 'production' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选' }));
    await waitFor(() => expect(apiMocks.getAdminPerformanceRuns).toHaveBeenCalledTimes(3));
    expect(screen.queryByLabelText(`压测详情 ${listRun.run_id}`)).toBeNull();

    await screen.findByText(listRun.run_id);
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(apiMocks.getAdminPerformanceRuns).toHaveBeenCalledTimes(4));
    expect(screen.queryByLabelText(`压测详情 ${listRun.run_id}`)).toBeNull();

    await screen.findByText(listRun.run_id);
    await openDetail();
    fireEvent.change(screen.getByLabelText('压测结果 JSON'), {
      target: {
        value: JSON.stringify({
          schema_version: 2,
          run_id: 'perf-imported',
          environment: 'production',
          safe_summary: {},
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '导入压测结果' }));
    await waitFor(() => expect(apiMocks.getAdminPerformanceRuns).toHaveBeenCalledTimes(5));
    expect(screen.queryByLabelText(`压测详情 ${listRun.run_id}`)).toBeNull();
  });
});
