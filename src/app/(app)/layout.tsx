'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layouts/MainLayout';
import { ChatSidebarLazy } from '@/components/lazy/LazyComponents';
import { useAppSelector } from '@/redux/hooks';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const models = useAppSelector((state) => state.models.models);

  // 持久化：sidebar 在 / 与 /chat/[chatId] 之间路由切换时不再 unmount
  // ChatSidebar 内部自己根据 pathname 解析 activeChatId（不再需要 page 传 activeChatIdOverride）
  const handleNewChat = useCallback(() => {
    const modelToUse = getFirstEnabledModelId(models);
    router.push(modelToUse ? `/?new=true&model=${modelToUse}` : '/');
  }, [models, router]);

  return (
    <MainLayout
      sidebar={<ChatSidebarLazy onNewChat={handleNewChat} />}
    >
      {children}
    </MainLayout>
  );
}
