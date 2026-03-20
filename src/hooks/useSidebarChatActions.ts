import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { useToast } from '@/components/ui/toast';
import { getConversation, deleteConversation } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import {
  Chat,
  deleteChat,
  updateChatTitle,
  setAnimatingTitleChatId,
  setServerChatList,
  updateServerChatTitle,
  Message
} from '@/redux/slices/chatSlice';
import { store } from '@/redux/store';

interface UseSidebarChatActionsProps {
  localChats: Chat[];
  chats: Chat[];
  useServerData: boolean;
  serverPagination: any | null;
}

export const useSidebarChatActions = ({
  localChats,
  chats,
  useServerData,
  serverPagination,
}: UseSidebarChatActionsProps) => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();
  const { activeChatId } = useAppSelector((state) => state.chat);
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const parseTimestamp = (ts: any): number => {
    if (typeof ts === 'number') return ts;
    if (typeof ts !== 'string' || !ts) return 0;
    
    if (ts.endsWith('Z') || /[\+\-]\d{2}:\d{2}$/.test(ts)) {
        const date = new Date(ts);
        return isNaN(date.getTime()) ? 0 : date.getTime();
    }

    const date = new Date(ts.replace(' ', 'T') + 'Z');
    return isNaN(date.getTime()) ? 0 : date.getTime();
  };

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

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

  const handleSelectChat = async (chatId: string) => {
    if (chatId === activeChatId) return;

    router.push(`/chat/${chatId}`);
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setChatToDelete(chatId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!chatToDelete) return;

    try {
      if (useServerData) {
        await deleteConversation(chatToDelete);
        
        const currentServerChatList = store.getState().chat.serverChatList;
        const updatedServerChatList = currentServerChatList.filter((chat: Chat) => chat.id !== chatToDelete);
        dispatch(setServerChatList({
          chats: updatedServerChatList,
          pagination: serverPagination
        }));
      }

      dispatch(deleteChat(chatToDelete));
      
      setIsDeleteDialogOpen(false);
      setChatToDelete(null);
      
      toast({
        message: "对话已删除",
        type: "success",
      });
    } catch (error) {
      console.error('删除对话失败:', error);
      
      setIsDeleteDialogOpen(false);
      setChatToDelete(null);
      
      toast({
        message: "删除对话失败，请重试",
        type: "error",
      });
    }
  };

  const handleGenerateTitle = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();

    // 检查登录状态
    if (!isAuthenticated) {
      toast({
        message: "请先登录后再使用此功能",
        type: "warning",
        duration: 3000
      });
      if ((globalThis as any).triggerLoginDialog) {
        (globalThis as any).triggerLoginDialog();
      }
      return;
    }

    try {
      let chatToProcess = localChats.find((c) => c.id === chatId);

      if (!chatToProcess || chatToProcess.messages.length === 0) {
        const serverChatData = await getConversation(chatId);
        chatToProcess = {
            id: serverChatData.id,
            title: serverChatData.title,
            messages: serverChatData.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: parseTimestamp(msg.created_at),
            })),
            model: serverChatData.model,
            provider: serverChatData.provider,
            createdAt: parseTimestamp(serverChatData.created_at),
            updatedAt: parseTimestamp(serverChatData.updated_at),
        };
      }

      if (!chatToProcess || !chatToProcess.messages || chatToProcess.messages.length === 0) {
        toast({
          message: "对话内容为空，无法生成标题",
          type: "warning",
        });
        return;
      }
      
      const originalChatState = chats.find((c) => c.id === chatId);
      
      dispatch(updateChatTitle({ chatId, title: "正在生成标题..." }));
      dispatch(updateServerChatTitle({ chatId, title: "正在生成标题..." }));

      const generatedTitle = await generateChatTitle(chatId, undefined, { max_length: 20 });
      
      dispatch(setAnimatingTitleChatId(chatId));

      dispatch(updateChatTitle({ chatId, title: generatedTitle }));
      dispatch(updateServerChatTitle({ chatId, title: generatedTitle }));
      
      toast({ message: "标题已更新", type: "success" });
      
      setTimeout(() => {
        dispatch(setAnimatingTitleChatId(null));
      }, generatedTitle.length * 200 + 1000);

    } catch (error) {
      console.error("生成标题失败:", error);

      const originalChatState = chats.find((chat) => chat.id === chatId);
      const title = originalChatState ? originalChatState.title : "新对话";
      dispatch(updateChatTitle({ chatId, title }));
      dispatch(updateServerChatTitle({ chatId, title }));
      toast({ message: "生成标题失败，请重试", type: "error" });
    }
  };

  const handleRename = () => {
    if (chatToRename && newTitle.trim()) {
      const title = newTitle.trim();
      dispatch(updateChatTitle({ chatId: chatToRename, title }));
      dispatch(updateServerChatTitle({ chatId: chatToRename, title }));
      
      setIsRenameDialogOpen(false);
      setChatToRename(null);
      setNewTitle("");
      toast({ message: "对话已重命名", type: "success" });
    }
  };

  return {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    newTitle,
    setNewTitle,
    handleSelectChat,
    handleStartEditing,
    handleDeleteChat,
    confirmDelete,
    handleGenerateTitle,
    handleRename,
  };
}; 
