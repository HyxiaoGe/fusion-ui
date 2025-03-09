'use client';

import React, { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  PlusIcon, 
  TrashIcon, 
  MoreVerticalIcon, 
  MessageSquareIcon,
  PencilIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { setActiveChat, deleteChat, updateChatTitle } from '@/redux/slices/chatSlice';
import { Dialog, DialogContent, DialogTitle } from '@radix-ui/react-dialog';
import { DialogFooter } from '../ui/dialog';
import { DialogHeader } from '../ui/dialog';

interface ChatSidebarProps {
  onNewChat: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat }) => {
  const dispatch = useAppDispatch();
  const { chats, activeChatId } = useAppSelector((state) => state.chat);
  const { models } = useAppSelector((state) => state.models);

  // 添加状态管理重命名对话框
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  // 选择对话
  const handleSelectChat = (chatId: string) => {
    dispatch(setActiveChat(chatId));
  };

  // 删除对话
  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (window.confirm('确定要删除此对话吗？此操作不可恢复。')) {
      dispatch(deleteChat(chatId));
    }
  };

  // 打开重命名对话框
  const handleOpenRenameDialog = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const chat = chats.find(chat => chat.id === chatId);
    if (chat) {
      setChatToRename(chatId);
      setNewTitle(chat.title);
      setIsRenameDialogOpen(true);
    }
  };

  // 提交重命名操作
  const handleRename = () => {
    if (chatToRename && newTitle.trim()) {
      dispatch(updateChatTitle({
        chatId: chatToRename,
        title: newTitle.trim()
      }));
      setIsRenameDialogOpen(false);
      setChatToRename(null);
      setNewTitle('');
    }
  };

  // 处理AI生成标题
  const handleGenerateTitle = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const chat = chats.find(chat => chat.id === chatId);
    if (!chat || chat.messages.length === 0) {
      alert('对话内容为空，无法生成标题');
      return;
    }

    // TODO: 这里将来会调用后端API
    // 目前先用一个简单的模拟实现
    try {
      // 模拟后端请求
      console.log('正在为对话生成标题:', chatId);
      
      // 模拟加载过程
      const generatingTitle = '正在生成标题...';
      dispatch(updateChatTitle({
        chatId: chatId,
        title: generatingTitle
      }));
      
      // 这里将来会替换为实际的API调用
      setTimeout(() => {
        // 简单生成一个标题作为示例
        const firstUserMessage = chat.messages.find(msg => msg.role === 'user')?.content || '';
        let generatedTitle = firstUserMessage.slice(0, 15);
        if (firstUserMessage.length > 15) generatedTitle += '...';
        
        if (!generatedTitle) generatedTitle = '新对话';
        
        dispatch(updateChatTitle({
          chatId: chatId,
          title: generatedTitle
        }));
      }, 1000);
      
    } catch (error) {
      console.error('生成标题失败:', error);
      alert('生成标题失败，请重试');
    }
  };

  return (
    <div className="flex flex-col h-full py-2">
      <div className="px-4 mb-4">
        <Button 
          className="w-full flex items-center gap-2" 
          onClick={onNewChat}
        >
          <PlusIcon size={16} />
          <span>新对话</span>
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2">
        {chats.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            暂无聊天记录
          </div>
        ) : (
          <ul className="space-y-1">
            {chats.map((chat) => {
              const model = models.find(m => m.id === chat.modelId);
              
              return (
                <li key={chat.id}>
                  <div
                    className={`flex items-center justify-between py-2 px-3 rounded-md cursor-pointer hover:bg-accent/50 ${
                      activeChatId === chat.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => handleSelectChat(chat.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MessageSquareIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="font-medium truncate text-sm">{chat.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>{model?.name || '未知模型'}</span>
                          <span>•</span>
                          <span>{formatDate(chat.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVerticalIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleOpenRenameDialog(e, chat.id)}>
                          <PencilIcon className="h-4 w-4 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleGenerateTitle(e, chat.id)}>
                          <RefreshCwIcon className="h-4 w-4 mr-2" />
                          生成标题
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={(e) => handleDeleteChat(e, chat.id)}>
                          <TrashIcon className="h-4 w-4 mr-2" />
                          删除对话
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      
      {/* 重命名对话框 */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名对话</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="输入新标题"
              className="w-full"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRename} disabled={!newTitle.trim()}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatSidebar;