import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { useToast } from '@/components/ui/toast';
import { getConversation, deleteConversation } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import {
  Chat,
  deleteChat,
  setActiveChat,
  updateChatTitle,
  setAnimatingTitleChatId,
  setServerChatList,
  updateServerChatTitle,
  setServerError,
  setLoadingServerChat,
  setAllChats,
  Pagination
} from '@/redux/slices/chatSlice';
import { store } from '@/redux/store';

interface UseSidebarChatActionsProps {
  localChats: Chat[];
  chats: Chat[];
  useServerData: boolean;
  serverPagination: Pagination | null;
}

export const useSidebarChatActions = ({
  localChats,
  chats,
  useServerData,
  serverPagination,
}: UseSidebarChatActionsProps) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { activeChatId } = useAppSelector((state) => state.chat);

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

    dispatch(setActiveChat(chatId));

    const currentChats = store.getState().chat.chats;
    const selectedChat = currentChats.find((c) => c.id === chatId);

    if (selectedChat && selectedChat.messages.length === 0) return;

    try {
      dispatch(setLoadingServerChat(true));
      const serverChatData = await getConversation(chatId);

      const localChat: Chat = {
        id: serverChatData.id,
        title: serverChatData.title,
        messages: serverChatData.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
        })),
        modelId: serverChatData.model_id,
        createdAt: new Date(String(serverChatData.created_at).replace(' ', 'T') + 'Z').getTime(),
        updatedAt: new Date(String(serverChatData.updated_at).replace(' ', 'T') + 'Z').getTime(),
        functionCallOutput: null,
      };

      const existingChatIndex = currentChats.findIndex((c) => c.id === chatId);
      if (existingChatIndex >= 0) {
        const updatedChats = [...currentChats];
        updatedChats[existingChatIndex] = localChat;
        dispatch(setAllChats(updatedChats));
      } else {
        dispatch(setAllChats([...currentChats, localChat]));
      }

      dispatch(setLoadingServerChat(false));
    } catch (error) {
      console.error('获取对话详情失败:', error);
      dispatch(setServerError('获取对话详情失败'));
      dispatch(setLoadingServerChat(false));
      toast({
        message: "加载对话失败，请重试",
        type: "error",
      });
    }
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
              timestamp: new Date(msg.created_at).getTime(),
            })),
            modelId: serverChatData.model_id,
            createdAt: new Date(String(serverChatData.created_at).replace(' ', 'T') + 'Z').getTime(),
            updatedAt: new Date(String(serverChatData.updated_at).replace(' ', 'T') + 'Z').getTime(),
            functionCallOutput: null,
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