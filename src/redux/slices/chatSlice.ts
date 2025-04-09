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
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  modelId: string;
  createdAt: number;
  updatedAt: number;
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
  reasoningEnabled: boolean;
  streamingReasoning: string | null;
  isStreamingReasoning: boolean;
  isThinkingPhaseComplete: boolean;
  animatingTitleChatId: string | null;
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
  reasoningEnabled: true,
  streamingReasoning: null,
  isStreamingReasoning: false,
  isThinkingPhaseComplete: false,
  animatingTitleChatId: null,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveChat: (state, action: PayloadAction<string | null>) => {
      state.activeChatId = action.payload;
    },
    createChat: (state, action: PayloadAction<{title?: string, modelId: string}>) => {
      const { title = '新对话', modelId } = action.payload;
      const newChat: Chat = {
        id: uuidv4(),
        title,
        messages: [],
        modelId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      state.chats.push(newChat);
      state.activeChatId = newChat.id;
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
      if (chat) {
        chat.title = title;
        chat.updatedAt = Date.now();
      }
    },
    updateChatModel: (state, action: PayloadAction<{chatId: string, modelId: string}>) => {
      const { chatId, modelId } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.modelId = modelId;
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
      // 第一次收到内容时设置开始时间
      if (!state.streamingReasoningStartTime && action.payload.trim()) {
        state.streamingReasoningStartTime = Date.now();
      }
      
      // 检查是否包含推理完成标记
      if (action.payload.endsWith("[REASONING_COMPLETE]")) {
        // 移除标记并更新内容
        state.streamingReasoningContent = action.payload.replace("[REASONING_COMPLETE]", "");
        // 设置结束时间并标记完成
        if (!state.streamingReasoningEndTime) {
          state.streamingReasoningEndTime = Date.now();
        }
        state.isThinkingPhaseComplete = true;
        // 立即标记推理流式状态结束，不影响主内容的流式输出
        state.isStreamingReasoning = false;
      } else {
        state.streamingReasoningContent = action.payload;
      }
    },
    toggleReasoning: (state, action: PayloadAction<boolean>) => {
      state.reasoningEnabled = action.payload;
    },
    startStreamingReasoning: (state) => {
      state.isStreamingReasoning = true;
      state.streamingReasoning = '';
      state.streamingReasoningStartTime = null;
      state.isThinkingPhaseComplete = false;
      state.streamingReasoningEndTime = undefined;
    },
    completeThinkingPhase: (state) => {
      if (!state.streamingReasoningEndTime) {
        state.streamingReasoningEndTime = Date.now();
      }
      state.isThinkingPhaseComplete = true;
      state.isStreamingReasoning = false;  // 停止流式状态
    },
    updateStreamingReasoning: (state, action: PayloadAction<string>) => {
      state.streamingReasoning = action.payload;
    },
    endStreamingReasoning: (state) => {
      if (!state.isThinkingPhaseComplete) {
        state.streamingReasoningEndTime = Date.now();
        state.isThinkingPhaseComplete = true;
      }
      state.isStreamingReasoning = false;
      state.streamingReasoning = null;
    },
    toggleReasoningVisibility: (state, action: PayloadAction<{chatId: string, messageId: string, visible: boolean}>) => {
      const { chatId, messageId, visible } = action.payload;
      console.log('切换推理可见性 action:', chatId, messageId, visible);

      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        const message = chat.messages.find(m => m.id === messageId);
        if (message) {
          message.isReasoningVisible = visible;
          // 添加同步到数据库的标记
          message.shouldSyncToDb = true;
          console.log('已更新消息状态:', message.id, message.isReasoningVisible);
        } else {
          console.log('未找到消息:', messageId);
        }
      } else {
        console.log('未找到聊天:', chatId);
      }
    },
    startStreaming: (state, action: PayloadAction<string>) => {
      state.isStreaming = true;
      state.streamingContent = '';
      state.streamingReasoningContent = '';
      const messageId = uuidv4();
      state.streamingMessageId = messageId;
      
      // 添加一个空的助手消息作为占位符
      const chatId = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.messages.push({
          id: messageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          chatId: chatId,
        });
      }
    },
    updateStreamingContent: (state, action: PayloadAction<{chatId: string, content: string}>) => {
      const { chatId, content } = action.payload;
      state.streamingContent = content;
      
      // 更新最后一条助手消息的内容
      const chat = state.chats.find(c => c.id === chatId);
      if (chat && chat.messages.length > 0 && state.streamingMessageId) {
        const streamingMessage  = chat.messages.find(m => m.id === state.streamingMessageId);
        if (streamingMessage) {
          streamingMessage.content = content;
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
  updateStreamingReasoning,
  endStreamingReasoning,
  toggleReasoningVisibility,
  updateMessageReasoning,
  updateStreamingReasoningContent,
  clearDbSyncFlag,
  completeThinkingPhase,
  setAnimatingTitleChatId,
} = chatSlice.actions;

export default chatSlice.reducer;