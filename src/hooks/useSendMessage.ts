import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  appendMessage,
  materializeConversation,
  removeConversation,
  removeMessage,
  requestConversationListRefresh,
  setAnimatingTitleId,
  setGlobalError,
  setPendingConversationId,
  updateConversationTitle,
  updateMessage,
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import {
  completeThinkingPhase,
  endStream,
  migrateStreamConversation,
  startStream,
  startStreamingReasoning,
  updateStreamContent,
  updateStreamReasoning,
} from '@/redux/slices/streamSlice';
import { sendMessageStream } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import type { Message } from '@/types/conversation';

// 打字机参数（可调节）
// CHARS_PER_TICK × (1000 / TICK_MS) ≈ 每秒显示字符数
// 当前配置：4 × 33 ≈ 133 字符/秒，中文约 66 字/秒
// 实现注意：setInterval 是 wall clock 固定节奏，不与浏览器渲染帧对齐（有意选择）
// ⚠️ slice 按 UTF-16 code unit 计数，emoji 等多 code unit 字符可能被切断（已知简化）
const TYPEWRITER_CHARS_PER_TICK = 4;
const TYPEWRITER_TICK_MS = 30;

// ── 诊断日志（临时，调完删除） ──
// 只在流结束时输出一份汇总，不逐条刷屏
type _ChunkRecord = { size: number; gap: number; elapsed: number; buffered: number };
let _dbgStreamStart = 0;
let _dbgLastChunkTime = 0;
let _dbgChunks: _ChunkRecord[] = [];
let _dbgTickCount = 0;
let _dbgMaxBuffered = 0;

function _dbgResetStream() {
  _dbgStreamStart = performance.now();
  _dbgLastChunkTime = _dbgStreamStart;
  _dbgChunks = [];
  _dbgTickCount = 0;
  _dbgMaxBuffered = 0;
}

function _dbgLogChunk(delta: string, networkLen: number, displayedLen: number) {
  const now = performance.now();
  const gap = now - _dbgLastChunkTime;
  _dbgLastChunkTime = now;
  const buffered = networkLen - displayedLen;
  if (buffered > _dbgMaxBuffered) _dbgMaxBuffered = buffered;
  _dbgChunks.push({ size: delta.length, gap, elapsed: now - _dbgStreamStart, buffered });
}

function _dbgLogTick(_displayedLen: number, networkLen: number) {
  _dbgTickCount++;
  const buffered = networkLen - _displayedLen;
  if (buffered > _dbgMaxBuffered) _dbgMaxBuffered = buffered;
}

function _dbgLogDone(networkLen: number, displayedLen: number) {
  const elapsed = performance.now() - _dbgStreamStart;
  const totalChars = _dbgChunks.reduce((s, c) => s + c.size, 0);
  const gaps = _dbgChunks.map(c => c.gap);
  const sizes = _dbgChunks.map(c => c.size);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const sortedSizes = [...sizes].sort((a, b) => a - b);
  const median = (arr: number[]) => arr.length === 0 ? 0 : arr[Math.floor(arr.length / 2)];
  const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  // 找出间隔最大的 5 个 chunk（可能是卡顿点）
  const topGaps = _dbgChunks
    .map((c, i) => ({ index: i + 1, gap: c.gap, size: c.size }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5);

  console.log(
    `\n📊 [Stream Diagnostic Report]\n` +
    `─────────────────────────────\n` +
    `Chunks: ${_dbgChunks.length}  |  Total chars: ${totalChars}  |  Duration: ${(elapsed / 1000).toFixed(1)}s\n` +
    `Typewriter ticks: ${_dbgTickCount}  |  Buffered at done: ${networkLen - displayedLen}\n` +
    `\n` +
    `Chunk size:  min=${sortedSizes[0] ?? 0}  median=${median(sortedSizes)}  avg=${avg(sizes).toFixed(1)}  max=${sortedSizes[sortedSizes.length - 1] ?? 0}\n` +
    `Chunk gap:   min=${sortedGaps[0]?.toFixed(0) ?? 0}ms  median=${median(sortedGaps).toFixed(0)}ms  avg=${avg(gaps).toFixed(0)}ms  max=${sortedGaps[sortedGaps.length - 1]?.toFixed(0) ?? 0}ms\n` +
    `Max buffered: ${_dbgMaxBuffered} chars\n` +
    `\n` +
    `Top 5 longest gaps:\n` +
    topGaps.map(g => `  #${g.index}: gap=${g.gap.toFixed(0)}ms  size=${g.size}ch`).join('\n') +
    `\n─────────────────────────────`
  );
}

type SendMessageOptions = {
  conversationId: string | null;
  onMaterialized?: (serverConversationId: string) => void;
  onStreamEnd?: (conversationId: string) => void;
};

async function postStreamActions(conversationId: string, dispatch: ReturnType<typeof useAppDispatch>) {
  try {
    const title = await generateChatTitle(conversationId, undefined, { max_length: 20 });
    dispatch(updateConversationTitle({ id: conversationId, title }));
    dispatch(setAnimatingTitleId(conversationId));
    setTimeout(() => dispatch(setAnimatingTitleId(null)), title.length * 200 + 1000);
  } catch {
    // ignore title failures
  }
  dispatch(requestConversationListRefresh());
}

export function useSendMessage() {
  const dispatch = useAppDispatch();
  const models = useAppSelector((state) => state.models.models);
  const selectedModelId = useAppSelector((state) => state.models.selectedModelId);
  const reasoningEnabled = useAppSelector((state) => state.conversation.reasoningEnabled);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const userMessageIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantHasContentRef = useRef(false);
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStreaming = useCallback(() => {
    const convId = activeConvIdRef.current;
    const userMsgId = userMessageIdRef.current;
    const assistantMsgId = assistantMessageIdRef.current;
    const hasContent = assistantHasContentRef.current;

    if (typewriterIntervalRef.current !== null) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    if (convId && userMsgId) {
      dispatch(
        updateMessage({
          conversationId: convId,
          messageId: userMsgId,
          patch: { status: null },
        })
      );
    }

    if (convId && assistantMsgId && !hasContent) {
      dispatch(removeMessage({ conversationId: convId, messageId: assistantMsgId }));
    }

    dispatch(endStream());
    activeConvIdRef.current = null;
    userMessageIdRef.current = null;
    assistantMessageIdRef.current = null;
    assistantHasContentRef.current = false;
  }, [dispatch]);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions, files?: File[]) => {
      if (!content.trim() && (!files || files.length === 0)) return;

      if (abortControllerRef.current) {
        stopStreaming();
      }

      const enabledModel =
        models.find((model) => model.id === selectedModelId && model.enabled) ??
        models.find((model) => model.enabled);

      if (!enabledModel) {
        dispatch(setGlobalError('没有可用的模型，请先在设置中启用一个模型'));
        return;
      }

      const isDraft = options.conversationId === null;
      const tempConvId = isDraft ? uuidv4() : options.conversationId!;

      if (isDraft) {
        dispatch(setPendingConversationId(tempConvId));
        dispatch(
          upsertConversation({
            id: tempConvId,
            title: content.substring(0, 30),
            model: enabledModel.id,
            provider: enabledModel.provider,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        );
      }

      activeConvIdRef.current = tempConvId;
      assistantHasContentRef.current = false;

      const userMessageId = uuidv4();
      const assistantMessageId = uuidv4();
      userMessageIdRef.current = userMessageId;
      assistantMessageIdRef.current = assistantMessageId;

      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
        reasoning: null,
        status: 'pending',
        timestamp: Date.now(),
      };

      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        reasoning: null,
        timestamp: Date.now(),
      };

      dispatch(appendMessage({ conversationId: tempConvId, message: userMessage }));
      dispatch(appendMessage({ conversationId: tempConvId, message: assistantPlaceholder }));
      dispatch(startStream({ conversationId: tempConvId, messageId: assistantMessageId }));

      const controller = new AbortController();
      abortControllerRef.current = controller;
      _dbgResetStream();
      const supportsReasoning = enabledModel.capabilities?.deepThinking ?? false;
      const useReasoning = reasoningEnabled && supportsReasoning;
      let serverConvId: string | null = null;
      let materializedOnce = false;
      let networkContent = '';
      let displayedLength = 0;
      let networkDone = false;
      let donePayload: {
        incomingConvId: string | undefined;
        accumulatedContent: string;
        accumulatedReasoning: string;
      } | null = null;
      let localReasoning = '';
      let reasoningStarted = false;

      const materializeIfNeeded = (incomingConvId?: string) => {
        if (!isDraft || !incomingConvId || materializedOnce) {
          return;
        }

        materializedOnce = true;
        serverConvId = incomingConvId;
        activeConvIdRef.current = incomingConvId;
        dispatch(
          materializeConversation({
            pendingId: tempConvId,
            serverConversation: {
              id: incomingConvId,
              title: content.substring(0, 30),
              model: enabledModel.id,
              provider: enabledModel.provider,
              messages: [
                { ...userMessage, chatId: incomingConvId },
                { ...assistantPlaceholder, chatId: incomingConvId },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          })
        );
        dispatch(migrateStreamConversation(incomingConvId));
        options.onMaterialized?.(incomingConvId);
      };

      const completeStream = (
        payload: NonNullable<typeof donePayload>
      ) => {
        const { incomingConvId, accumulatedContent, accumulatedReasoning } = payload;

        materializeIfNeeded(incomingConvId);

        const effectiveConvId = activeConvIdRef.current;
        if (!effectiveConvId) return;

        const finalConvId = serverConvId ?? incomingConvId ?? effectiveConvId;
        if (accumulatedReasoning.trim()) {
          dispatch(completeThinkingPhase());
        }
        dispatch(
          updateMessage({
            conversationId: finalConvId,
            messageId: assistantMessageId,
            patch: {
              content: accumulatedContent,
              reasoning: accumulatedReasoning.trim() ? accumulatedReasoning : null,
              ...(accumulatedReasoning.trim()
                ? {
                    isReasoningVisible: false,
                    reasoningEndTime: Date.now(),
                  }
                : {}),
            },
          })
        );
        dispatch(
          updateMessage({
            conversationId: finalConvId,
            messageId: userMessageId,
            patch: { status: null },
          })
        );
        dispatch(endStream());
        abortControllerRef.current = null;
        activeConvIdRef.current = null;
        userMessageIdRef.current = null;
        assistantMessageIdRef.current = null;
        assistantHasContentRef.current = false;
        options.onStreamEnd?.(finalConvId);
        void postStreamActions(finalConvId, dispatch);
      };

      const startTypewriter = () => {
        if (typewriterIntervalRef.current !== null) {
          return;
        }

        typewriterIntervalRef.current = setInterval(() => {
          if (displayedLength < networkContent.length) {
            displayedLength = Math.min(
              displayedLength + TYPEWRITER_CHARS_PER_TICK,
              networkContent.length
            );
            _dbgLogTick(displayedLength, networkContent.length);
            dispatch(updateStreamContent(networkContent.slice(0, displayedLength)));
          }

          if (
            networkDone &&
            displayedLength >= networkContent.length &&
            donePayload !== null
          ) {
            clearInterval(typewriterIntervalRef.current!);
            typewriterIntervalRef.current = null;
            completeStream(donePayload);
          }
        }, TYPEWRITER_TICK_MS);
      };

      try {
        await sendMessageStream(
          {
            provider: enabledModel.provider,
            model: enabledModel.id,
            message: content.trim(),
            conversation_id: isDraft ? undefined : options.conversationId!,
            stream: true,
            options: { use_reasoning: useReasoning },
          },
          {
            onReady: ({ conversationId: incomingConvId }) => {
              materializeIfNeeded(incomingConvId);
            },
            onContent: (delta) => {
              networkContent += delta;
              _dbgLogChunk(delta, networkContent.length, displayedLength);
              const effectiveConvId = activeConvIdRef.current;
              if (!effectiveConvId) return;
              assistantHasContentRef.current = assistantHasContentRef.current || Boolean(delta);
              startTypewriter();
            },
            onReasoning: (delta) => {
              localReasoning += delta;
              const effectiveConvId = activeConvIdRef.current;
              if (!effectiveConvId) return;
              if (!reasoningStarted) {
                reasoningStarted = true;
                dispatch(startStreamingReasoning());
              }
              dispatch(updateStreamReasoning(localReasoning));
            },
            onDone: (_messageId, incomingConvId, accumulatedContent, accumulatedReasoning) => {
              _dbgLogDone(networkContent.length, displayedLength);
              networkDone = true;
              donePayload = { incomingConvId, accumulatedContent, accumulatedReasoning };

              if (displayedLength >= networkContent.length) {
                if (typewriterIntervalRef.current !== null) {
                  clearInterval(typewriterIntervalRef.current);
                  typewriterIntervalRef.current = null;
                }
                completeStream(donePayload);
              }
            },
            onError: (message) => {
              dispatch(setGlobalError(message));
            },
          },
          controller.signal
        );
      } catch (error) {
        if (typewriterIntervalRef.current !== null) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }
        if (controller.signal.aborted) return;

        const effectiveConvIdOnError = activeConvIdRef.current ?? tempConvId;
        if ((materializedOnce || !isDraft) && displayedLength > 0) {
          dispatch(
            updateMessage({
              conversationId: effectiveConvIdOnError,
              messageId: assistantMessageId,
              patch: {
                content: networkContent.slice(0, displayedLength),
              },
            })
          );
        }

        if (isDraft && serverConvId && !materializedOnce) {
          materializedOnce = true;
        }
        const effectiveConvId = activeConvIdRef.current ?? tempConvId;
        if (materializedOnce || !isDraft) {
          dispatch(
            updateMessage({
              conversationId: effectiveConvId,
              messageId: userMessageId,
              patch: { status: 'failed' },
            })
          );
          dispatch(
            removeMessage({ conversationId: effectiveConvId, messageId: assistantMessageId })
          );
        } else {
          dispatch(removeConversation(tempConvId));
          dispatch(setPendingConversationId(null));
        }
        dispatch(endStream());
        abortControllerRef.current = null;
        activeConvIdRef.current = null;
        userMessageIdRef.current = null;
        assistantMessageIdRef.current = null;
        assistantHasContentRef.current = false;
        const message = error instanceof Error ? error.message : '发送失败，请重试';
        dispatch(setGlobalError(message));
      }
    },
    [dispatch, models, reasoningEnabled, selectedModelId, stopStreaming]
  );

  return { sendMessage, stopStreaming };
}
