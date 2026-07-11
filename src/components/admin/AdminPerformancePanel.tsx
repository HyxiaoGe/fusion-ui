'use client';

import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getAdminPerformanceRuns } from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PerformanceRunImport from './PerformanceRunImport';
import { AdminEmpty, AdminError, AdminLoading, AdminPagination, AdminPanelHeader, formatAdminDate } from './AdminPanelPrimitives';

export default function AdminPerformancePanel({ onForbidden }: { onForbidden: () => void }) {
  const [page, setPage] = useState(1);
  const [environmentDraft, setEnvironmentDraft] = useState('');
  const [environment, setEnvironment] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [status, setStatus] = useState('');
  const loader = useCallback((signal: AbortSignal) => getAdminPerformanceRuns({ page, page_size: 25, environment, status }, signal), [environment, page, status]);
  const resource = useAdminAuditResource(loader, onForbidden);

  return (
    <section>
      <AdminPanelHeader title="压测记录" description="压测聊天清理后，脱敏汇总仍独立保留在这里。" action={<Button variant="outline" size="sm" onClick={resource.reload}><RefreshCw />刷新</Button>} />
      <PerformanceRunImport onImported={resource.reload} onForbidden={onForbidden} />
      <form className="my-4 grid max-w-2xl gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={event => { event.preventDefault(); setPage(1); setEnvironment(environmentDraft.trim()); setStatus(statusDraft.trim()); }}><Input aria-label="压测环境" placeholder="环境，例如 production" value={environmentDraft} onChange={event => setEnvironmentDraft(event.target.value)} /><Input aria-label="压测状态" placeholder="状态，例如 completed" value={statusDraft} onChange={event => setStatusDraft(event.target.value)} /><Button type="submit" variant="outline">筛选</Button></form>
      {resource.loading ? <AdminLoading /> : resource.error ? <AdminError message={resource.error} onRetry={resource.reload} /> : null}
      {resource.data && resource.data.items.length === 0 ? <AdminEmpty>暂无压测记录</AdminEmpty> : null}
      {resource.data && resource.data.items.length > 0 ? <><div className="space-y-3">{resource.data.items.map(run => (
        <details key={run.run_id} className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer"><span className="font-medium">{run.run_id}</span><Badge variant="outline" className="ml-2">{run.status}</Badge><span className="ml-3 text-xs text-muted-foreground">{run.environment} · {formatAdminDate(run.started_at)}</span></summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/20 p-3 text-xs">{JSON.stringify(run.safe_summary, null, 2)}</pre></details>
      ))}</div><AdminPagination page={resource.data} onPageChange={setPage} /></> : null}
    </section>
  );
}
