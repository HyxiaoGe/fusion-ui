import AdminAuditCenter from '@/components/admin/AdminAuditCenter';
import AdminGuard from '@/components/admin/AdminGuard';
import AdminShell from '@/components/admin/AdminShell';

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminShell>
        <AdminAuditCenter />
      </AdminShell>
    </AdminGuard>
  );
}
