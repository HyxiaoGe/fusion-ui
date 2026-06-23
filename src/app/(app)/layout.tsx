'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import MainLayout from '@/components/layouts/MainLayout';
import { ChatSidebarLazy } from '@/components/lazy/LazyComponents';
import HomeChatSurface from '@/components/home/HomeChatSurface';
import { useAppSelector } from '@/redux/hooks';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const models = useAppSelector((state) => state.models.models);
  const [showNewChatSurface, setShowNewChatSurface] = useState(false);
  const pendingFromPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (showNewChatSurface && pendingFromPathRef.current && pathname !== pendingFromPathRef.current) {
      setShowNewChatSurface(false);
      pendingFromPathRef.current = null;
    }
  }, [pathname, showNewChatSurface]);

  // 持久化：sidebar 在 / 与 /chat/[chatId] 之间路由切换时不再 unmount
  // ChatSidebar 内部自己根据 pathname 解析 activeChatId（不再需要 page 传 activeChatIdOverride）
  const handleNewChat = useCallback(() => {
    const modelToUse = getFirstEnabledModelId(models);
    pendingFromPathRef.current = pathname;
    setShowNewChatSurface(true);
    router.push(modelToUse ? `/?new=true&model=${modelToUse}` : '/');
  }, [models, pathname, router]);

  return (
    <MainLayout
      sidebar={<ChatSidebarLazy onNewChat={handleNewChat} />}
    >
      {showNewChatSurface ? <HomeChatSurface /> : children}
    </MainLayout>
  );
}
