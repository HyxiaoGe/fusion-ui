'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import MainLayout from '@/components/layouts/MainLayout';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ModelSelector from '@/components/models/ModelSelector';
import ChatInput from '@/components/chat/ChatInput';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { 
  createChat, 
  addMessage, 
  setLoading,
  setError,
  setActiveChat,
  setAllChats,
  startStreaming,
  updateStreamingContent,
  endStreaming
} from '@/redux/slices/chatSlice';
import { sendMessageStream } from '@/lib/api/chat';
import { chatStore } from '@/lib/db/chatStore';
import { store } from '@/redux/store';

export default function Home() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const { chats, activeChatId, loading, isStreaming } = useAppSelector((state) => state.chat);
  const { models, selectedModelId } = useAppSelector((state) => state.models);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastDatabaseSync = useAppSelector((state) => state.app.lastDatabaseSync);

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
              
            dispatch(setActiveChat(latestChat?.id || ''));
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
  
  // 获取当前活动的对话
  const activeChat = activeChatId ? chats.find(chat => chat.id === activeChatId) : null;
  // 获取当前选中的模型
  const selectedModel = models.find(model => model.id === selectedModelId);

  // 创建新对话
  const handleNewChat = () => {
    console.log('点击新建对话按钮', { selectedModelId });
    if (selectedModelId) {
      try {
        dispatch(createChat({ modelId: selectedModelId }));
        console.log('对话创建成功');
      } catch (error) {
        console.error('创建对话失败:', error);
      }
    } else {
      console.warn('未选择模型，无法创建对话');
    }
  };

  // 发送消息
  const handleSendMessage = async (content: string) => {
    if (!activeChatId || !content.trim() || !selectedModelId) return;
    
    // 添加用户消息
    dispatch(addMessage({
      chatId: activeChatId,
      message: {
        role: 'user',
        content: content.trim()
      }
    }));
    
    // 设置加载状态
    dispatch(startStreaming(activeChatId));
    
    try {
      await sendMessageStream({
        model: selectedModelId,
        message: content.trim(),
        conversation_id: activeChatId,
        stream: true
      }, 
      (content, done, conversationId) => {
        // 如果服务器返回了不同的conversationId，需要更新它
        if (conversationId && conversationId !== activeChatId) {
          console.log(`服务器返回了新的conversationId: ${conversationId}`);
          // 你可能需要在这里处理conversationId的更新
        }
        if (!done) {
          // 更新流式内容
          dispatch(updateStreamingContent({
            chatId: activeChatId,
            content
          }));
        } else {
          // 流式响应结束
          dispatch(updateStreamingContent({
            chatId: activeChatId,
            content: content
          }));

          // 结束流式输出
          setTimeout(() => {
            dispatch(endStreaming());
          }, 100);
        }
      });
    } catch (error) {
      console.error('获取 AI 回复失败:', error);
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
      dispatch(endStreaming());
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
            <div className="w-48">
              <ModelSelector 
                onChange={(modelId) => {
                  // 可以在这里添加切换模型的逻辑
                  console.log(`切换到模型: ${modelId}`);
                }}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pb-4">
            <ChatMessageList 
              messages={activeChat.messages}
              loading={loading}
              isStreaming={isStreaming}
            />
          </div>
          
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={loading || isStreaming}
          />
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