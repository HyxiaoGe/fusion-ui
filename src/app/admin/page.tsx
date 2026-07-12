import { Suspense } from 'react';
import AdminAuditCenter from '@/components/admin/AdminAuditCenter';
import AdminGuard from '@/components/admin/AdminGuard';
import AdminShell from '@/components/admin/AdminShell';

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminShell>
        <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">正在读取管理中心…</div>}>
          <AdminAuditCenter />
        </Suspense>
      </AdminShell>
    </AdminGuard>
  );
}
