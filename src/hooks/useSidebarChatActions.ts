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

    dispatch(setActiveChat(chatId));

    const currentChats = store.getState().chat.chats;
    const selectedChat = currentChats.find((c) => c.id === chatId);

    if (selectedChat && selectedChat.messages.length === 0) return;

    try {
      dispatch(setLoadingServerChat(true));
      const serverChatData = await getConversation(chatId);

      // 处理服务端消息：合并同一个turn_id的reasoning_content和assistant_content
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
      
      // 第二步：合并每个turn中的消息，并处理function_result
      let functionCallOutput = null;
      
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
          const functionCallMsg = turnMessages.find((m: any) => m.type === 'function_call');
          const functionResultMsg = turnMessages.find((m: any) => m.type === 'function_result');
          
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
          
          // 处理function_result消息并转换为functionCallOutput
          if (functionResultMsg && functionResultMsg.content) {
            try {
              const functionResult = typeof functionResultMsg.content === 'string' 
                ? JSON.parse(functionResultMsg.content) 
                : functionResultMsg.content;
              
              // 根据结果数据结构判断function type
              let functionType = 'unknown';
              let query = null;
              
              if (functionResult.results && Array.isArray(functionResult.results)) {
                functionType = 'web_search';
                query = functionResult.query;
              } else if (functionResult.topics && Array.isArray(functionResult.topics)) {
                functionType = 'hot_topics';
              }
              
              // 保存最新的functionCallOutput（一般是最后一个turn的）
              functionCallOutput = {
                type: functionType,
                query: query,
                data: functionResult,
                error: null,
                timestamp: parseTimestamp(functionResultMsg.created_at),
              };
            } catch (e) {
              console.error('解析function_result失败:', e, functionResultMsg.content);
            }
          }
          
          // 合并function_call和assistant_content为一个完整的助手消息
          if (functionCallMsg || assistantMsg) {
            let combinedContent = '';
            let messageId = '';
            let messageTimestamp = 0;
            
            // 如果有function_call，先添加其内容
            if (functionCallMsg) {
              combinedContent += functionCallMsg.content;
              messageId = functionCallMsg.id;
              messageTimestamp = parseTimestamp(functionCallMsg.created_at);
            }
            
            // 如果有assistant_content，添加其内容
            if (assistantMsg) {
              // 如果已经有function_call内容，在中间添加分隔符
              if (combinedContent) {
                combinedContent += '\n\n';
              }
              combinedContent += assistantMsg.content;
              // 使用assistant_content的ID和时间戳作为主要标识
              messageId = assistantMsg.id;
              messageTimestamp = parseTimestamp(assistantMsg.created_at);
            }
            
            processedMessages.push({
              id: messageId,
              role: 'assistant',
              content: combinedContent,
              reasoning: reasoningMsg ? reasoningMsg.content : undefined,
              duration: reasoningMsg ? reasoningMsg.duration : undefined,
              isReasoningVisible: false, // 默认隐藏思考过程
              timestamp: messageTimestamp,
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
        functionCallOutput: functionCallOutput,
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