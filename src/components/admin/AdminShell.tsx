import type { ReactNode } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 lg:px-6">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Fusion 管理中心
        </div>
        {/* 管理页使用独立 CSP，必须整页导航才能让浏览器切回普通页面 CSP。 */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/chat/new" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回聊天
        </a>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
