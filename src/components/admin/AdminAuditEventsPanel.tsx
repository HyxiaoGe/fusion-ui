'use client';

import { useCallback, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { getAdminAuditEvents } from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { AdminAuditEventRecord } from '@/types/adminAudit';
import { AdminEmpty, AdminError, AdminLoading, AdminPagination, AdminPanelHeader, formatAdminDate } from './AdminPanelPrimitives';
import {
  adminAuditActionLabel,
  adminAuditResourceLabel,
  formatAdminAuditAdmin,
  formatAdminAuditMetadata,
  formatAdminAuditTargetUser,
} from '@/lib/admin/adminAuditPresentation';

export default function AdminAuditEventsPanel({ onForbidden }: { onForbidden: () => void }) {
  const [page, setPage] = useState(1);
  const [actionDraft, setActionDraft] = useState('');
  const [action, setAction] = useState('');
  const [adminUserDraft, setAdminUserDraft] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [targetUserDraft, setTargetUserDraft] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loader = useCallback((signal: AbortSignal) => getAdminAuditEvents({ page, page_size: 25, action, admin_user_id: adminUserId, target_user_id: targetUserId }, signal), [action, adminUserId, page, targetUserId]);
  const resource = useAdminAuditResource(loader, onForbidden);
  const selectedEvent = resource.data?.items.find(event => event.id === selectedEventId) ?? null;

  return (
    <section>
      <AdminPanelHeader title="访问审计" description="查看管理员读取用户、对话与敏感详情的留痕。" action={<Button variant="outline" size="sm" onClick={resource.reload}><RefreshCw />刷新</Button>} />
      <form className="mb-4 grid max-w-4xl gap-2 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={event => { event.preventDefault(); setPage(1); setAction(actionDraft.trim()); setAdminUserId(adminUserDraft.trim()); setTargetUserId(targetUserDraft.trim()); }}><Input aria-label="审计动作" placeholder="动作，例如 admin.audit.conversation.view" value={actionDraft} onChange={event => setActionDraft(event.target.value)} /><Input aria-label="管理员用户 ID" placeholder="管理员用户 ID" value={adminUserDraft} onChange={event => setAdminUserDraft(event.target.value)} /><Input aria-label="目标用户 ID" placeholder="目标用户 ID" value={targetUserDraft} onChange={event => setTargetUserDraft(event.target.value)} /><Button type="submit"><Search />筛选</Button></form>
      {resource.loading ? <AdminLoading /> : resource.error ? <AdminError message={resource.error} onRetry={resource.reload} /> : null}
      {resource.data && resource.data.items.length === 0 ? <AdminEmpty>暂无访问审计记录</AdminEmpty> : null}
      {resource.data && resource.data.items.length > 0 ? <><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[860px] text-left text-sm"><caption className="sr-only">管理员访问审计记录</caption><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th scope="col" className="p-3">时间</th><th scope="col">管理员</th><th scope="col">操作内容</th><th scope="col">访问对象</th><th scope="col" className="pr-3 text-right">详情</th></tr></thead><tbody>{resource.data.items.map(event => {
        const admin = formatAdminAuditAdmin(event.admin_snapshot);
        const targetUser = formatAdminAuditTargetUser(event.target_user, event.target_user_id);
        return (
          <tr key={event.id} className="border-t border-border/60 align-top">
            <td className="whitespace-nowrap p-3">{formatAdminDate(event.created_at)}</td>
            <td aria-label={`审计管理员 ${event.id}`}><div className="font-medium">{admin.primary}</div></td>
            <td aria-label={`审计操作 ${event.id}`}>{adminAuditActionLabel(event.action)}</td>
            <td aria-label={`审计对象 ${event.id}`}>
              <div className="font-medium">{adminAuditResourceLabel(event.resource_type)}</div>
              {targetUser ? <div className="mt-1 text-xs text-muted-foreground">{targetUser.primary}</div> : null}
            </td>
            <td className="pr-3 text-right">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`查看审计详情 ${event.id}`}
                onClick={clickEvent => {
                  detailTriggerRef.current = clickEvent.currentTarget;
                  setSelectedEventId(event.id);
                }}
              >查看详情</Button>
            </td>
          </tr>
        );
      })}</tbody></table></div><AdminPagination page={resource.data} onPageChange={nextPage => { setSelectedEventId(null); setPage(nextPage); }} /></> : null}
      <Dialog open={Boolean(selectedEvent)} onOpenChange={open => { if (!open) setSelectedEventId(null); }}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          closeLabel="关闭审计详情"
          onCloseAutoFocus={closeEvent => {
            closeEvent.preventDefault();
            detailTriggerRef.current?.focus();
            detailTriggerRef.current = null;
          }}
        >
          <DialogHeader>
            <DialogTitle>审计事件详情</DialogTitle>
            <DialogDescription>查看本次管理员访问的完整标识与安全摘要。</DialogDescription>
          </DialogHeader>
          {selectedEvent ? <AdminAuditEventDetails event={selectedEvent} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AdminAuditEventDetails({ event }: { event: AdminAuditEventRecord }) {
  const reason = event.reason?.trim();
  const metadata = formatAdminAuditMetadata(event.metadata);
  const targetUser = formatAdminAuditTargetUser(event.target_user, event.target_user_id);
  return (
    <dl aria-label={`审计详情 ${event.id}`} className="grid gap-2 rounded-lg border border-border bg-card p-3 text-xs">
      <AuditDetail label="审计事件 ID" value={event.id || '未记录'} />
      <AuditDetail label="管理员 ID" value={event.admin_user_id || '未记录'} />
      <AuditDetail label="目标用户 ID（审计关联）" value={event.target_user_id || '未记录'} />
      {targetUser ? <AuditDetail label="目标用户当前身份" value={targetUser.detail} /> : null}
      <AuditDetail label="资源 ID" value={event.resource_id || '未记录'} />
      <AuditDetail label="Request ID" value={event.request_id || '未记录'} />
      <AuditDetail label="原始操作" value={event.action || '未记录'} />
      <AuditDetail label="原始资源" value={event.resource_type || '未记录'} />
      {reason ? <AuditDetail label="访问理由" value={reason} /> : null}
      {metadata.length > 0 ? <div><dt className="text-muted-foreground">附加摘要</dt><dd className="mt-1 grid gap-1 rounded bg-muted/40 p-2">{metadata.map(item => <div key={`${item.label}-${item.value}`}><span>{item.label}：</span><span className="break-all">{item.value}</span></div>)}</dd></div> : null}
    </dl>
  );
}

function AuditDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-mono">{value}</dd></div>;
}
