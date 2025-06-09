"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { generateChatTitle } from "@/lib/api/title";
import { getConversations, getConversation, deleteConversation } from "@/lib/api/chat";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { store } from "@/redux/store";
import {
  Chat,
  deleteChat,
  setActiveChat,
  updateChatTitle,
  setAnimatingTitleChatId,
  setServerChatList,
  updateServerChatTitle,
  setServerError,
  clearServerError,
  appendServerChatList,
  setLoadingMoreServer,
  setLoadingServerList,
  setLoadingServerChat,
  setAllChats
} from "@/redux/slices/chatSlice";
import {
  MessageSquareIcon,
  MoreVerticalIcon,
  PencilIcon,
  RefreshCwIcon,
  TrashIcon,
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
import { cn } from "@/lib/utils";
import { useChatListRefresh } from "@/hooks/useChatListRefresh";

interface ChatSidebarProps {
  onNewChat: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat }) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { registerRefreshFunction } = useChatListRefresh();

  // 获取Redux状态
  const {
    chats: localChats,
    serverChatList,
    serverPagination,
    isLoadingServerList,
    isLoadingMoreServer,
    serverError,
    activeChatId
  } = useAppSelector((state) => state.chat);

  // 优先使用服务端数据，如果为空则使用本地数据
  const useServerData = serverChatList.length > 0;
  const chats: Chat[] = useServerData 
    ? serverChatList.map((chat: any) => ({
        ...chat,
        messages: [], // 列表中不包含messages
        modelId: chat.model_id,
        createdAt: new Date(chat.created_at).getTime(),
        updatedAt: new Date(chat.updated_at).getTime(),
      }))
    : localChats;

  const { models } = useAppSelector((state) => state.models);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 添加初始化标记，防止严格模式下重复调用
  const isInitializedRef = useRef(false);
  
  // 添加上次活动对话ID的引用，用于检测变化
  const lastActiveChatIdRef = useRef<string | null>(null);

  // 添加状态来检测是否有滚动条
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);

  // 检测滚动条的函数
  const checkScrollbar = useCallback(() => {
    if (containerRef.current) {
      const element = containerRef.current;
      const hasScroll = element.scrollHeight > element.clientHeight;
      setHasScrollbar(hasScroll);
      
      // 判断是否可以加载更多
      let canLoadMore = false;
      if (useServerData) {
        // 使用服务端数据时，检查服务端分页信息
        canLoadMore = Boolean(serverPagination?.has_next) && !isLoadingMoreServer;
      } else {
        // 使用本地数据时，模拟有更多数据（用于测试按钮显示）
        canLoadMore = chats.length >= 5; // 如果有5条以上数据，假设还有更多
      }
      
      const shouldShow = !hasScroll && canLoadMore;
      
      setShowLoadMoreButton(shouldShow);
    }
  }, [serverPagination?.has_next, isLoadingMoreServer, chats.length, useServerData, localChats.length]);

  // 监听容器尺寸变化和数据变化
  useEffect(() => {
    checkScrollbar();
    
    // 使用ResizeObserver监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      checkScrollbar();
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [checkScrollbar, chats.length, serverPagination]);

  // 获取会话列表
  const fetchChatList = async (page: number = 1, pageSize: number = 10) => {
    try {
      dispatch(setLoadingServerList(true));
      dispatch(clearServerError());
      
      const response = await getConversations(page, pageSize);
      
      const items = response.items || [];
      const chatList = items.map((item: any) => ({
        id: item.id,
        title: item.title || '新对话',
        model_id: item.model || item.provider || 'unknown',
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));

      const pagination = {
        current_page: response.page || page,
        page_size: response.page_size || pageSize,
        total_pages: response.total_pages || Math.ceil((response.total || 0) / pageSize),
        total_count: response.total || 0,
        has_next: response.has_next || false,
        has_prev: response.has_prev || false,
      };
      
      dispatch(setServerChatList({ chats: chatList, pagination }));
    } catch (error) {
      console.error('获取会话列表失败:', error);
      dispatch(setServerError(error instanceof Error ? error.message : '获取会话列表失败'));
    } finally {
      dispatch(setLoadingServerList(false));
    }
  };

  // 添加一个公共方法来刷新对话列表
  const refreshChatList = useCallback(() => {
    console.log('刷新对话列表');
    fetchChatList(1, 10);
  }, []);

  // 注册刷新方法到hook中
  useEffect(() => {
    registerRefreshFunction(refreshChatList);
  }, [registerRefreshFunction, refreshChatList]);

  // 加载更多会话
  const loadMoreChats = async () => {
    if (useServerData) {
      // 服务端数据的加载更多
      if (!serverPagination?.has_next || isLoadingMoreServer) {
        return;
      }

      try {
        dispatch(setLoadingMoreServer(true));
        
        const nextPage = serverPagination.current_page + 1;
        const pageSize = serverPagination.page_size;
        
        const response = await getConversations(nextPage, pageSize);
        console.log('加载更多数据:', response);
        
        const items = response.items || [];
        const chatList = items.map((item: any) => ({
          id: item.id,
          title: item.title || '新对话',
          model_id: item.model || item.provider || 'unknown',
          created_at: item.created_at,
          updated_at: item.updated_at,
        }));

        const pagination = {
          current_page: response.page || nextPage,
          page_size: response.page_size || pageSize,
          total_pages: response.total_pages || Math.ceil((response.total || 0) / pageSize),
          total_count: response.total || 0,
          has_next: response.has_next || false,
          has_prev: response.has_prev || true,
        };
        
        dispatch(appendServerChatList({ chats: chatList, pagination }));
      } catch (error) {
        console.error('加载更多会话失败:', error);
        dispatch(setServerError(error instanceof Error ? error.message : '加载更多会话失败'));
      } finally {
        dispatch(setLoadingMoreServer(false));
      }
    } else {
      // 本地数据的模拟加载更多（用于测试）
      console.log('模拟加载更多本地数据');
      toast({
        message: "这是本地数据，模拟加载更多功能",
        type: "info",
      });
    }
  };

  // 初始化时尝试获取服务端数据
  useEffect(() => {
    // 防止严格模式下重复调用
    if (isInitializedRef.current) {
      return;
    }
    
    isInitializedRef.current = true;
    fetchChatList(1, 10);
  }, []);

  // 监听activeChatId变化，如果是新的对话ID且不在当前列表中，则刷新列表
  useEffect(() => {
    if (activeChatId && activeChatId !== lastActiveChatIdRef.current) {
      lastActiveChatIdRef.current = activeChatId;
      
      // 检查当前活动的对话是否在服务端对话列表中
      if (useServerData) {
        const chatExists = serverChatList.some(chat => chat.id === activeChatId);
        if (!chatExists) {
          console.log(`对话 ${activeChatId} 不在列表中，刷新对话列表`);
          // 延迟一下再刷新，确保服务端已经创建了对话
          setTimeout(() => {
            refreshChatList();
          }, 500);
        }
      }
    }
  }, [activeChatId, useServerData, serverChatList, refreshChatList]);

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
      
      // 同时更新服务端列表中的标题
      dispatch(
        updateServerChatTitle({
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

  // 获取日期分组标签
  const getDateGroupLabel = (timestamp: number) => {
    const now = new Date();
    const date = new Date(timestamp);
    
    // 设置时间为0点，只比较日期
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const chatDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffDays = Math.floor((nowDate.getTime() - chatDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays <= 3) return "三天内";
    if (diffDays <= 7) return "一周内";
    if (diffDays <= 30) return "一个月内";
    return "更早";
  };

  // 对聊天记录进行排序和分组
  const sortedAndGroupedChats = React.useMemo(() => {
    // 按更新时间降序排序
    const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
    
    // 按日期分组
    const groups: Record<string, Chat[]> = {};
    
    sortedChats.forEach(chat => {
      const groupLabel = getDateGroupLabel(chat.updatedAt);
      if (!groups[groupLabel]) {
        groups[groupLabel] = [];
      }
      groups[groupLabel].push(chat);
    });
    
    return groups;
  }, [chats]);

  // 切换选中的对话
  const handleSelectChat = async (chatId: string) => {
    if (chatId === activeChatId) {
      // 如果点击的是当前已激活的对话，则不执行任何操作
      return;
    }

    // 立即在UI上切换，提供即时反馈
    dispatch(setActiveChat(chatId));

    // 从本地Redux store获取当前对话列表
    const currentChats = store.getState().chat.chats;
    const selectedChat = currentChats.find(c => c.id === chatId);

    // 如果是新创建的、没有消息的对话，则不需要从服务器获取
    if (selectedChat && selectedChat.messages.length === 0) {
      console.log(`对话 ${chatId} 是一个空的本地对话，跳过从服务器获取详情。`);
      return;
    }

    // 对于已有内容的对话，从服务器获取最新信息
    try {
      dispatch(setLoadingServerChat(true));
      const serverChatData = await getConversation(chatId);

      // 将从服务器获取的数据更新到本地Redux store
      const localChat = {
        id: serverChatData.id,
        title: serverChatData.title,
        messages: serverChatData.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
        })),
        modelId: serverChatData.model_id,
        createdAt: new Date(serverChatData.created_at).getTime(),
        updatedAt: new Date(serverChatData.updated_at).getTime(),
        functionCallOutput: null, // 初始化
      };

      const existingChatIndex = currentChats.findIndex(c => c.id === chatId);
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

  // 删除对话
  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setChatToDelete(chatId);
    setIsDeleteDialogOpen(true);
  };

  // 确认删除
  const confirmDelete = async () => {
    if (!chatToDelete) return;

    try {
      // 如果使用服务端数据，先调用服务端删除接口
      if (useServerData) {
        await deleteConversation(chatToDelete);
        
        // 删除成功后，从服务端会话列表中移除该项
        const updatedServerChatList = serverChatList.filter(chat => chat.id !== chatToDelete);
        dispatch(setServerChatList({ 
          chats: updatedServerChatList, 
          pagination: serverPagination 
        }));
      }

      // 删除成功后，更新本地Redux状态
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
      
      // 同时更新服务端列表中的标题
      dispatch(
        updateServerChatTitle({
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

      
      // 使用Redux设置动画状态
      dispatch(setAnimatingTitleChatId(chatId));

      // 更新对话标题
      dispatch(
        updateChatTitle({
          chatId: chatId,
          title: generatedTitle,
        })
      );
      
      // 同时更新服务端列表中的标题
      dispatch(
        updateServerChatTitle({
          chatId: chatId,
          title: generatedTitle,
        })
      );
      
      toast({
        message: "标题已更新",
        type: "success",
      });
      
      // 设置自动清除动画效果的定时器（根据标题长度，每个字符约200ms）
      setTimeout(() => {
        dispatch(setAnimatingTitleChatId(null));
      }, generatedTitle.length * 200 + 1000); // 字符数*200ms + 额外1000ms
    } catch (error) {
      console.error("生成标题失败:", error);
      // 恢复原标题
      dispatch(
        updateChatTitle({
          chatId: chatId,
          title: chat.title,
        })
      );
      
      // 同时恢复服务端列表中的标题
      dispatch(
        updateServerChatTitle({
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
      
      // 同时更新服务端列表中的标题
      dispatch(
        updateServerChatTitle({
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

  // 滚动监听，实现无限滚动
  const handleScroll = () => {
    if (!containerRef.current || isLoadingMoreServer) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    
    // 滚动到底部时加载更多
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      loadMoreChats();
    }
  };

  return (
    <div className="flex flex-col h-full py-2 relative">
      <div className="px-4 mb-5">
        <div className="relative">
          {/* 背景光晕效果 */}
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/20 to-blue-500/20 opacity-30 animate-pulse blur-sm"></div>
          
          <Button 
            className="
              relative w-full flex items-center justify-center gap-2 
              bg-gradient-to-r from-primary to-primary/80
              hover:from-primary/90 hover:to-primary/70
              dark:from-green-500 dark:to-blue-600 
              dark:hover:from-green-600 dark:hover:to-blue-700
              text-primary-foreground font-medium
              shadow-lg hover:shadow-xl 
              border-0 backdrop-blur-sm 
              transition-all duration-300 ease-out
              hover:scale-105 active:scale-95
              before:absolute before:inset-0 before:rounded-lg 
              before:bg-gradient-to-r before:from-white/20 before:to-transparent 
              before:opacity-0 hover:before:opacity-100 
              before:transition-opacity before:duration-300
              overflow-hidden
              animate-bounce-subtle
            " 
            onClick={onNewChat}
          >
            {/* 闪光效果 */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            
            <span className="relative z-10">
              新对话
            </span>
          </Button>
        </div>
      </div>

      {/* 最近对话列表 */}
      <div className="px-4 flex-1 overflow-y-auto" ref={containerRef} onScroll={handleScroll}>
        <p className="text-sm font-medium text-muted-foreground tracking-wider mb-3 px-2">最近对话</p>
        {chats.length === 0 ? (
          <div className="text-sm text-muted-foreground mt-4 text-center">
            暂无对话记录
          </div>
        ) : (
          <div>
            {Object.entries(sortedAndGroupedChats).map(([groupLabel, groupChats]) => (
              <div key={groupLabel} className="mb-4">
                <h3 className="text-xs font-medium text-muted-foreground px-2 mb-2">{groupLabel}</h3>
                <div className="space-y-2">
                  {groupChats.map((chat) => (
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
                                {/* 显示时间和模型 */}
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
              </div>
            ))}
          </div>
        )}
        
        {/* 加载更多指示器 */}
        {isLoadingMoreServer && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            加载更多...
          </div>
        )}
        
        {isLoadingServerList && chats.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            加载中...
          </div>
        )}
      </div>

      {/* 浮动的"显示更多"按钮 - 只在没有滚动条且有更多数据时显示 */}
      {showLoadMoreButton && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-center">
          <div className="relative">
            {/* 背景光晕效果 */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 opacity-30 animate-pulse blur-sm"></div>
            
            <Button 
              onClick={loadMoreChats}
              disabled={isLoadingMoreServer}
              className="
                relative px-6 py-2 rounded-full 
                bg-gradient-to-r from-primary to-primary/80
                hover:from-primary/90 hover:to-primary/70
                dark:from-blue-500 dark:to-purple-600 
                dark:hover:from-blue-600 dark:hover:to-purple-700
                text-primary-foreground font-medium text-sm
                shadow-lg hover:shadow-xl 
                border-0 backdrop-blur-sm 
                transition-all duration-300 ease-out
                hover:scale-105 active:scale-95
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                animate-bounce-subtle
                before:absolute before:inset-0 before:rounded-full 
                before:bg-gradient-to-r before:from-white/20 before:to-transparent 
                before:opacity-0 hover:before:opacity-100 
                before:transition-opacity before:duration-300
                overflow-hidden
              "
              size="sm"
            >
              {/* 闪光效果 */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              
              <span className="relative z-10">
                {isLoadingMoreServer ? (
                  <>
                    <RefreshCwIcon size={16} className="mr-2 animate-spin" />
                    加载中...
                  </>
                ) : (
                  <>
                    显示更多
                  </>
                )}
              </span>
            </Button>
          </div>
        </div>
      )}

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
