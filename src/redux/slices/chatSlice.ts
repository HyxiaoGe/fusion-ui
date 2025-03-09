import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  chatId?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  modelId: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  loading: boolean;
  error: string | null;
  streamingContent: string | null;
  isStreaming: boolean;
  streamingMessageId: string | null; // 存储正在流式输出的消息ID
}

const initialState: ChatState = {
  chats: [],
  activeChatId: null,
  loading: false,
  error: null,
  streamingContent: null,
  isStreaming: false,
  streamingMessageId: null,
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
        };
        chat.messages.push(newMessage);
        chat.updatedAt = Date.now();
        
        // 如果是第一条用户消息，更新对话标题
        if (chat.messages.length === 1 && message.role === 'user') {
          // 使用用户消息的前20个字符作为标题
          chat.title = message.content.substring(0, 20) + (message.content.length > 20 ? '...' : '');
        }
      }
    },
    startStreaming: (state, action: PayloadAction<string>) => {
      state.isStreaming = true;
      state.streamingContent = '';
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
    // 一次性设置所有聊天数据（用于从数据库初始化）
    setAllChats: (state, action: PayloadAction<Chat[]>) => {
      state.chats = action.payload;
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
  setLoading,
  setError,
  clearMessages,
  setAllChats,
  startStreaming,
  updateStreamingContent,
  endStreaming
} = chatSlice.actions;

export default chatSlice.reducer;