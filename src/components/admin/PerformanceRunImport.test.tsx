import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const importMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/adminAudit', () => ({
  importAdminPerformanceRun: importMock,
}));

import PerformanceRunImport from './PerformanceRunImport';

describe('PerformanceRunImport', () => {
  beforeEach(() => importMock.mockReset());

  it('在请求前拒绝无效 JSON', async () => {
    render(<PerformanceRunImport onImported={vi.fn()} onForbidden={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('压测结果 JSON'), { target: { value: '{oops' } });
    fireEvent.click(screen.getByRole('button', { name: '导入压测结果' }));

    expect(await screen.findByText('JSON 格式无效')).toBeInTheDocument();
    expect(importMock).not.toHaveBeenCalled();
  });

  it('校验必要字段并导入安全汇总', async () => {
    importMock.mockResolvedValue({ run_id: 'perf-1', created: true });
    const onImported = vi.fn();
    render(<PerformanceRunImport onImported={onImported} onForbidden={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('压测结果 JSON'), {
      target: { value: JSON.stringify({ schema_version: 1, run_id: 'perf-1', environment: 'prod', safe_summary: { p95_ms: 1200 } }) },
    });
    fireEvent.click(screen.getByRole('button', { name: '导入压测结果' }));

    await waitFor(() => expect(importMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' })));
    expect(onImported).toHaveBeenCalled();
    expect(await screen.findByText('压测结果已导入')).toBeInTheDocument();
  });

  it('重复导入时明确提示记录已存在', async () => {
    importMock.mockResolvedValue({ run_id: 'perf-1', created: false });
    render(<PerformanceRunImport onImported={vi.fn()} onForbidden={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('压测结果 JSON'), {
      target: { value: JSON.stringify({ schema_version: 1, run_id: 'perf-1', environment: 'prod', safe_summary: {} }) },
    });
    fireEvent.click(screen.getByRole('button', { name: '导入压测结果' }));

    expect(await screen.findByText('压测记录已存在')).toBeInTheDocument();
  });
});
