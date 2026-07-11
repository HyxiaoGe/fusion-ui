'use client';

import type { ReactNode } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAppSelector } from '@/redux/hooks';
import { useHasMounted } from '@/hooks/useHasMounted';

interface AdminGuardProps {
  children: ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const hasMounted = useHasMounted();
  const { isAuthenticated, sessionResolved, status, user } = useAppSelector(state => state.auth);
  const isProfilePending = isAuthenticated && status !== 'succeeded' && status !== 'failed';

  if (!hasMounted || !sessionResolved || isProfilePending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          正在确认管理员权限…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AccessDenied title="请先登录后访问管理中心" />;
  }

  if (!user?.is_superuser) {
    return <AccessDenied title="无权访问管理中心" />;
  }

  return children;
}

function AccessDenied({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">管理员内容仍会由服务端逐请求校验权限。</p>
      </div>
    </div>
  );
}
