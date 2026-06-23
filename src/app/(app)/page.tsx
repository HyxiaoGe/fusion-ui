'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatInput from '@/components/chat/ChatInput';
import { HomePageLazy } from '@/components/lazy/LazyComponents';

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

  // 监听 ?new=true 触发 ChatInput reset
  // 来源：(app)/layout 的 sidebar "新对话" 按钮 push('/?new=true&model=...')
  useEffect(() => {
    if (searchParams?.get('new') === 'true') {
      setInputKey(Date.now());
    }
  }, [searchParams]);

  const handleSendMessage = useCallback((content: string, attachments?: FileAttachment[], pendingConversationId?: string) => {
    return sendMessage(
      content,
      {
        conversationId: pendingConversationId || null,
        isDraft: true,
        onDraftCreated: (draftConversationId) => {
          router.replace(`/chat/${draftConversationId}`);
        },
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
  );
}
