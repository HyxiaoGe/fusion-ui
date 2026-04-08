'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatInput from '@/components/chat/ChatInput';
import { ChatSidebarLazy, HomePageLazy } from '@/components/lazy/LazyComponents';
import MainLayout from '@/components/layouts/MainLayout';

import { useAppSelector } from '@/redux/hooks';
import { useSendMessage } from '@/hooks/useSendMessage';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';
import type { FileAttachment } from '@/lib/utils/fileHelpers';

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inputKey, setInputKey] = useState(() => Date.now());
  const models = useAppSelector((state) => state.models.models);
  const { sendMessage } = useSendMessage();

  const handleSendMessage = useCallback((content: string, attachments?: FileAttachment[], pendingConversationId?: string) => {
    return sendMessage(
      content,
      {
        conversationId: pendingConversationId || null,
        isDraft: true,
        onMaterialized: (serverConversationId) => {
          router.replace(`/chat/${serverConversationId}`);
          setInputKey(Date.now());
        },
      },
      attachments
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
