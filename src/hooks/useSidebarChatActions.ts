import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  updateChatFromServer,
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

    const currentChats = store.getState().chat.chats;
    const selectedChat = currentChats.find((c) => c.id === chatId);

    // 如果是空对话，直接跳转到新对话准备状态，避免"上蹿下跳"
    if (selectedChat && selectedChat.messages.length === 0) {
      dispatch(setActiveChat(chatId));
      router.push(`/?new=true&model=${selectedChat.model}`);
      return;
    }

    // 跳转到聊天页面（类似ChatGPT的行为）
    router.push(`/chat/${chatId}`);

    dispatch(setActiveChat(chatId));

    try {
      dispatch(setLoadingServerChat(true));
      const serverChatData = await getConversation(chatId);

      // 处理服务端消息：合并同一个turn_id的 reasoning_content 和 assistant_content
      const processedMessages = [];
      const messageMap = new Map();
      
      // 第一步：按turn_id分组消息
      for (const msg of serverChatData.messages) {
        const turnId = msg.turn_id || msg.id;
        if (!messageMap.has(turnId)) {
          messageMap.set(turnId, []);
        }
        messageMap.get(turnId).push(msg);
      }
      
      // 第二步：合并每个turn中的消息，只保留用户可见的问答内容
      for (const [turnId, turnMessages] of messageMap) {
        if (turnMessages.length === 1) {
          // 单条消息直接添加
          const msg = turnMessages[0];
          processedMessages.push({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: parseTimestamp(msg.created_at),
            turnId: turnId,
          });
        } else {
          // 多条消息需要合并
          const userMsg = turnMessages.find((m: any) => m.role === 'user');
          const reasoningMsg = turnMessages.find((m: any) => m.type === 'reasoning_content');
          const assistantMsg = turnMessages.find((m: any) => m.type === 'assistant_content');
          
          // 添加用户消息
          if (userMsg) {
            processedMessages.push({
              id: userMsg.id,
              role: userMsg.role,
              content: userMsg.content,
              timestamp: parseTimestamp(userMsg.created_at),
              turnId: turnId,
            });
          }
          
          if (assistantMsg) {
            processedMessages.push({
              id: assistantMsg.id,
              role: 'assistant',
              content: assistantMsg.content,
              reasoning: reasoningMsg ? reasoningMsg.content : undefined,
              duration: reasoningMsg ? reasoningMsg.duration : undefined,
              isReasoningVisible: false, // 默认隐藏思考过程
              timestamp: parseTimestamp(assistantMsg.created_at),
              turnId: turnId,
            });
          }
        }
      }
      
      // 按时间戳排序
      processedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      const localChat: Chat = {
        id: serverChatData.id,
        title: serverChatData.title,
        messages: processedMessages as Message[],
        model: serverChatData.model,
        provider: serverChatData.provider,
        createdAt: parseTimestamp(serverChatData.created_at),
        updatedAt: parseTimestamp(serverChatData.updated_at),
      };

      // 使用新的updateChatFromServer action，只更新特定对话，不影响其他本地对话
      dispatch(updateChatFromServer(localChat));

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
