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

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  loading: boolean;
  error: string | null;
  streamingContent: string | null;
  isStreaming: boolean;
  streamingReasoningContent: string;
  streamingReasoningStartTime: number | null; // 记录思考开始时间
  streamingMessageId: string | null; // 存储正在流式输出的消息ID
  reasoningEnabled: boolean;
  streamingReasoning: string | null;
  isStreamingReasoning: boolean;
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
  streamingMessageId: null,
  reasoningEnabled: true,
  streamingReasoning: null,
  isStreamingReasoning: false,
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
        
        // 如果是第一条用户消息，更新对话标题
        if (chat.messages.length === 1 && message.role === 'user') {
          // 使用用户消息的前20个字符作为标题
          chat.title = message.content.substring(0, 20) + (message.content.length > 20 ? '...' : '');
        }
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
          // 记录思考的开始和结束时间
          message.reasoningStartTime = state.streamingReasoningStartTime || undefined;
          message.reasoningEndTime = Date.now();
          
          // 添加一个标记，表示这个消息需要保存到数据库
          // 不在reducer中执行异步操作
          message.shouldSyncToDb = true;
        }
      }
    },
    updateStreamingReasoningContent: (state, action: PayloadAction<string>) => {
      state.streamingReasoningContent = action.payload;
    },
    toggleReasoning: (state, action: PayloadAction<boolean>) => {
      state.reasoningEnabled = action.payload;
    },
    startStreamingReasoning: (state) => {
      state.isStreamingReasoning = true;
      state.streamingReasoning = '';
      // 记录开始思考的时间
      state.streamingReasoningStartTime = Date.now();
    },
    updateStreamingReasoning: (state, action: PayloadAction<string>) => {
      state.streamingReasoning = action.payload;
    },
    endStreamingReasoning: (state) => {
      state.isStreamingReasoning = false;
      state.streamingReasoning = null;
      // 结束时保存结束时间，不要清除开始时间，以便传递给消息
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
  clearDbSyncFlag
} = chatSlice.actions;

export default chatSlice.reducer;