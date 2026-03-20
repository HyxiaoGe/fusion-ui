'use client';

import ChatInput from '@/components/chat/ChatInput';
import { ChatSidebarLazy, HomePageLazy, ModelSelectorLazy } from '@/components/lazy/LazyComponents';
import MainLayout from '@/components/layouts/MainLayout';
import { UserAvatarMenu } from '@/components/layouts/UserAvatarMenu';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setActiveChat } from '@/redux/slices/chatSlice';
import { useChatActions } from '@/hooks/useChatActions';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';

export default function Home() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftModeInitializedRef = useRef(false);
  const [inputKey, setInputKey] = useState(() => Date.now());

  const { models, activeChatId, chats } = useAppSelector((state) => ({
    models: state.models.models,
    activeChatId: state.chat.activeChatId,
    chats: state.chat.chats,
  }));

  const draftChat = useMemo(() => {
    if (!activeChatId) {
      return null;
    }

    return chats.find((chat) => chat.id === activeChatId) || null;
  }, [activeChatId, chats]);

  useEffect(() => {
    if (draftModeInitializedRef.current) {
      return;
    }

    draftModeInitializedRef.current = true;
    dispatch(setActiveChat(null));
  }, [dispatch]);

  useEffect(() => {
    setInputKey(Date.now());
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId || !draftChat || draftChat.messages.length === 0) {
      return;
    }

    router.replace(`/chat/${activeChatId}`);
  }, [activeChatId, draftChat, router]);

  const {
    sendMessage,
  } = useChatActions({
    activeChatIdOverride: null,
    draftMode: true,
  });

  const handleSendMessage = useCallback((content: string, files?: File[]) => {
    return sendMessage(content, files as any);
  }, [sendMessage]);

  const handleNewChat = useCallback(() => {
    draftModeInitializedRef.current = true;
    dispatch(setActiveChat(null));
    const modelToUse = searchParams?.get('model') || getFirstEnabledModelId(models);
    router.push(modelToUse ? `/?new=true&model=${modelToUse}` : '/');
  }, [dispatch, models, router, searchParams]);

  return (
    <MainLayout
      sidebar={
        <ChatSidebarLazy onNewChat={handleNewChat} activeChatIdOverride={null} />
      }
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
            activeChatId={null}
          />
        </div>
      </div>
    </MainLayout>
  );
}
