// src/hooks/useRetryMessage.ts
import { useCallback } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { useStore } from 'react-redux';
import { removeMessage } from '@/redux/slices/conversationSlice';
import type { Message, TextBlock, FileBlock, Conversation } from '@/types/conversation';
import type { FileAttachment } from '@/lib/utils/fileHelpers';

type SendMessageFn = (
  content: string,
  options: { conversationId: string | null },
  attachments?: FileAttachment[],
) => Promise<void>;

function extractMessageContent(msg: Message) {
  const text = msg.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const attachments: FileAttachment[] = msg.content
    .filter((b): b is FileBlock => b.type === 'file')
    .map((b) => ({
      fileId: b.file_id,
      filename: b.filename,
      mimeType: b.mime_type,
      previewUrl: b.thumbnail_url,
    }));
  return { text, attachments };
}

/**
 * 消息重试 hook：删除目标消息（及关联消息）后重新发送。
 * 需要传入 sendMessage 函数引用以避免循环依赖。
 */
export function useRetryMessage(sendMessage: SendMessageFn) {
  const dispatch = useAppDispatch();
  const store = useStore();

  return useCallback(
    async (messageId: string, conversationId: string) => {
      const state = store.getState() as {
        conversation: { byId: Record<string, Conversation> };
      };
      const conversation = state.conversation.byId[conversationId];
      if (!conversation) return;

      const messages = conversation.messages;
      const targetIndex = messages.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) return;

      const targetMsg = messages[targetIndex];

      if (targetMsg.role === 'assistant') {
        // 重新生成：向上找 user 消息，删除 assistant + user，重新发送
        let userMessage: Message | null = null;
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            userMessage = messages[i];
            break;
          }
        }
        if (!userMessage) return;

        const { text, attachments } = extractMessageContent(userMessage);
        dispatch(removeMessage({ conversationId, messageId }));
        dispatch(removeMessage({ conversationId, messageId: userMessage.id }));

        if (text || attachments.length > 0) {
          await sendMessage(text, { conversationId }, attachments.length > 0 ? attachments : undefined);
        }
      } else if (targetMsg.role === 'user') {
        // 重新发送：删除 user + 其后的 assistant，重新发送
        const nextMsg = messages[targetIndex + 1];
        if (nextMsg && nextMsg.role === 'assistant') {
          dispatch(removeMessage({ conversationId, messageId: nextMsg.id }));
        }
        dispatch(removeMessage({ conversationId, messageId }));

        const { text, attachments } = extractMessageContent(targetMsg);

        if (text || attachments.length > 0) {
          await sendMessage(text, { conversationId }, attachments.length > 0 ? attachments : undefined);
        }
      }
    },
    [dispatch, sendMessage, store],
  );
}
