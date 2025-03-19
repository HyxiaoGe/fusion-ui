'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { generateChatTitle } from '@/lib/api/title';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { deleteChat, setActiveChat, updateChatTitle } from '@/redux/slices/chatSlice';
import { Dialog, DialogContent, DialogTitle } from '@radix-ui/react-dialog';
import {
  MessageSquareIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { DialogFooter, DialogHeader } from '../ui/dialog';

interface ChatSidebarProps {
  onNewChat: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat }) => {
  const dispatch = useAppDispatch();
  const { chats, activeChatId } = useAppSelector((state) => state.chat);
  const { models } = useAppSelector((state) => state.models);

  // 添加编辑状态管理
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // 添加状态管理重命名对话框
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // 开始编辑
  const handleStartEditing = (e: React.MouseEvent, chatId: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingChatId(chatId);
    setEditingTitle(currentTitle);
    // 使用setTimeout确保DOM更新后再聚焦
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 50);
  };

  // 保存编辑
  const handleSaveEdit = (chatId: string) => {
    if (editingTitle.trim()) {
      dispatch(updateChatTitle({
        chatId: chatId,
        title: editingTitle.trim()
      }));
    }
    setEditingChatId(null);
  };

  // 处理按键事件
  const handleKeyDown = (e: React.KeyboardEvent, chatId: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(chatId);
    } else if (e.key === 'Escape') {
      setEditingChatId(null);
    }
  };

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

  const handleGenerateTitle = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const chat = chats.find(chat => chat.id === chatId);
    if (!chat || chat.messages.length === 0) {
      alert('对话内容为空，无法生成标题');
      return;
    }
  
    try {
      // 显示加载状态
      dispatch(updateChatTitle({
        chatId: chatId,
        title: '正在生成标题...'
      }));
      
      // 使用新的API生成标题
      // 首先获取该聊天正在使用的模型ID
      const modelId = chat.modelId;
      
      // 调用API生成标题
      const generatedTitle = await generateChatTitle(
        modelId,          // 模型ID
        chatId,           // 对话ID
        undefined,        // 不传具体消息，让后端从对话ID获取完整消息
        { max_length: 20 } // 可选参数，限制标题长度
      );
      
      // 更新对话标题
      dispatch(updateChatTitle({
        chatId: chatId,
        title: generatedTitle
      }));
      
    } catch (error) {
      console.error('生成标题失败:', error);
      // 恢复原标题
      dispatch(updateChatTitle({
        chatId: chatId,
        title: chat.title
      }));
      alert('生成标题失败，请重试');
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
              const isEditing = editingChatId === chat.id;
              
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
                      {isEditing ? (
                          <input
                            ref={editInputRef}
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleSaveEdit(chat.id)}
                            onKeyDown={(e) => handleKeyDown(e, chat.id)}
                            className="w-full bg-background border rounded px-2 py-1 text-sm"
                            autoFocus
                          />
                        ) : (
                          <div 
                            className="font-medium truncate text-sm"
                            onDoubleClick={(e) => handleStartEditing(e, chat.id, chat.title)}
                          >
                            {chat.title}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>{model?.name || '未知模型'}</span>
                          <span>•</span>
                          <span>{formatDate(chat.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {!isEditing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVerticalIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => handleStartEditing(e, chat.id, chat.title)}>
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
                    )}
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