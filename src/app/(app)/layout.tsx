'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import MainLayout from '@/components/layouts/MainLayout';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { useAppSelector } from '@/redux/hooks';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';
import { buildChatNewPath, isChatNewPath } from '@/lib/routes/chatRoutes';
import { PerfProbe, useRenderProbe } from '@/lib/debug/perfProbe';
import { requestNewChatDraftReset } from '@/lib/chat/newChatDraftReset';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useRenderProbe('AppLayout');
  const router = useRouter();
  const pathname = usePathname();
  const models = useAppSelector((state) => state.models.models);

  // 持久化：sidebar 在 / 与 /chat/[chatId] 之间路由切换时不再 unmount
  // ChatSidebar 内部自己根据 pathname 解析 activeChatId（不再需要 page 传 activeChatIdOverride）
  const handleNewChat = useCallback(() => {
    const modelToUse = getFirstEnabledModelId(models);
    if (isChatNewPath(pathname)) {
      requestNewChatDraftReset();
    }
    router.push(buildChatNewPath(modelToUse));
  }, [models, pathname, router]);

  return (
    <MainLayout
      sidebar={<ChatSidebar onNewChat={handleNewChat} isNewChatActive={isChatNewPath(pathname)} />}
    >
      <PerfProbe />
      {children}
    </MainLayout>
  );
}
