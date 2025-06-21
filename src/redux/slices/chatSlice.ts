import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  chatId?: string;
  status?: 'pending' | 'failed' | null;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
    previewUrl?: string;
    fileId?: string;
  }[];
  reasoning?: string;
  isReasoningVisible?: boolean;
  reasoningStartTime?: number;
  reasoningEndTime?: number;
  shouldSyncToDb?: boolean;
  turnId?: string;
  messageType?: string;
  duration?: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  provider?: string;
  createdAt: number;
  updatedAt: number;
  functionCallOutput?: {
    type: string;
    query?: string;
    data: any;
    error?: string | null;
    timestamp: number;
  } | null;
}

export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  loading: boolean;
  error: string | null;
  streamingContent: string | null;
  isStreaming: boolean;
  streamingReasoningContent: string;
  streamingReasoningStartTime: number | null;
  streamingReasoningEndTime: number | undefined;
  streamingMessageId: string | null;
  streamingReasoningMessageId: string | null;
  reasoningEnabled: boolean;
  isStreamingReasoning: boolean;
  isThinkingPhaseComplete: boolean;
  animatingTitleChatId: string | null;
  webSearchEnabled: boolean;
  functionCallEnabled: boolean;

  // 新增 Function Call 相关状态
  functionCallType: string | null;
  functionCallData: any | null; // 用于存储解析后的函数调用结果
  isFunctionCallInProgress: boolean;
  functionCallError: string | null;
  functionCallStepContent: string | null; // 新增：存储函数调用步骤内容

  // 服务端数据相关状态
  serverChatList: any[]; // 服务端会话列表
  isLoadingServerList: boolean;
  isLoadingServerChat: boolean;
  isLoadingMoreServer: boolean;
  serverPagination: {
    current_page: number;
    page_size: number;
    total_pages: number;
    total_count: number;
    has_next: boolean;
    has_prev: boolean;
  } | null;
  serverError: string | null;
}

const initialState: ChatState = {
  chats: [],
  activeChatId: null,
  loading: false,
  error: null,
  streamingContent: null,
  isStreaming: false,
  streamingReasoningContent: '',
  streamingReasoningStartTime: null,
  streamingReasoningEndTime: undefined,
  streamingMessageId: null,
  streamingReasoningMessageId: null,
  reasoningEnabled: false,
  isStreamingReasoning: false,
  isThinkingPhaseComplete: false,
  animatingTitleChatId: null,
  webSearchEnabled: false,
  functionCallEnabled: false,

  // 初始化 Function Call 相关状态
  functionCallType: null,
  functionCallData: null,
  isFunctionCallInProgress: false,
  functionCallError: null,
  functionCallStepContent: null, // 初始化新状态

  // 服务端数据相关状态
  serverChatList: [],
  isLoadingServerList: false,
  isLoadingServerChat: false,
  isLoadingMoreServer: false,
  serverPagination: null,
  serverError: null,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveChat: (state, action: PayloadAction<string | null>) => {
      state.activeChatId = action.payload;
      state.isFunctionCallInProgress = false;
      state.functionCallType = null;
      state.functionCallError = null;
    },
    createChat: (state, action: PayloadAction<{id?: string, title?: string, model: string}>) => {
      const { id, title = '新对话', model } = action.payload;
      const newChat: Chat = {
        id: id || uuidv4(),
        title,
        messages: [],
        model,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        functionCallOutput: null,
      };
      state.chats.push(newChat);
      state.activeChatId = newChat.id;
      
      // 同时添加到服务端列表（如果服务端列表存在）
      if (state.serverChatList.length > 0) {
        const serverChat = {
          id: newChat.id,
          title: newChat.title,
          model: newChat.model,
          provider: newChat.provider,
          created_at: new Date(newChat.createdAt).toISOString(),
          updated_at: new Date(newChat.updatedAt).toISOString(),
        };
        // 将新对话添加到列表开头（最新的在前面）
        state.serverChatList.unshift(serverChat);
      }
    },
    deleteChat: (state, action: PayloadAction<string>) => {
      const chatIndex = state.chats.findIndex(chat => chat.id === action.payload);
      if (chatIndex !== -1) {
        state.chats.splice(chatIndex, 1);
        
        // 如果删除的是当前活动对话，切换到最近的对话
        if (state.activeChatId === action.payload) {
          state.activeChatId = state.chats.length > 0 ? state.chats[0].id : null;
        }
      }
    },
    updateChatTitle: (state, action: PayloadAction<{chatId: string, title: string}>) => {
      const { chatId, title } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat && chat.title !== title) {
        chat.title = title;
        chat.updatedAt = Date.now();
      }
    },
    updateChatModel: (state, action: PayloadAction<{chatId: string, model: string}>) => {
      const { chatId, model } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.model = model;
        chat.updatedAt = Date.now();
      }
    },
    addMessage: (state, action: PayloadAction<{chatId: string, message: Omit<Message, 'id' | 'timestamp'>}>) => {
      const { chatId, message } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        const newMessage: Message = {
          ...message,
          id: uuidv4(),
          timestamp: Date.now(),
          status: null,
          chatId: chatId,
        };
        chat.messages.push(newMessage);
        chat.updatedAt = Date.now();
        
        // 不再自动更新第一条消息为标题，因为我们现在已经有了默认标题
      }
    },
    editMessage: (state, action: PayloadAction<{chatId: string, messageId: string, content: string}>) => {
      const { chatId, messageId, content } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        const message = chat.messages.find(m => m.id === messageId);
        if (message) {
          message.content = content;
          message.timestamp = Date.now(); // 更新时间戳
          chat.updatedAt = Date.now();
        }
      }
    },
    deleteMessage: (state, action: PayloadAction<{chatId: string, messageId: string}>) => {
      const { chatId, messageId } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.messages = chat.messages.filter(m => m.id !== messageId);
        chat.updatedAt = Date.now();
      }
    },
    setMessageStatus: (state, action: PayloadAction<{chatId: string, messageId: string, status: 'pending' | 'failed' | null}>) => {
      const { chatId, messageId, status } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        const message = chat.messages.find(m => m.id === messageId);
        if (message) {
          message.status = status;
        }
      }
    },
    updateMessageReasoning: (state, action: PayloadAction<{messageId: string, chatId: string, reasoning: string, isVisible?: boolean}>) => {
      const { messageId, chatId, reasoning, isVisible = true } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        const message = chat.messages.find(m => m.id === messageId);
        if (message) {
          message.reasoning = reasoning;
          message.isReasoningVisible = isVisible;
          
          // 确保时间戳被正确设置
          message.reasoningStartTime = state.streamingReasoningStartTime || undefined;
          if (state.isThinkingPhaseComplete && state.streamingReasoningEndTime) {
            message.reasoningEndTime = state.streamingReasoningEndTime;
          }
          
          message.shouldSyncToDb = true;
        }
      }
    },
    updateStreamingReasoningContent: (state, action: PayloadAction<string>) => {
      // 移除特殊标记
      const cleanedPayload = action.payload.replace("[REASONING_COMPLETE]", "");
      state.streamingReasoningContent = cleanedPayload;
    },
    toggleReasoning: (state, action: PayloadAction<boolean>) => {
      state.reasoningEnabled = action.payload;
    },
    toggleWebSearch: (state, action: PayloadAction<boolean>) => {
      state.webSearchEnabled = action.payload;
    },
    startStreamingReasoning: (state) => {
      state.isStreamingReasoning = true;
      state.streamingReasoningStartTime = Date.now();
      state.streamingReasoningEndTime = undefined; // 重置结束时间
    },
    completeThinkingPhase: (state) => {
      if (!state.streamingReasoningEndTime) {
        state.streamingReasoningEndTime = Date.now();
      }
      state.isThinkingPhaseComplete = true;
      state.isStreamingReasoning = false;  // 停止流式状态
    },
    endStreamingReasoning: (state) => {
      if (!state.isThinkingPhaseComplete) {
        state.streamingReasoningEndTime = Date.now();
        state.isThinkingPhaseComplete = true;
      }
      state.isStreamingReasoning = false;
    },
    toggleReasoningVisibility: (state, action: PayloadAction<{chatId: string, messageId: string, visible: boolean}>) => {
      const { chatId, messageId, visible } = action.payload;

      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        const message = chat.messages.find(m => m.id === messageId);
        if (message) {
          message.isReasoningVisible = visible;
          // 添加同步到数据库的标记
          message.shouldSyncToDb = true;
        }
      }
    },
    startStreaming: (state, action: PayloadAction<string>) => {
      const chatId = action.payload;
      state.isStreaming = true;
      state.streamingContent = '';
      state.streamingReasoningContent = '';
      state.streamingReasoningEndTime = undefined;
      state.streamingReasoningMessageId = null;
      state.error = null;
      state.isThinkingPhaseComplete = false;
      state.functionCallType = null;
      state.functionCallData = null;
      state.isFunctionCallInProgress = false;
      state.functionCallError = null;

      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        // 创建一个助手机色的消息用于接收流式内容
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          chatId: chatId,
        };
        chat.messages.push(assistantMessage);
        state.streamingMessageId = assistantMessage.id;
      }
    },
    updateStreamingContent: (state, action: PayloadAction<{ chatId: string; content: string }>) => {
      state.streamingContent = action.payload.content;
      
      const chat = state.chats.find(c => c.id === action.payload.chatId);
      if (chat && chat.messages.length > 0 && state.streamingMessageId) {
        const streamingMessage  = chat.messages.find(m => m.id === state.streamingMessageId);
        if (streamingMessage) {
          streamingMessage.content = action.payload.content;
        }
      }
    },
    endStreaming: (state) => {
      state.isStreaming = false;
      state.streamingContent = null;
      state.streamingMessageId = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearMessages: (state, action: PayloadAction<string>) => {
      const chatId = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.messages = [];
        chat.updatedAt = Date.now();
      }
    },
    // 清除数据库同步标记
    clearDbSyncFlag: (state, action: PayloadAction<{chatId: string, messageId: string}>) => {
      const { chatId, messageId } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        const message = chat.messages.find(m => m.id === messageId);
        if (message && message.shouldSyncToDb) {
          message.shouldSyncToDb = false;
        }
      }
    },
    // 一次性设置所有聊天数据（用于从数据库初始化）
    setAllChats: (state, action: PayloadAction<Chat[]>) => {
      state.chats = action.payload;
    },
    setAnimatingTitleChatId: (state, action: PayloadAction<string | null>) => {
      state.animatingTitleChatId = action.payload;
    },
    // Function Call Actions
    startFunctionCall: (state, action: PayloadAction<{ type: string }>) => {
      state.isFunctionCallInProgress = true;
      state.functionCallType = action.payload.type;
      state.functionCallError = null;
    },
    setFunctionCallData: (state, action: PayloadAction<{ chatId: string, type: string, query?: string, data: any }>) => {
      const { chatId, type, query, data } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.functionCallOutput = {
          type,
          query,
          data,
          error: null,
          timestamp: Date.now(),
        };
      }
      if (state.functionCallType === type) {
        state.isFunctionCallInProgress = false;
      }
    },
    setFunctionCallError: (state, action: PayloadAction<{ chatId: string, type: string, error: string | null }>) => {
      const { chatId, type, error } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.functionCallOutput = {
          type,
          query: chat.functionCallOutput?.query,
          data: null,
          error: error,
          timestamp: Date.now(),
        };
      }
      if (state.functionCallType === type) {
        state.isFunctionCallInProgress = false;
        state.functionCallError = error;
      }
    },
    clearFunctionCallData: (state) => {
      state.functionCallType = null;
      state.functionCallData = null;
      state.isFunctionCallInProgress = false;
      state.functionCallError = null;
      state.functionCallStepContent = null; // 清理时也重置
    },
    setFunctionCallStepContent: (state, action: PayloadAction<{ content: string | null }>) => {
      // 这个状态似乎是全局的，不需要 chatId
      state.functionCallStepContent = action.payload.content;
    },
    clearChatFunctionCallOutput: (state, action: PayloadAction<{ chatId: string }>) => {
      const chat = state.chats.find(c => c.id === action.payload.chatId);
      if (chat) {
        chat.functionCallOutput = null;
        // 当切换聊天或清理时，也清理全局状态
        state.functionCallType = null;
        state.functionCallData = null;
        state.isFunctionCallInProgress = false;
        state.functionCallError = null;
        state.functionCallStepContent = null;
      }
    },
    resetFunctionCallProgress: (state) => {
      state.isFunctionCallInProgress = false;
    },
    // 服务端数据管理actions
    setServerChatList: (state, action: PayloadAction<{ chats: any[]; pagination: any }>) => {
      state.serverChatList = action.payload.chats;
      state.serverPagination = action.payload.pagination;
    },
    
    // 新增：更新服务端聊天列表中特定对话的标题
    updateServerChatTitle: (state, action: PayloadAction<{ chatId: string; title: string }>) => {
      const { chatId, title } = action.payload;
      const serverChat = state.serverChatList.find(chat => chat.id === chatId);
      if (serverChat && serverChat.title !== title) {
        serverChat.title = title;
        serverChat.updated_at = new Date().toISOString();
      }
    },
    
    appendServerChatList: (state, action: PayloadAction<{ chats: any[]; pagination: any }>) => {
      state.serverChatList = [...state.serverChatList, ...action.payload.chats];
      state.serverPagination = action.payload.pagination;
    },
    
    setLoadingServerList: (state, action: PayloadAction<boolean>) => {
      state.isLoadingServerList = action.payload;
    },
    
    setLoadingServerChat: (state, action: PayloadAction<boolean>) => {
      state.isLoadingServerChat = action.payload;
    },
    
    setLoadingMoreServer: (state, action: PayloadAction<boolean>) => {
      state.isLoadingMoreServer = action.payload;
    },
    
    setServerError: (state, action: PayloadAction<string | null>) => {
      state.serverError = action.payload;
    },
    
    clearServerError: (state) => {
      state.serverError = null;
    },
    setStreamingReasoningMessageId: (state, action: PayloadAction<string>) => {
      state.streamingReasoningMessageId = action.payload;
    },
  },
  extraReducers: (builder) => {
    // ... existing code ...
  },
});

export const {
  setActiveChat,
  createChat,
  deleteChat,
  updateChatTitle,
  updateChatModel,
  addMessage,
  editMessage,
  deleteMessage,
  setLoading,
  setError,
  clearMessages,
  setAllChats,
  startStreaming,
  updateStreamingContent,
  endStreaming,
  setMessageStatus,
  toggleReasoning,
  startStreamingReasoning,
  endStreamingReasoning,
  toggleReasoningVisibility,
  updateMessageReasoning,
  updateStreamingReasoningContent,
  clearDbSyncFlag,
  completeThinkingPhase,
  setAnimatingTitleChatId,
  startFunctionCall,
  setFunctionCallData,
  setFunctionCallError,
  clearFunctionCallData,
  setFunctionCallStepContent,
  clearChatFunctionCallOutput,
  resetFunctionCallProgress,
  toggleWebSearch,
  setServerChatList,
  updateServerChatTitle,
  appendServerChatList,
  setLoadingServerList,
  setLoadingServerChat,
  setLoadingMoreServer,
  setServerError,
  clearServerError,
  setStreamingReasoningMessageId,
} = chatSlice.actions;

export default chatSlice.reducer;