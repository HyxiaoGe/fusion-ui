import type { ReactNode } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminPage } from '@/types/adminAudit';

export function AdminPanelHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function AdminLoading() {
  return <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取…</div>;
}

export function AdminError({ message, onRetry, retryLabel = '重新加载' }: { message: string; onRetry: () => void; retryLabel?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
      <AlertCircle className="h-5 w-5 text-danger" />
      <p className="text-sm">{message}</p>
      <Button variant="outline" onClick={onRetry} aria-label={retryLabel}><RefreshCw className="h-4 w-4" />重试</Button>
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{children}</div>;
}

export function AdminPagination({ page, onPageChange }: { page: Pick<AdminPage<unknown>, 'page' | 'total_pages' | 'total'>; onPageChange: (page: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>共 {page.total} 条 · 第 {page.page}/{Math.max(page.total_pages, 1)} 页</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}><ChevronLeft />上一页</Button>
        <Button variant="outline" size="sm" disabled={page.page >= page.total_pages} onClick={() => onPageChange(page.page + 1)}>下一页<ChevronRight /></Button>
      </div>
    </div>
  );
}

export function formatAdminDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}
