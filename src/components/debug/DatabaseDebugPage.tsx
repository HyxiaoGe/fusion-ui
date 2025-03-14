'use client';

import ChatMessage from '@/components/chat/ChatMessage';
import MainLayout from '@/components/layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import db, { chatStore, settingsStore } from '@/lib/db/chatStore';
import { importDataFromFile } from '@/lib/db/importData';
import initializeStoreFromDB from '@/lib/db/initializeStore';
import { useAppDispatch } from '@/redux/hooks';
import { Message, setActiveChat, setAllChats } from '@/redux/slices/chatSlice';
import { store } from '@/redux/store';
import { Eye } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

export default function DatabaseDebugPage() {
  const dispatch = useAppDispatch();
  const [chats, setChats] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewChatId, setPreviewChatId] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<Message[]>([]);
  const [previewTitle, setPreviewTitle] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 打开消息预览对话框
  const handlePreviewChat = async (chatId: string, title: string) => {
    try {
      setIsLoading(true);
      const chat = await chatStore.getChatById(chatId);
      if (chat) {
        setPreviewMessages(chat.messages);
        setPreviewTitle(title);
        setPreviewChatId(chatId);
        setIsPreviewOpen(true);
      } else {
        setMessage({ text: '无法加载聊天记录', type: 'error' });
      }
    } catch (error) {
      console.error('加载预览消息失败:', error);
      setMessage({ text: '加载预览消息失败: ' + (error as Error).message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // 加载数据
  const loadData = async () => {
    setIsLoading(true);
    try {
      const loadedChats = await chatStore.getAllChats();
      setChats(loadedChats);

      const loadedSettings = await settingsStore.getAllSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('加载数据失败:', error);
      setMessage({ text: '加载数据失败: ' + (error as Error).message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // 清空数据库
  const handleClearDatabase = async () => {
    if (window.confirm('确定要清空数据库吗？此操作不可恢复！')) {
      setIsLoading(true);
      try {
        // 在清空数据库前，先获取当前选中的模型ID
        const currentState = store.getState();
        const selectedModelId = currentState.models.selectedModelId;
        
        // 清空聊天数据库
        await db.transaction('rw', [db.chats, db.messages], async () => {
          await db.chats.clear();
          await db.messages.clear();
        });
        
        // 只保留模型选择相关的设置
        await db.transaction('rw', [db.settings], async () => {
          // 获取当前所有设置
          const allSettings = await db.settings.toArray();
          // 先清空设置表
          await db.settings.clear();
          
          // 仅保留模型相关设置
          for (const setting of allSettings) {
            if (setting.id.startsWith('modelConfig_') || setting.id === 'selectedModelId') {
              await db.settings.put(setting);
            }
          }
          
          // 确保selectedModelId设置存在
          if (selectedModelId) {
            await db.settings.put({ 
              id: 'selectedModelId', 
              value: selectedModelId 
            });
          }
        });
        
        // 重置Redux状态，但保留模型选择
        dispatch(setAllChats([]));
        dispatch(setActiveChat(null));
        // 确保不重置模型选择
        // 不要调用 dispatch(setSelectedModel(null));
        
        setMessage({ text: '数据库已清空，保留了模型设置', type: 'success' });
        
        // 延迟后重定向
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
        
      } catch (error) {
        console.error('清空数据库失败:', error);
        setMessage({ text: '清空数据库失败: ' + (error as Error).message, type: 'error' });
      } finally {
        setIsLoading(false);
      }
    }
  };

  // 重新加载数据到Redux
  const handleReloadToRedux = async () => {
    try {
      await initializeStoreFromDB(dispatch);
      setMessage({ text: '数据已重新加载到Redux', type: 'success' });
    } catch (error) {
      console.error('重新加载数据失败:', error);
      setMessage({ text: '重新加载数据失败: ' + (error as Error).message, type: 'error' });
    }
  };

  // 导出数据库
  const handleExportDatabase = async () => {
    try {
      const exportData = {
        chats,
        settings
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setMessage({ text: '数据导出成功', type: 'success' });
    } catch (error) {
      console.error('导出数据失败:', error);
      setMessage({ text: '导出数据失败: ' + (error as Error).message, type: 'error' });
    }
  };

  // 导入数据
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type !== 'application/json') {
      setMessage({ text: '请选择JSON格式的备份文件', type: 'error' });
      return;
    }

    try {
      setIsLoading(true);
      const result = await importDataFromFile(file, dispatch);
      setMessage({ text: result, type: 'success' });
      await loadData(); // 重新加载数据
    } catch (error) {
      setMessage({ text: (error as Error).message, type: 'error' });
    } finally {
      setIsLoading(false);
      // 重置文件输入，以便可以重新选择同一个文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 首次加载时获取数据
  useEffect(() => {
    loadData();
  }, []);

  return (
    <MainLayout>
      <div className="container py-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">数据库管理</h1>

        {message && (
          <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>数据库操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button onClick={loadData} disabled={isLoading}>
                  刷新数据
                </Button>
                <Button onClick={handleReloadToRedux} disabled={isLoading}>
                  重新加载到Redux
                </Button>
                <Button onClick={handleExportDatabase} disabled={isLoading}>
                  导出数据
                </Button>
                <Button onClick={handleImportClick} disabled={isLoading}>
                  导入数据
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="application/json"
                  className="hidden"
                />
                <Button variant="destructive" onClick={handleClearDatabase} disabled={isLoading}>
                  清空数据库
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>聊天数据 ({chats.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p>加载中...</p>
              ) : chats.length > 0 ? (
                <div className="space-y-4">
                  {chats.map((chat) => (
                    <div key={chat.id} className="border p-3 rounded">
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium">{chat.title}</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8" 
                          onClick={() => handlePreviewChat(chat.id, chat.title)}
                          title="预览消息"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">ID: {chat.id}</p>
                      <p className="text-sm text-muted-foreground">模型: {chat.modelId}</p>
                      <p className="text-sm text-muted-foreground">
                        创建时间: {new Date(chat.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        消息数量: {chat.messages.length}
                      </p>
                    </div>
                  ))}

                  {/* 添加预览对话框 */}
                  <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                    <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                      <DialogHeader>
                        <DialogTitle>{previewTitle}</DialogTitle>
                      </DialogHeader>
                      <div className="overflow-y-auto flex-1 p-2">
                        {previewMessages.length > 0 ? (
                          previewMessages.map((message) => (
                            <ChatMessage 
                              key={message.id} 
                              message={message} 
                            />
                          ))
                        ) : (
                          <div className="text-center py-4 text-muted-foreground">
                            没有消息记录
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : (
                <p>没有聊天数据</p>
              )}
            </CardContent>
          </Card>

          {/* <Collapsible
            open={showAdvancedData}
            onOpenChange={setShowAdvancedData}
            className="w-full"
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 border rounded-md hover:bg-accent/10">
              <div className="flex items-center gap-2">
                {showAdvancedData ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium">高级设置数据</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {showAdvancedData ? "点击隐藏" : "仅限开发者使用"}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card>
                <CardHeader>
                  <CardTitle>设置数据</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(settings).map(([key, value]) => (
                    <div key={key} className="border p-3 rounded">
                      <h3 className="font-medium">{key}</h3>
                      <pre className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible> */}
        </div>
      </div>
    </MainLayout>
  );
}