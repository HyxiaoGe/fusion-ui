'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatInput from '@/components/chat/ChatInput';
import { ChatSidebarLazy, HomePageLazy, ModelSelectorLazy } from '@/components/lazy/LazyComponents';
import MainLayout from '@/components/layouts/MainLayout';
import { UserAvatarMenu } from '@/components/layouts/UserAvatarMenu';
import { useAppSelector } from '@/redux/hooks';
import { useSendMessage } from '@/hooks/useSendMessage';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inputKey, setInputKey] = useState(() => Date.now());
  const { models, pendingConversationId, conversationsById } = useAppSelector((state) => ({
    models: state.models.models,
    pendingConversationId: state.conversation.pendingConversationId,
    conversationsById: state.conversation.byId,
  }));
  const draftChat = useMemo(
    () => (pendingConversationId ? conversationsById[pendingConversationId] || null : null),
    [conversationsById, pendingConversationId]
  );
  const { sendMessage } = useSendMessage();

  const handleSendMessage = useCallback((content: string, files?: File[]) => {
    return sendMessage(
      content,
      {
        conversationId: null,
        onMaterialized: (serverConversationId) => {
          router.replace(`/chat/${serverConversationId}`);
          setInputKey(Date.now());
        },
      },
      files as any
    );
  }, [router, sendMessage]);

  const handleNewChat = useCallback(() => {
    const modelToUse = searchParams?.get('model') || getFirstEnabledModelId(models);
    setInputKey(Date.now());
    router.push(modelToUse ? `/?new=true&model=${modelToUse}` : '/');
  }, [models, router, searchParams]);

  return (
    <MainLayout
      sidebar={<ChatSidebarLazy onNewChat={handleNewChat} />}
      header={
        <header className="h-14 border-b flex items-center justify-between gap-3 px-4 sm:px-5 sticky top-0 z-10 shadow-sm bg-background">
          <div className="flex items-center shrink-0">
            <Link href="/" className="text-xl font-bold flex items-center">
              <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-4 px-2">
            <div className="hidden truncate px-2 py-1 font-medium text-sm sm:block sm:text-base">
              新对话
            </div>
            <ModelSelectorLazy />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <UserAvatarMenu />
          </div>
        </header>
      }
    >
      <div className="h-full flex flex-col relative">
        <div className="flex-1 overflow-y-auto">
          <HomePageLazy onSendMessage={handleSendMessage} onNewChat={handleNewChat} />
        </div>
        <div className="flex-shrink-0 p-4">
          <ChatInput
            key={inputKey}
            onSendMessage={handleSendMessage}
            activeChatId={draftChat?.id ?? null}
          />
        </div>
      </div>
    </MainLayout>
  );
}
