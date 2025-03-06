'use client';

import { useEffect, useState } from 'react';
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
  setError
} from '@/redux/slices/chatSlice';
import { sendMessage } from '@/lib/api/chat';

export default function Home() {
  const dispatch = useAppDispatch();
  const { chats, activeChatId, loading } = useAppSelector((state) => state.chat);
  const { models, selectedModelId } = useAppSelector((state) => state.models);
  
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
    dispatch(setLoading(true));
    
    try {
      // 调用 AI 服务获取回复
      const response = await sendMessage({
        model: selectedModelId,
        message: content.trim(),
        conversation_id: activeChatId,
        stream: false
      })
      
      // 添加 AI 回复
      dispatch(addMessage({
        chatId: activeChatId,
        message: {
          role: 'assistant',
          content: response.message.content
        }
      }));
      
      // dispatch(setError('错误信息'));
    } catch (error) {
      console.error('获取 AI 回复失败:', error);
      dispatch(setError('获取 AI 回复失败，请重试'));

      dispatch(addMessage({
        chatId: activeChatId,
        message: {
          role: 'assistant',
          content: '抱歉，发生了错误，无法获取回复。请检查您的网络连接或稍后重试。'
        }
      }))
    } finally {
      dispatch(setLoading(false));
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
      {activeChat ? (
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
            />
          </div>
          
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={loading}
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
      )}
    </MainLayout>
  );
}