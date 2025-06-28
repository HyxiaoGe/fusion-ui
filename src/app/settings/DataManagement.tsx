'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { chatStore, settingsStore } from '@/lib/db/chatStore';
import { importDataFromFile } from '@/lib/db/importData';
import { useAppDispatch } from '@/redux/hooks';
import { AlertCircleIcon, CheckCircleIcon, DownloadIcon, UploadIcon } from 'lucide-react';
import React, { useRef, useState } from 'react';

const DataManagement: React.FC = () => {
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 导出所有数据
  const handleExport = async () => {
    try {
      setIsLoading(true);
      setMessage(null);
      
      // 获取所有聊天记录和设置
      const chats = await chatStore.getAllChats();
      const settings = await settingsStore.getAllSettings();
      
      // 创建导出数据
      const exportData = {
        chats,
        settings
      };
      
      // 创建下载链接
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // 执行下载
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setMessage({ text: '数据导出成功！', type: 'success' });
    } catch (error) {
      console.error('导出数据失败:', error);
      setMessage({ text: '导出数据失败: ' + (error as Error).message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // 点击导入按钮
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // 处理文件选择
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
      setMessage(null);
      
      // 导入数据
      const result = await importDataFromFile(file, dispatch);
      setMessage({ text: result, type: 'success' });
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

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle>数据管理</CardTitle>
        <CardDescription>
          导出或导入您的聊天记录和设置数据
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div 
            className={`p-3 rounded flex items-center gap-2 ${
              message.type === 'success' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircleIcon className="h-5 w-5 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <div className="flex-1 border rounded-md p-4">
            <h3 className="font-medium mb-2">导出数据</h3>
            <p className="text-sm text-muted-foreground mb-4">
              将您的聊天记录和应用设置导出为JSON文件，方便备份或转移到其他设备。
            </p>
            <Button 
              onClick={handleExport} 
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              导出数据
            </Button>
          </div>

          <div className="flex-1 border rounded-md p-4">
            <h3 className="font-medium mb-2">导入数据</h3>
            <p className="text-sm text-muted-foreground mb-4">
              从之前导出的JSON文件中恢复您的聊天记录和设置。<span className="font-medium">注意：这将覆盖当前数据。</span>
            </p>
            <Button 
              onClick={handleImportClick} 
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              <UploadIcon className="h-4 w-4 mr-2" />
              导入数据
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/json"
              className="hidden"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DataManagement;