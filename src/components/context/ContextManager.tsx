'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Message } from '@/redux/slices/chatSlice';
import { Lightbulb, Eraser } from 'lucide-react';
import React, { useState } from 'react';
import TokenCounter from './TokenCounter';

interface ContextManagerProps {
  messages: Message[];
  modelId: string;
  onClearContext: () => void;
  onSelectImportant: (selectedIds: string[]) => void;
}

const ContextManager: React.FC<ContextManagerProps> = ({
  messages,
  modelId,
  onClearContext,
  onSelectImportant,
}) => {
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('stats');
  
  // 处理消息选择
  const handleMessageSelect = (messageId: string) => {
    setSelectedMessageIds(prev => 
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  };
  
  // 保留选中消息
  const handleKeepSelected = () => {
    onSelectImportant(selectedMessageIds);
    setSelectedMessageIds([]);
  };
  
  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (selectedMessageIds.length === messages.length) {
      setSelectedMessageIds([]);
    } else {
      setSelectedMessageIds(messages.map(msg => msg.id));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">上下文管理</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="stats" className="flex-1">Token统计</TabsTrigger>
            <TabsTrigger value="manage" className="flex-1">管理上下文</TabsTrigger>
          </TabsList>
          
          <TabsContent value="stats" className="space-y-4 mt-4">
            <TokenCounter
              messages={messages.map(msg => ({
                role: msg.role,
                content: msg.content
              }))}
              modelId={modelId}
            />
            
            <div className="border-t pt-4">
              <p className="text-sm mb-4">上下文管理选项</p>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto-compress" className="font-medium">自动压缩上下文</Label>
                    <p className="text-xs text-muted-foreground">在接近限制时自动压缩历史消息</p>
                  </div>
                  <Switch id="auto-compress" />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="keep-system" className="font-medium">保留系统提示</Label>
                    <p className="text-xs text-muted-foreground">始终保留系统提示在上下文中</p>
                  </div>
                  <Switch id="keep-system" defaultChecked />
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="manage" className="space-y-4 mt-4">
            <div className="flex justify-between mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSelectAll}
              >
                {selectedMessageIds.length === messages.length ? '取消全选' : '全选'}
              </Button>
              
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleKeepSelected}
                  disabled={selectedMessageIds.length === 0}
                >
                  <Lightbulb className="h-4 w-4 mr-1" />
                  仅保留选中
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onClearContext}
                >
                  <Eraser className="h-4 w-4 mr-1" />
                  清空上下文
                </Button>
              </div>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`p-2 rounded-md flex items-center gap-2 border ${
                    selectedMessageIds.includes(message.id)
                      ? 'bg-primary/10 border-primary'
                      : 'bg-card border-border'
                  }`}
                >
                  <Switch
                    checked={selectedMessageIds.includes(message.id)}
                    onCheckedChange={() => handleMessageSelect(message.id)}
                    aria-label={`选择消息 ${index + 1}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <span className="text-xs font-medium">
                        {message.role === 'user' ? '用户' : message.role === 'assistant' ? 'AI' : '系统'}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs truncate">{message.content}</p>
                  </div>
                </div>
              ))}
              
              {messages.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  没有消息历史
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ContextManager;