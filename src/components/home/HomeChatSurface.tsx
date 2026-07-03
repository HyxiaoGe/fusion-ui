'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ChatInput from '@/components/chat/ChatInput';
import HomePage from '@/components/home/HomePage';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setSelectedModel } from '@/redux/slices/modelsSlice';
import { useSendMessage } from '@/hooks/useSendMessage';
import { getFirstEnabledModelId, getPreferredModelId } from '@/lib/models/modelPreference';
import { buildChatConversationPath, buildChatNewPath, isChatNewPath } from '@/lib/routes/chatRoutes';
import type { FileAttachment } from '@/lib/utils/fileHelpers';

export default function HomeChatSurface() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [inputKey, setInputKey] = useState(() => Date.now());
  const appliedModelHintRef = useRef<string | null>(null);
  const models = useAppSelector((state) => state.models.models);
  const { sendMessage } = useSendMessage();
  const modelHint = searchParams?.get('model') ?? null;

  useEffect(() => {
    if (!modelHint || appliedModelHintRef.current === modelHint) {
      return;
    }

    const preferredModelId = getPreferredModelId(models, modelHint);
    if (preferredModelId !== modelHint) {
      return;
    }

    appliedModelHintRef.current = modelHint;
    dispatch(setSelectedModel(modelHint));
  }, [dispatch, modelHint, models]);

  const handleSendMessage = useCallback((
    content: string,
    attachments?: FileAttachment[],
    pendingConversationId?: string
  ) => {
    return sendMessage(
      content,
      {
        conversationId: pendingConversationId ?? null,
        isDraft: true,
        onDraftCreated: () => {},
        onMaterialized: (serverConversationId) => {
          router.replace(buildChatConversationPath(serverConversationId));
          setInputKey(Date.now());
        },
      },
      attachments
    );
  }, [router, sendMessage]);

  const handleNewChat = useCallback(() => {
    if (isChatNewPath(pathname)) {
      setInputKey(Date.now());
      return;
    }

    const modelToUse = modelHint || getFirstEnabledModelId(models);
    setInputKey(Date.now());
    router.push(buildChatNewPath(modelToUse));
  }, [modelHint, models, pathname, router]);

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 overflow-y-auto">
        <HomePage onSendMessage={handleSendMessage} onNewChat={handleNewChat} />
      </div>
      <div className="flex-shrink-0 p-4">
        <ChatInput
          key={inputKey}
          onSendMessage={handleSendMessage}
          activeChatId={null}
          autoFocus
          focusSignal={inputKey}
        />
      </div>
    </div>
  );
}
