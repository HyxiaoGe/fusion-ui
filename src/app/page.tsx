'use client';

import ChatInput from '@/components/chat/ChatInput';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ContextEnhancementControl from '@/components/context/ContextEnhancementControl';
import HomePage from '@/components/home/HomePage';
import MainLayout from '@/components/layouts/MainLayout';
import ModelSelector from '@/components/models/ModelSelector';
import RelatedDiscussions from '@/components/search/RelatedDiscussions';
import { Button } from '@/components/ui/button';
import { sendMessageStream } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import { chatStore } from '@/lib/db/chatStore';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  addMessage,
  clearMessages,
  createChat,
  deleteMessage,
  editMessage,
  endStreaming,
  endStreamingReasoning,
  setActiveChat,
  setAllChats,
  setError,
  setMessageStatus,
  startStreaming,
  startStreamingReasoning,
  updateChatTitle,
  updateMessageReasoning,
  updateStreamingContent,
  updateStreamingReasoningContent
} from '@/redux/slices/chatSlice';
import { fetchEnhancedContext } from '@/redux/slices/searchSlice';
import { store } from '@/redux/store';
import { PlusIcon } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [inputKey, setInputKey] = useState(Date.now());

  const { chats, activeChatId, loading, isStreaming } = useAppSelector((state) => state.chat);

  const showWelcome = !activeChatId && chats.length === 0;

  const { models, selectedModelId } = useAppSelector((state) => state.models);
  const [currentUserQuery, setCurrentUserQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const lastDatabaseSync = useAppSelector((state) => state.app.lastDatabaseSync);

  const chatInputRef = useRef<HTMLDivElement>(null);

  // 监听数据库同步事件，强制重新挂载输入组件
  useEffect(() => {
    setInputKey(Date.now());
  }, [lastDatabaseSync]);

  // 监听activeChatId变化，强制重新挂载输入组件
  useEffect(() => {
    setInputKey(Date.now());
  }, [activeChatId]);

  // 在组件挂载时进行数据同步检查
  useEffect(() => {
    const syncWithDatabase = async () => {
      try {
        setIsSyncing(true);

        // 获取数据库中的聊天记录
        const dbChats = await chatStore.getAllChats();

        // 检查Redux中的聊天记录是否与数据库同步
        const needsSync = chats.length !== dbChats.length ||
          !chats.every(chat => dbChats.some(dbChat => dbChat.id === chat.id));

        if (needsSync) {
          console.log('检测到Redux状态与数据库不同步，正在重新加载数据...');

          // 更新Redux状态
          dispatch(setAllChats(dbChats));

          // 如果有活动聊天但在数据库中不存在，或者没有活动聊天但数据库有聊天记录
          if ((activeChatId && !dbChats.some(chat => chat.id === activeChatId)) ||
            (!activeChatId && dbChats.length > 0)) {

            // 设置最新的聊天为活动聊天，或设为null
            const latestChat = dbChats.length > 0
              ? dbChats.reduce((latest, chat) => chat.updatedAt > latest.updatedAt ? chat : latest, dbChats[0])
              : null;

            dispatch(setActiveChat(latestChat?.id || null));
          }
        }
      } catch (error) {
        console.error('同步数据库数据失败:', error);
      } finally {
        setIsSyncing(false);
      }
    };

    syncWithDatabase();
  }, [dispatch, lastDatabaseSync, pathname, searchParams]);

  // 监听活动聊天变化和数据库同步
  useEffect(() => {
    // 当活动聊天ID发生变化时，重置UI焦点
    const resetFocus = () => {
      // 创建一个临时按钮获取焦点然后移除它，强制打破焦点陷阱
      const tempButton = document.createElement('button');
      document.body.appendChild(tempButton);
      tempButton.focus();
      document.body.removeChild(tempButton);

      // 然后将焦点移到聊天区域
      if (chatInputRef.current) {
        chatInputRef.current.click();
      }
    };

    // 短暂延时确保DOM已更新
    const timer = setTimeout(resetFocus, 200);
    return () => clearTimeout(timer);
  }, [activeChatId, lastDatabaseSync]);

  // 获取当前活动的对话
  const activeChat = activeChatId ? chats.find(chat => chat.id === activeChatId) : null;

  // 创建新对话
  const handleNewChat = () => {
    console.log('点击新建对话按钮', { selectedModelId });

    // 确保有选中的模型ID
    const modelToUse = selectedModelId || (models.length > 0 ? models[0].id : null);

    if (!modelToUse) {
      console.error('没有可用的模型，无法创建对话');
      dispatch(setError('没有可用的模型，无法创建对话'));
      return;
    }

    try {
      // 创建对话时传入当前选择的模型ID
      dispatch(createChat({ modelId: modelToUse }));
      console.log('对话创建成功，使用模型：', modelToUse);
    } catch (error) {
      console.error('创建对话失败:', error);
      dispatch(setError('创建对话失败，请重试'));
    }
  };

  // 发送消息
  const handleSendMessage = async (content: string, files?: FileWithPreview[], fileIds?: string[]) => {
    if ((!content.trim() && (!files || files.length === 0)) || !activeChatId || !selectedModelId) return;

    console.log('发送消息', { content, files, fileIds });
    setCurrentUserQuery(content); // 保存当前查询用于相关推荐

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    const currentChatBeforeAdd = chats.find(chat => chat.id === activeChatId);
    const isFirstMessage = currentChatBeforeAdd &&
      currentChatBeforeAdd.messages.filter(msg => msg.role === 'user').length === 0 &&
      currentChatBeforeAdd.title === '新对话';

    const messageId = uuidv4();

    const fileInfo = files && files.length > 0 ? [{
      name: files[0].name,
      size: files[0].size,
      type: files[0].type,
      previewUrl: files[0].preview,
      fileId: (files[0] as any).fileId
    }] : undefined;

    // 添加用户消息
    dispatch(addMessage({
      chatId: activeChatId,
      message: {
        role: 'user',
        content: content.trim(),
        status: 'pending',
        fileInfo: fileInfo
      }
    }));

    // 检查是否启用向量搜索和上下文增强
    const { searchEnabled, contextEnhancementEnabled } = store.getState().search;

    // 如果启用了向量搜索和上下文增强，获取相关上下文
    if (searchEnabled && contextEnhancementEnabled) {
      dispatch(fetchEnhancedContext({ query: content, conversationId: activeChatId }));
    }

    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    setTimeout(() => {
      dispatch(startStreaming(activeChatId));
      if (useReasoning) {
        dispatch(startStreamingReasoning());
      }
    }, 1000);

    try {
      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: content.trim(),
        conversation_id: activeChatId,
        stream: true,
        options: {
          use_reasoning: useReasoning,
          use_enhancement: searchEnabled && contextEnhancementEnabled
        },
        file_ids: fileIds || []
      },
        (content, done, conversationId, reasoning) => {
          if (!done) {
            // 更新流式内容
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content
            }));

            if (useReasoning && reasoning) {
              dispatch(updateStreamingReasoningContent(reasoning));
            }
          } else {
            // 流式响应结束
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content: content
            }));

            // 结束流式输出
            setTimeout(() => {
              // 如果有推理内容，保存推理内容
              if (reasoning && reasoning.trim()) {
                // 确保将推理内容保存到消息中
                const streamingMessageId = store.getState().chat.streamingMessageId;
                if (streamingMessageId) {
                  console.log('更新消息推理内容:', streamingMessageId, reasoning);
                  dispatch(updateMessageReasoning({
                    chatId: activeChatId,
                    messageId: streamingMessageId,
                    reasoning: reasoning,
                    isVisible: true
                  }));
                }
                dispatch(endStreamingReasoning());
              }
              
              dispatch(endStreaming());
            }, 100);
          }

          if (done) {
            dispatch(setMessageStatus({
              chatId: activeChatId,
              messageId,
              status: null
            }));
          }

          // 在消息流结束(done=true)且是第一条消息时生成标题
          if (done && isFirstMessage) {
            console.log('流处理完成，开始生成标题');
            // 延迟一小段时间确保服务器已处理完毕
            setTimeout(async () => {
              try {
                const generatedTitle = await generateChatTitle(
                  activeChatId || conversationId || '', // 使用可能从服务器返回的新conversationId
                  undefined, // 不传具体消息，让后端从对话ID获取完整消息链
                  { max_length: 20 }
                );

                dispatch(updateChatTitle({
                  chatId: activeChatId || conversationId || '',
                  title: generatedTitle
                }));
              } catch (error) {
                console.error('生成标题失败:', error);
              }
            }, 1000); // 延迟1秒确保服务器已处理
          }

        });
    } catch (error) {
      console.error('获取 AI 回复失败:', error);
      // 设置消息发送失败状态
      dispatch(setMessageStatus({
        chatId: activeChatId,
        messageId: messageId,
        status: 'failed'
      }));

      dispatch(setError('获取 AI 回复失败，请重试'));

      // 错误情况下，添加一条错误消息
      if (activeChatId) {
        // 查找之前创建的流式消息ID
        const state = store.getState();
        const chat = state.chat.chats.find(c => c.id === activeChatId);
        const streamingMessageId = state.chat.streamingMessageId;

        if (chat && streamingMessageId) {
          // 更新现有的流式消息为错误消息
          dispatch(updateStreamingContent({
            chatId: activeChatId,
            content: '抱歉，发生了错误，无法获取回复。请检查您的网络连接或稍后重试。'
          }));
        } else {
          // 添加新的错误消息
          dispatch(addMessage({
            chatId: activeChatId,
            message: {
              role: 'assistant',
              content: '抱歉，发生了错误，无法获取回复。请检查您的网络连接或稍后重试。'
            }
          }));
        }
      }

      // 结束流式输出
      dispatch(endStreamingReasoning());
      dispatch(endStreaming());
    }
  };

  // 重试发送消息
  const handleRetryMessage = async (messageId: string) => {
    if (!activeChatId || !selectedModelId) return;

    // 查找需要重试的消息
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const message = chat.messages.find(m => m.id === messageId);
    if (!message) return;

    // 对于AI消息的重新生成，我们需要找到前一条用户消息
    if (message.role === 'assistant') {
      // 找到前面的用户消息
      const messageIndex = chat.messages.findIndex(m => m.id === messageId);
      if (messageIndex <= 0) return; // 如果是第一条消息或找不到索引，直接返回

      // 假设用户消息在AI消息之前
      let userMessageIndex = messageIndex - 1;
      // 寻找最近的用户消息
      while (userMessageIndex >= 0 && chat.messages[userMessageIndex].role !== 'user') {
        userMessageIndex--;
      }

      if (userMessageIndex >= 0) {
        const userMessage = chat.messages[userMessageIndex];

        // 删除当前的AI回复
        dispatch(deleteMessage({
          chatId: activeChatId,
          messageId: message.id
        }));

        const selectedModel = models.find(m => m.id === selectedModelId);
        if (!selectedModel) {
          dispatch(setError('找不到选中的模型信息'));
          return;
        }

        // 检查推理功能
        const { reasoningEnabled } = store.getState().chat;
        const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
        const useReasoning = reasoningEnabled && supportsReasoning;

        // 使用用户消息内容重新生成
        dispatch(startStreaming(activeChatId));
        if (useReasoning) {
          dispatch(startStreamingReasoning())
        }

        try {
          await sendMessageStream({
            provider: selectedModel.provider,
            model: selectedModel.id,
            message: userMessage.content.trim(),
            conversation_id: activeChatId,
            stream: true,
            options: {
              use_reasoning: useReasoning,
              use_enhancement: store.getState().search.contextEnhancementEnabled
            }
          },
            (content, done, conversationId, reasoning) => {
              if (!done) {
                dispatch(updateStreamingContent({
                  chatId: activeChatId,
                  content
                }));

                if (reasoning) {
                  dispatch(updateStreamingReasoningContent(reasoning))
                }
              } else {
                dispatch(updateStreamingContent({
                  chatId: activeChatId,
                  content: content
                }));

                setTimeout(() => {
                  if (reasoning && reasoning.trim()) {
                    const streamingMessageId = store.getState().chat.streamingMessageId;
                    if (streamingMessageId) {
                      dispatch(updateMessageReasoning({
                        chatId: activeChatId,
                        messageId: streamingMessageId,
                        reasoning: reasoning,
                        isVisible: true
                      }));
                    }
                    dispatch(endStreamingReasoning());
                  }
                  dispatch(endStreaming());
                }, 100);
              }
            });
        } catch (error) {
          console.error('重新生成回复失败:', error);
          dispatch(setError('重新生成失败，请检查网络连接'));
          dispatch(endStreamingReasoning())
          dispatch(endStreaming());
        }
      }
      return;
    }
  };

  // 编辑消息
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeChatId || !selectedModelId) return;

    // 更新消息内容
    dispatch(editMessage({
      chatId: activeChatId,
      messageId,
      content: newContent
    }));

    // 找到消息在数组中的位置
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (messageIndex < 0) return;

    // 如果后面有AI回复，需要删除
    if (messageIndex < chat.messages.length - 1 &&
      chat.messages[messageIndex + 1].role === 'assistant') {
      const nextMessage = chat.messages[messageIndex + 1];
      dispatch(deleteMessage({
        chatId: activeChatId,
        messageId: nextMessage.id
      }));
    }

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    // 设置消息状态为发送中
    dispatch(setMessageStatus({
      chatId: activeChatId,
      messageId,
      status: 'pending'
    }));

    // 检查推理功能
    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    // 开始流式输出
    dispatch(startStreaming(activeChatId));
    if (useReasoning) {
      dispatch(startStreamingReasoning());
    }

    // 重新发送编辑后的消息
    try {

      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: newContent.trim(),
        conversation_id: activeChatId,
        stream: true,
        options: {
          use_reasoning: useReasoning,
          use_enhancement: store.getState().search.contextEnhancementEnabled
        }
      },
        (content, done, conversationId, reasoning) => {
          // 处理流式回复...
          if (!done) {
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content
            }));

            if (reasoning) {
              dispatch(updateStreamingReasoningContent(reasoning));
            }
          } else {
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content: content
            }));

            // 编辑发送成功，清除消息状态
            dispatch(setMessageStatus({
              chatId: activeChatId,
              messageId,
              status: null
            }));

            setTimeout(() => {
              if (reasoning && reasoning.trim()) {
                const streamingMessageId = store.getState().chat.streamingMessageId;
                if (streamingMessageId) {
                  dispatch(updateMessageReasoning({
                    chatId: activeChatId,
                    messageId: streamingMessageId,
                    reasoning: reasoning,
                    isVisible: true
                  }));
                }
                dispatch(endStreamingReasoning());
              }
              dispatch(endStreaming());
            }, 100);
          }
        });
    } catch (error) {
      console.error('发送编辑后的消息失败:', error);

      // 标记消息发送失败
      dispatch(setMessageStatus({
        chatId: activeChatId,
        messageId,
        status: 'failed'
      }));

      dispatch(setError('发送编辑后的消息失败，请重试'));
      dispatch(endStreamingReasoning())
      dispatch(endStreaming());
    }
  };

  const handleClearChat = () => {
    if (!activeChatId) return;

    if (window.confirm('确定要清空当前聊天内容吗？此操作不可恢复。')) {
      dispatch(clearMessages(activeChatId));
    }
  };

  return (
    <MainLayout
      sidebar={
        <ChatSidebar
          onNewChat={handleNewChat}
        />
      }
    >
      {isSyncing ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-2"></div>
            <p className="text-muted-foreground">同步数据中...</p>
          </div>
        </div>
      ) : showWelcome ? (
        <HomePage />
      ) : (
        activeChat ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-xl font-bold">{activeChat.title}</h2>
                <p className="text-sm text-muted-foreground">
                  使用模型: {models.find(m => m.id === activeChat.modelId)?.name || '未知模型'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-64">
                  <ModelSelector
                    onChange={(modelId) => {
                      console.log(`切换到模型: ${modelId}`);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto pb-4">
                <ChatMessageList
                  messages={activeChat.messages}
                  loading={loading}
                  isStreaming={isStreaming}
                  onRetry={handleRetryMessage}
                  onEdit={handleEditMessage}
                />
              </div>

              {/* 添加右侧边栏 */}
              {currentUserQuery && (
                <div className="w-80 border-l p-4 overflow-y-auto hidden lg:block">
                  <div className="space-y-4">
                    <RelatedDiscussions
                      currentQuery={currentUserQuery}
                      chatId={activeChatId || undefined}
                    />
                    <ContextEnhancementControl
                      currentQuery={currentUserQuery}
                      chatId={activeChatId || undefined}
                    />
                  </div>
                </div>
              )}
            </div>
            <div ref={chatInputRef}>
              <ChatInput
                key={`chat-input-${inputKey}`}
                onSendMessage={handleSendMessage}
                onClearMessage={activeChat ? handleClearChat : undefined}
                disabled={!activeChatId || loading || isStreaming}
                placeholder={activeChatId ? '输入您的问题...' : '请先选择或创建一个聊天'}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold">欢迎使用 AI 助手</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                开始一个新的对话，探索 AI 的无限可能。选择不同的模型，体验各种智能对话。
              </p>
              <Button onClick={handleNewChat} className="mt-2">
                <PlusIcon className="mr-2 h-4 w-4" />
                开始新对话
              </Button>
            </div>
          </div>
        )
      )}
      {chats.length > 0 && (
        <div className="absolute bottom-4 right-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-md shadow-sm">
          {isSyncing ? '同步中...' : '数据已同步'}
        </div>
      )}
    </MainLayout>
  );
}