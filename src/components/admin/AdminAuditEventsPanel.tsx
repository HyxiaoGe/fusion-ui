'use client';

import { useCallback, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { getAdminAuditEvents } from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminEmpty, AdminError, AdminLoading, AdminPagination, AdminPanelHeader, formatAdminDate } from './AdminPanelPrimitives';

export default function AdminAuditEventsPanel({ onForbidden }: { onForbidden: () => void }) {
  const [page, setPage] = useState(1);
  const [actionDraft, setActionDraft] = useState('');
  const [action, setAction] = useState('');
  const [adminUserDraft, setAdminUserDraft] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [targetUserDraft, setTargetUserDraft] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const loader = useCallback((signal: AbortSignal) => getAdminAuditEvents({ page, page_size: 25, action, admin_user_id: adminUserId, target_user_id: targetUserId }, signal), [action, adminUserId, page, targetUserId]);
  const resource = useAdminAuditResource(loader, onForbidden);

  return (
    <section>
      <AdminPanelHeader title="访问审计" description="查看管理员读取用户、对话与敏感详情的留痕。" action={<Button variant="outline" size="sm" onClick={resource.reload}><RefreshCw />刷新</Button>} />
      <form className="mb-4 grid max-w-4xl gap-2 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={event => { event.preventDefault(); setPage(1); setAction(actionDraft.trim()); setAdminUserId(adminUserDraft.trim()); setTargetUserId(targetUserDraft.trim()); }}><Input aria-label="审计动作" placeholder="动作，例如 admin.audit.conversation.view" value={actionDraft} onChange={event => setActionDraft(event.target.value)} /><Input aria-label="管理员用户 ID" placeholder="管理员用户 ID" value={adminUserDraft} onChange={event => setAdminUserDraft(event.target.value)} /><Input aria-label="目标用户 ID" placeholder="目标用户 ID" value={targetUserDraft} onChange={event => setTargetUserDraft(event.target.value)} /><Button type="submit"><Search />筛选</Button></form>
      {resource.loading ? <AdminLoading /> : resource.error ? <AdminError message={resource.error} onRetry={resource.reload} /> : null}
      {resource.data && resource.data.items.length === 0 ? <AdminEmpty>暂无访问审计记录</AdminEmpty> : null}
      {resource.data && resource.data.items.length > 0 ? <><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="p-3">时间</th><th>管理员</th><th>动作</th><th>资源</th><th>目标用户</th><th>Request ID</th><th>理由</th></tr></thead><tbody>{resource.data.items.map(event => <tr key={event.id} className="border-t border-border/60"><td className="p-3">{formatAdminDate(event.created_at)}</td><td>{event.admin_user_id}</td><td>{event.action}</td><td>{event.resource_type}{event.resource_id ? ` / ${event.resource_id}` : ''}</td><td>{event.target_user_id || '—'}</td><td className="font-mono text-xs">{event.request_id || '—'}</td><td>{event.reason || '—'}</td></tr>)}</tbody></table></div><AdminPagination page={resource.data} onPageChange={setPage} /></> : null}
    </section>
  );
}
