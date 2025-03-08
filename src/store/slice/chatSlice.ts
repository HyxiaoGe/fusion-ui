import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface Chat {
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
}

const initialState: ChatState = {
  chats: [],
  activeChatId: null,
  loading: false,
  error: null,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveChat: (state, action: PayloadAction<string>) => {
      state.activeChatId = action.payload;
    },
    addChat: (state, action: PayloadAction<Chat>) => {
      state.chats.push(action.payload);
      state.activeChatId = action.payload.id;
    },
    removeChat: (state, action: PayloadAction<string>) => {
      state.chats = state.chats.filter(chat => chat.id !== action.payload);
      if (state.activeChatId === action.payload) {
        state.activeChatId = state.chats.length > 0 ? state.chats[0].id : null;
      }
    },
    addMessage: (state, action: PayloadAction<{chatId: string, message: Omit<Message, 'id' | 'timestamp'>}>) => {
      const { chatId, message } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        // 检查是否已存在重复消息
        const isDuplicate = chat.messages.some(
          existingMsg => 
            existingMsg.role === message.role && 
            existingMsg.content === message.content
        );
        
        // 如果不重复，则添加消息
        if (!isDuplicate) {
          const newMessage: Message = {
            ...message,
            id: uuidv4(),
            timestamp: Date.now(),
          };
          chat.messages.push(newMessage);
          chat.updatedAt = Date.now();
          
          // 如果是第一条用户消息，更新对话标题
          if (chat.messages.length === 1 && message.role === 'user') {
            chat.title = message.content.substring(0, 20) + (message.content.length > 20 ? '...' : '');
          }
        } else {
          console.log('Redux状态中跳过重复消息');
        }
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setActiveChat, addChat, removeChat, addMessage, setLoading, setError } = chatSlice.actions;
export default chatSlice.reducer;