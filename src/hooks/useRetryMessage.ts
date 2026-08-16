// src/hooks/useRetryMessage.ts
import { useCallback } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { useStore } from 'react-redux';
import { setGlobalError } from '@/redux/slices/conversationSlice';
import { getChatCapabilities } from '@/lib/api/chat';
import {
  getSendModelErrorMessage,
  resolveSendModel,
} from '@/lib/chat/sendModelResolution';
import type { Message, TextBlock, FileBlock } from '@/types/conversation';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import type { RootState } from '@/redux/store';

type SendMessageFn = (
  content: string,
  options: {
    conversationId: string | null;
    resolvedModelId?: string;
    knowledgeBaseIds?: string[];
    retryUserMessageId?: string;
    retryAssistantMessageId?: string;
    onRejectedBeforeSend?: () => void;
    onAccepted?: () => void;
  },
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
 * 消息重试 hook：复用原轮次消息 ID，并让服务端原位生成回答。
 * 需要传入 sendMessage 函数引用以避免循环依赖。
 */
export function useRetryMessage(sendMessage: SendMessageFn) {
  const dispatch = useAppDispatch();
  const store = useStore();

  return useCallback(
    async (
      messageId: string,
      conversationId: string,
      knowledgeBaseIds?: string[],
    ) => {
      const state = store.getState() as RootState;
      const conversation = state.conversation.byId[conversationId];
      if (!conversation) return;

      const messages = conversation.messages;
      const targetIndex = messages.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) return;

      const targetMsg = messages[targetIndex];
      const nextMessage = messages[targetIndex + 1];
      const isLatestRetryTurn = targetMsg.role === 'assistant'
        ? targetIndex === messages.length - 1
        : targetIndex === messages.length - 1
          || (
            targetIndex === messages.length - 2
            && nextMessage?.role === 'assistant'
          );
      if (!isLatestRetryTurn) {
        dispatch(setGlobalError('只能重新发送或生成会话中的最后一轮消息'));
        return;
      }
      const effectiveKnowledgeBaseIds = knowledgeBaseIds
        ?? conversation.knowledge_base_ids;
      const knowledgeScopeOptions = knowledgeBaseIds === undefined
        ? {}
        : { knowledgeBaseIds };
      const modelResolution = resolveSendModel(state, conversationId);
      if (modelResolution.status !== 'ready') {
        dispatch(setGlobalError(getSendModelErrorMessage(modelResolution)));
        return;
      }

      try {
        const capabilities = await getChatCapabilities();
        if (!capabilities.message_retry_v1) {
          dispatch(setGlobalError('当前服务版本暂不支持安全重试，请刷新页面后再试'));
          return;
        }
      } catch {
        dispatch(setGlobalError('当前服务版本暂不支持安全重试，请刷新页面后再试'));
        return;
      }

      if (targetMsg.role === 'assistant') {
        // 重新生成：复用原 user/assistant ID，由服务端原位替换回答。
        let userMessage: Message | null = null;
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            userMessage = messages[i];
            break;
          }
        }
        if (!userMessage) return;

        const { text, attachments } = extractMessageContent(userMessage);

        if (effectiveKnowledgeBaseIds?.length && attachments.length > 0) {
          dispatch(setGlobalError(
            '严格知识库模式不能重试带附件的历史消息，请先清空知识库选择',
          ));
          return;
        }

        if (text || attachments.length > 0) {
          await sendMessage(
            text,
            {
              conversationId,
              resolvedModelId: modelResolution.model.id,
              ...knowledgeScopeOptions,
              retryUserMessageId: userMessage.id,
              retryAssistantMessageId: targetMsg.id,
            },
            attachments.length > 0 ? attachments : undefined,
          );
        }
      } else if (targetMsg.role === 'user') {
        // 重新发送：复用原 user；若已有回答则同时复用 assistant。
        const nextMsg = nextMessage;

        const { text, attachments } = extractMessageContent(targetMsg);

        if (effectiveKnowledgeBaseIds?.length && attachments.length > 0) {
          dispatch(setGlobalError(
            '严格知识库模式不能重试带附件的历史消息，请先清空知识库选择',
          ));
          return;
        }

        if (text || attachments.length > 0) {
          await sendMessage(
            text,
            {
              conversationId,
              resolvedModelId: modelResolution.model.id,
              ...knowledgeScopeOptions,
              retryUserMessageId: targetMsg.id,
              ...(nextMsg?.role === 'assistant'
                ? { retryAssistantMessageId: nextMsg.id }
                : {}),
            },
            attachments.length > 0 ? attachments : undefined,
          );
        }
      }
    },
    [dispatch, sendMessage, store],
  );
}
