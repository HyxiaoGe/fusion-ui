'use client';

import { cn } from '@/lib/utils';

type ChatLoadingSurfaceProps = {
  variant?: 'chat' | 'app-shell';
  className?: string;
};

function BlankChatPlaceholder({ className }: { className?: string }) {
  return (
    <div
      data-testid="chat-loading-surface"
      role="status"
      aria-label="正在准备对话内容"
      className={cn('min-h-[240px] w-full', className)}
    />
  );
}

export default function ChatLoadingSurface({
  variant = 'chat',
  className,
}: ChatLoadingSurfaceProps) {
  if (variant === 'app-shell') {
    return (
      <div
        data-testid="chat-loading-app-shell"
        role="status"
        aria-label="正在准备应用"
        className={cn('h-screen w-full bg-background', className)}
      />
    );
  }

  return <BlankChatPlaceholder className={className} />;
}
