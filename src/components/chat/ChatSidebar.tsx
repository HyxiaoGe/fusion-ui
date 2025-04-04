"use client";

import React, { useRef, useState } from "react";
import { generateChatTitle } from "@/lib/api/title";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import {
  deleteChat,
  setActiveChat,
  updateChatTitle,
} from "@/redux/slices/chatSlice";
import {
  MessageSquareIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  HomeIcon,
  SettingsIcon,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "../ui/toast";
import Link from "next/link";

interface ChatSidebarProps {
  onNewChat: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat }) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  const { chats, activeChatId } = useAppSelector((state) => state.chat);
  const { models } = useAppSelector((state) => state.models);

  // 添加对话框状态
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  // 添加编辑状态管理
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // 添加状态管理重命名对话框
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // 开始编辑
  const handleStartEditing = (
    e: React.MouseEvent,
    chatId: string,
    currentTitle: string
  ) => {
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
      dispatch(
        updateChatTitle({
          chatId: chatId,
          title: editingTitle.trim(),
        })
      );
      toast({
        message: "标题已更新",
        type: "success",
      });
    }
    setEditingChatId(null);
  };

  // 处理按键事件
  const handleKeyDown = (e: React.KeyboardEvent, chatId: string) => {
    if (e.key === "Enter") {
      handleSaveEdit(chatId);
    } else if (e.key === "Escape") {
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
    setChatToDelete(chatId);
    setIsDeleteDialogOpen(true);
  };

  // 确认删除
  const confirmDelete = () => {
    if (chatToDelete) {
      dispatch(deleteChat(chatToDelete));
      setIsDeleteDialogOpen(false);
      setChatToDelete(null);
      toast({
        message: "对话已删除",
        type: "success",
      });
    }
  };

  const handleGenerateTitle = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const chat = chats.find((chat) => chat.id === chatId);
    if (!chat || chat.messages.length === 0) {
      toast({
        message: "对话内容为空，无法生成标题",
        type: "warning",
      });
      return;
    }

    try {
      // 显示加载状态
      dispatch(
        updateChatTitle({
          chatId: chatId,
          title: "正在生成标题...",
        })
      );

      // 调用API生成标题
      const generatedTitle = await generateChatTitle(
        chatId, // 对话ID
        undefined,
        { max_length: 20 } // 可选参数，限制标题长度
      );

      // 更新对话标题
      dispatch(
        updateChatTitle({
          chatId: chatId,
          title: generatedTitle,
        })
      );
      toast({
        message: "标题已更新",
        type: "success",
      });
    } catch (error) {
      console.error("生成标题失败:", error);
      // 恢复原标题
      dispatch(
        updateChatTitle({
          chatId: chatId,
          title: chat.title,
        })
      );
      toast({
        message: "生成标题失败，请重试",
        type: "error",
      });
    }
  };

  // 提交重命名操作
  const handleRename = () => {
    if (chatToRename && newTitle.trim()) {
      dispatch(
        updateChatTitle({
          chatId: chatToRename,
          title: newTitle.trim(),
        })
      );
      setIsRenameDialogOpen(false);
      setChatToRename(null);
      setNewTitle("");
      toast({
        message: "对话已重命名",
        type: "success",
      });
    }
  };

  return (
    <div className="flex flex-col h-full py-2">
      <div className="px-4 mb-5">
        <Button className="w-full flex items-center gap-2" onClick={onNewChat}>
          <PlusIcon size={16} />
          <span>新对话</span>
        </Button>
      </div>

      {/* 主要导航分组 */}
      <div className="px-3 mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">主要导航</p>
        <Link href="/">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors">
            <HomeIcon size={16} className="text-muted-foreground" />
            <span className="text-sm">首页</span>
          </div>
        </Link>
      </div>

      {/* AI功能分组 */}
      <div className="px-3 mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">AI 功能</p>
        {/* 当前激活的功能：AI聊天 */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent/80 border-l-2 border-primary cursor-pointer transition-colors">
          <MessageSquareIcon size={16} className="text-primary" />
          <span className="text-sm font-medium text-primary">AI 聊天</span>
        </div>
        
        {/* 即将推出的功能 */}
        <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer text-muted-foreground mt-1 transition-colors">
          <div className="flex items-center gap-2">
            <MessageSquareIcon size={16} />
            <span className="text-sm">AI 图像</span>
          </div>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">即将推出</span>
        </div>

        {/* 更多即将推出的功能 */}
        <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer text-muted-foreground mt-1 transition-colors">
          <div className="flex items-center gap-2">
            <FileText size={16} />
            <span className="text-sm">文档分析</span>
          </div>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">即将推出</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer text-muted-foreground mt-1 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 flex items-center justify-center">
              <span className="text-muted-foreground">⌨️</span>
            </div>
            <span className="text-sm">代码助手</span>
          </div>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">即将推出</span>
        </div>
      </div>

      {/* 我的内容分组 */}
      <div className="px-3 mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">我的内容</p>
      </div>

      {/* 聊天记录列表 */}
      <div className="flex-1 overflow-y-auto px-2">
        {chats.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-4 px-3">
            暂无聊天记录
          </div>
        ) : (
          <ul className="space-y-1">
            {chats.map((chat) => {
              const model = models.find((m) => m.id === chat.modelId);
              const isEditing = editingChatId === chat.id;

              return (
                <li key={chat.id}>
                  <div
                    className={`flex items-center justify-between py-2 px-3 rounded-md cursor-pointer transition-all ${
                      activeChatId === chat.id 
                        ? "bg-accent border-l-2 border-primary" 
                        : "hover:bg-accent/50 border-l-2 border-transparent"
                    }`}
                    onClick={() => handleSelectChat(chat.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <MessageSquareIcon className={`h-5 w-5 shrink-0 ${
                        activeChatId === chat.id ? "text-primary" : "text-muted-foreground"
                      }`} />
                      <div className="min-w-0 flex-1">
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
                            className={`truncate text-sm ${
                              activeChatId === chat.id ? "font-medium" : ""
                            }`}
                            onDoubleClick={(e) =>
                              handleStartEditing(e, chat.id, chat.title)
                            }
                          >
                            {chat.title}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>{model?.name || "未知模型"}</span>
                          <span>•</span>
                          <span>{formatDate(chat.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-50 hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVerticalIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) =>
                            handleStartEditing(e, chat.id, chat.title)
                          }
                        >
                          <PencilIcon className="h-4 w-4 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleGenerateTitle(e, chat.id)}
                        >
                          <RefreshCwIcon className="h-4 w-4 mr-2" />
                          生成标题
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => handleDeleteChat(e, chat.id)}
                        >
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

      {/* 应用分组 */}
      <div className="px-3 mt-2 mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">应用</p>
        <Link href="/settings">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors">
            <SettingsIcon size={16} className="text-muted-foreground" />
            <span className="text-sm">设置</span>
          </div>
        </Link>
      </div>

      {/* 删除对话确认对话框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p>确定要删除这个对话吗？此操作无法撤销。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名对话</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="输入新标题..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRename}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatSidebar;
