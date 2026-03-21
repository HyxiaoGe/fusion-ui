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
  const pendingDraftMessage = useMemo(
    () => draftChat?.messages.find((message) => message.role === 'user')?.content ?? null,
    [draftChat]
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
          {pendingDraftMessage ? (
            <div className="flex flex-col space-y-8 pb-8 px-4 max-w-5xl mx-auto w-full h-full overflow-y-auto">
              <div className="pt-8 text-center">
                <h1 className="text-3xl font-bold mb-2">正在开始这轮对话</h1>
                <p className="text-muted-foreground">正在创建会话并等待 AI 开始回复。</p>
              </div>

              <div className="max-w-3xl mx-auto w-full space-y-4">
                <div className="ml-auto max-w-2xl rounded-3xl bg-primary/10 px-5 py-4 text-sm">
                  {pendingDraftMessage}
                </div>
                <div className="max-w-2xl rounded-3xl border border-border/60 bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
                  AI 正在准备回复...
                </div>
              </div>
            </div>
          ) : (
            <HomePageLazy onSendMessage={handleSendMessage} onNewChat={handleNewChat} />
          )}
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
