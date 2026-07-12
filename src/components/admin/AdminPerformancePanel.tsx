'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { getAdminPerformanceRuns } from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PerformanceRunImport from './PerformanceRunImport';
import AdminPerformanceRunDetail from './AdminPerformanceRunDetail';
import { AdminEmpty, AdminError, AdminLoading, AdminPagination, AdminPanelHeader, formatAdminDate } from './AdminPanelPrimitives';

function performanceDetailId(runId: string): string {
  return `performance-run-detail-${runId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

function performanceStatusLabel(status: string): string {
  if (status === 'stopped') return '门禁停止';
  if (status === 'completed') return '完整执行';
  return status;
}

interface AdminPerformancePanelProps {
  onForbidden: () => void;
  selectedRunId: string | null;
  onToggle: (runId: string | null) => void;
}

export default function AdminPerformancePanel({
  onForbidden, selectedRunId, onToggle,
}: AdminPerformancePanelProps) {
  const [page, setPage] = useState(1);
  const [environmentDraft, setEnvironmentDraft] = useState('');
  const [environment, setEnvironment] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [status, setStatus] = useState('');
  const loader = useCallback((signal: AbortSignal) => getAdminPerformanceRuns({ page, page_size: 25, environment, status }, signal), [environment, page, status]);
  const resource = useAdminAuditResource(loader, onForbidden);
  const selectedRunIsVisible = resource.data?.items.some(run => run.run_id === selectedRunId) ?? false;
  const refreshList = () => {
    if (selectedRunId) onToggle(null);
    resource.reload();
  };
  const changePage = (nextPage: number) => {
    if (selectedRunId) onToggle(null);
    setPage(nextPage);
  };
  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedRunId) onToggle(null);
    setPage(1);
    setEnvironment(environmentDraft.trim());
    setStatus(statusDraft.trim());
    resource.reload();
  };

  return (
    <section>
      <AdminPanelHeader title="压测记录" description="压测聊天清理后，脱敏汇总仍独立保留在这里。" action={<Button variant="outline" size="sm" aria-label="刷新压测列表" onClick={refreshList}><RefreshCw />刷新</Button>} />
      <PerformanceRunImport onImported={refreshList} onForbidden={onForbidden} />
      <form className="my-4 grid max-w-2xl gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={applyFilters}><Input aria-label="压测环境" placeholder="环境，例如 production" value={environmentDraft} onChange={event => setEnvironmentDraft(event.target.value)} /><Input aria-label="压测状态" placeholder="状态，例如 completed" value={statusDraft} onChange={event => setStatusDraft(event.target.value)} /><Button type="submit" variant="outline">筛选</Button></form>
      {resource.loading ? <AdminLoading /> : resource.error ? <AdminError message={resource.error} onRetry={resource.reload} /> : null}
      {resource.data && resource.data.items.length === 0 ? <AdminEmpty>暂无压测记录</AdminEmpty> : null}
      {resource.data && resource.data.items.length > 0 ? <><div className="space-y-3">{resource.data.items.map(run => {
        const selected = selectedRunId === run.run_id;
        const detailId = performanceDetailId(run.run_id);
        return (
          <article key={run.run_id} className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-all font-medium">{run.run_id}</span>
                  <Badge variant="outline">{performanceStatusLabel(run.status)}</Badge>
                </div>
                <div className="mt-1 break-words text-xs text-muted-foreground">
                  {run.environment} · {run.model_id ?? '模型未采集'} · {formatAdminDate(run.started_at)}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full shrink-0 sm:w-auto"
                aria-label={`${selected ? '收起' : '查看'}压测详情 ${run.run_id}`}
                aria-expanded={selected}
                aria-controls={detailId}
                onClick={() => onToggle(selected ? null : run.run_id)}
              >
                {selected ? <ChevronUp /> : <ChevronDown />}{selected ? '收起详情' : '查看详情'}
              </Button>
            </div>
            {selected ? <AdminPerformanceRunDetail id={detailId} runId={run.run_id} onForbidden={onForbidden} /> : null}
          </article>
        );
      })}</div><AdminPagination page={resource.data} onPageChange={changePage} /></> : null}
      {selectedRunId && !selectedRunIsVisible && (resource.data || resource.error) ? (
        <article className="mt-4 min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="break-all font-medium">{selectedRunId}</div>
              <div className="mt-1 text-xs text-muted-foreground">通过链接打开的压测详情</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              aria-label={`收起压测详情 ${selectedRunId}`}
              aria-expanded="true"
              aria-controls={performanceDetailId(selectedRunId)}
              onClick={() => onToggle(null)}
            >
              <ChevronUp />收起详情
            </Button>
          </div>
          <AdminPerformanceRunDetail
            id={performanceDetailId(selectedRunId)}
            runId={selectedRunId}
            onForbidden={onForbidden}
          />
        </article>
      ) : null}
    </section>
  );
}
