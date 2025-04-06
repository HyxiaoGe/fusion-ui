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
  const [ignoreNextBlur, setIgnoreNextBlur] = useState(false);

  // 添加状态管理重命名对话框
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // 开始编辑 - 改用对话框
  const handleStartEditing = (
    e: React.MouseEvent,
    chatId: string,
    currentTitle: string
  ) => {
    e.stopPropagation();
    setChatToRename(chatId);
    setNewTitle(currentTitle);
    setIsRenameDialogOpen(true);
  };

  // 保存编辑
  const handleSaveEdit = (chatId: string) => {
    if (ignoreNextBlur) {
      return;
    }
    
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

      {/* 最近对话列表 */}
      <div className="px-4 flex-1 overflow-y-auto">
        <p className="text-sm font-medium text-muted-foreground tracking-wider mb-3 px-2">最近对话</p>
        {chats.length === 0 ? (
          <div className="text-sm text-muted-foreground mt-4 text-center">
            暂无对话记录
          </div>
        ) : (
          <div className="space-y-2">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`flex items-center group rounded-lg p-3 text-sm cursor-pointer transition-all duration-200 ${
                  chat.id === activeChatId
                    ? "bg-primary/15 dark:bg-primary/20 shadow-lg border border-primary/20 dark:border-primary/30 pl-4 relative z-10"
                    : "hover:bg-muted/50 hover:shadow-sm"
                }`}
                onClick={() => handleSelectChat(chat.id)}
              >
                <div className="flex-1 min-w-0 relative">
                  {editingChatId === chat.id ? (
                    <Input
                      ref={editInputRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveEdit(chat.id)}
                      onKeyDown={(e) => handleKeyDown(e, chat.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIgnoreNextBlur(false);
                      }}
                      className="h-6 py-1 text-xs"
                    />
                  ) : (
                    <div className="flex items-start gap-2">
                      <MessageSquareIcon size={16} className={`shrink-0 mt-0.5 ${chat.id === activeChatId ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="truncate flex-1 pr-1">
                        <div className={`font-medium truncate ${chat.id === activeChatId ? "text-primary font-semibold" : ""}`} title={chat.title}>
                          {chat.title || "新对话"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {/* 显示最近更新时间 */}
                          {formatDate(chat.updatedAt || chat.createdAt)}
                          
                          {/* 显示使用的模型 */}
                          {chat.modelId && models.find(m => m.id === chat.modelId) && (
                            <span className="ml-1">
                              · {models.find(m => m.id === chat.modelId)?.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className={`ml-2 ${
                    chat.id === activeChatId ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  } transition-opacity duration-200`}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="更多操作"
                      >
                        <MoreVerticalIcon size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditing(e, chat.id, chat.title);
                      }}>
                        <PencilIcon size={14} className="mr-2" />
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(e, chat.id);
                      }}>
                        <TrashIcon size={14} className="mr-2" />
                        删除对话
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateTitle(e, chat.id);
                      }}>
                        <RefreshCwIcon size={14} className="mr-2" />
                        生成标题
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 确认删除对话框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>确认删除对话</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            您确定要删除此对话吗？此操作无法撤销。
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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
            <Button
              variant="ghost"
              onClick={() => setIsRenameDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleRename}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatSidebar;
