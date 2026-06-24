'use client';

import { cn } from '@/lib/utils';

type ChatLoadingSurfaceProps = {
  variant?: 'chat' | 'app-shell';
  className?: string;
};

function ChatSkeleton() {
  return (
    <div
      data-testid="chat-loading-surface"
      role="status"
      aria-label="正在准备对话内容"
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8"
    >
      <div className="flex justify-end">
        <div
          data-testid="chat-loading-user-bubble"
          className="w-full max-w-xl space-y-3 rounded-2xl bg-primary/8 px-5 py-4"
        >
          <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-primary/15" />
          <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-primary/10" />
        </div>
      </div>
      <div
        data-testid="chat-loading-assistant-card"
        className="w-full max-w-2xl space-y-4 rounded-2xl border border-border/50 bg-card/80 px-5 py-5 shadow-fdv2-xs"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="h-3.5 w-32 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="space-y-3">
          <div className="h-3.5 w-11/12 animate-pulse rounded-full bg-muted" />
          <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-muted/80" />
          <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-muted/70" />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="h-8 animate-pulse rounded-lg border border-border/60 bg-muted/40" />
          <div className="h-8 animate-pulse rounded-lg border border-border/60 bg-muted/30" />
          <div className="h-8 animate-pulse rounded-lg border border-border/60 bg-muted/20" />
        </div>
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <aside
      data-testid="chat-loading-app-shell"
      className="hidden w-[280px] shrink-0 border-r border-border/60 bg-muted/20 p-4 md:block"
      aria-hidden="true"
    >
      <div className="mb-5 h-9 rounded-lg bg-background/80 shadow-fdv2-xs" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            data-testid="chat-loading-sidebar-row"
            className="space-y-2 rounded-lg border border-border/50 bg-background/70 p-3"
          >
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted" />
            <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-muted/70" />
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function ChatLoadingSurface({
  variant = 'chat',
  className,
}: ChatLoadingSurfaceProps) {
  if (variant === 'app-shell') {
    return (
      <div className={cn('flex h-screen w-full bg-background', className)}>
        <SidebarSkeleton />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            <ChatSkeleton />
          </div>
          <div className="border-t border-border/50 p-4">
            <div className="mx-auto h-16 w-full max-w-3xl rounded-2xl border border-border/60 bg-card/80 shadow-fdv2-xs" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={className}>
      <ChatSkeleton />
    </div>
  );
}
