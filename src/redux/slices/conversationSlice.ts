import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  Conversation,
  HydrationStatus,
  Message,
  Pagination,
} from '@/types/conversation';

export interface ConversationState {
  byId: Record<string, Conversation>;
  listIds: string[];
  pagination: Pagination | null;
  isLoadingList: boolean;
  isLoadingMore: boolean;
  listError: string | null;
  conversationListVersion: number;
  hydrationStatus: Record<string, HydrationStatus>;
  hydrationError: Record<string, string>;
  pendingConversationId: string | null;
  animatingTitleId: string | null;
  reasoningEnabled: boolean;
  globalError: string | null;
}

const initialState: ConversationState = {
  byId: {},
  listIds: [],
  pagination: null,
  isLoadingList: false,
  isLoadingMore: false,
  listError: null,
  conversationListVersion: 0,
  hydrationStatus: {},
  hydrationError: {},
  pendingConversationId: null,
  animatingTitleId: null,
  reasoningEnabled: true,
  globalError: null,
};

const conversationSlice = createSlice({
  name: 'conversation',
  initialState,
  reducers: {
    setConversationList(
      state,
      action: PayloadAction<{ conversations: Conversation[]; pagination: Pagination }>
    ) {
      const { conversations, pagination } = action.payload;
      state.listIds = conversations.map((conversation) => conversation.id);
      conversations.forEach((conversation) => {
        const existing = state.byId[conversation.id];
        if (existing && existing.messages.length > 0) {
          state.byId[conversation.id] = {
            ...existing,
            title: conversation.title,
            updatedAt: conversation.updatedAt,
            model: conversation.model,
            provider: conversation.provider,
            createdAt: conversation.createdAt,
          };
        } else {
          state.byId[conversation.id] = conversation;
        }
      });
      state.pagination = pagination;
      state.isLoadingList = false;
      state.listError = null;
    },
    appendConversationList(
      state,
      action: PayloadAction<{ conversations: Conversation[]; pagination: Pagination }>
    ) {
      const { conversations, pagination } = action.payload;
      conversations.forEach((conversation) => {
        if (!state.listIds.includes(conversation.id)) {
          state.listIds.push(conversation.id);
        }
        const existing = state.byId[conversation.id];
        if (!existing || existing.messages.length === 0) {
          state.byId[conversation.id] = conversation;
        }
      });
      state.pagination = pagination;
      state.isLoadingMore = false;
    },
    requestConversationListRefresh(state) {
      state.conversationListVersion += 1;
    },
    setLoadingList(state, action: PayloadAction<boolean>) {
      state.isLoadingList = action.payload;
    },
    setLoadingMore(state, action: PayloadAction<boolean>) {
      state.isLoadingMore = action.payload;
    },
    setListError(state, action: PayloadAction<string | null>) {
      state.listError = action.payload;
    },
    upsertConversation(state, action: PayloadAction<Conversation>) {
      const conversation = action.payload;
      state.byId[conversation.id] = conversation;
      if (!state.listIds.includes(conversation.id)) {
        state.listIds.unshift(conversation.id);
      }
    },
    setAllConversations(state, action: PayloadAction<Conversation[]>) {
      state.byId = {};
      state.listIds = action.payload.map((conversation) => conversation.id);
      action.payload.forEach((conversation) => {
        state.byId[conversation.id] = conversation;
      });
    },
    removeConversation(state, action: PayloadAction<string>) {
      const id = action.payload;
      delete state.byId[id];
      delete state.hydrationStatus[id];
      delete state.hydrationError[id];
      state.listIds = state.listIds.filter((listId) => listId !== id);
      if (state.pendingConversationId === id) {
        state.pendingConversationId = null;
      }
    },
    updateConversationTitle(
      state,
      action: PayloadAction<{ id: string; title: string }>
    ) {
      const { id, title } = action.payload;
      if (state.byId[id]) {
        state.byId[id].title = title;
        state.byId[id].updatedAt = Date.now();
      }
    },
    updateConversationModel(
      state,
      action: PayloadAction<{ id: string; model: string }>
    ) {
      const { id, model } = action.payload;
      if (state.byId[id]) {
        state.byId[id].model = model;
        state.byId[id].updatedAt = Date.now();
      }
    },
    clearConversationMessages(state, action: PayloadAction<string>) {
      const conversation = state.byId[action.payload];
      if (conversation) {
        conversation.messages = [];
        conversation.updatedAt = Date.now();
      }
    },
    appendMessage(
      state,
      action: PayloadAction<{ conversationId: string; message: Message }>
    ) {
      const { conversationId, message } = action.payload;
      const conversation = state.byId[conversationId];
      if (conversation) {
        conversation.messages.push({
          ...message,
          chatId: conversationId,
          timestamp: message.timestamp ?? Date.now(),
          status: message.status ?? null,
        });
        conversation.updatedAt = Date.now();
      }
    },
    updateMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        patch: Partial<Message>;
      }>
    ) {
      const { conversationId, messageId, patch } = action.payload;
      const conversation = state.byId[conversationId];
      if (!conversation) return;
      const message = conversation.messages.find((item) => item.id === messageId);
      if (message) {
        Object.assign(message, patch);
      }
    },
    toggleReasoningVisibility(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        visible: boolean;
      }>
    ) {
      const { conversationId, messageId, visible } = action.payload;
      const conversation = state.byId[conversationId];
      if (!conversation) return;
      const message = conversation.messages.find((item) => item.id === messageId);
      if (message) {
        message.isReasoningVisible = visible;
        message.shouldSyncToDb = true;
      }
    },
    removeMessage(
      state,
      action: PayloadAction<{ conversationId: string; messageId: string }>
    ) {
      const { conversationId, messageId } = action.payload;
      const conversation = state.byId[conversationId];
      if (conversation) {
        conversation.messages = conversation.messages.filter(
          (message) => message.id !== messageId
        );
      }
    },
    setPendingConversationId(state, action: PayloadAction<string | null>) {
      state.pendingConversationId = action.payload;
    },
    materializeConversation(
      state,
      action: PayloadAction<{
        pendingId: string;
        serverConversation: Conversation;
      }>
    ) {
      const { pendingId, serverConversation } = action.payload;
      delete state.byId[pendingId];
      state.listIds = state.listIds.filter((id) => id !== pendingId);
      state.byId[serverConversation.id] = serverConversation;
      state.listIds.unshift(serverConversation.id);
      state.hydrationStatus[serverConversation.id] = 'done';
      state.pendingConversationId = null;
    },
    setHydrationStatus(
      state,
      action: PayloadAction<{ id: string; status: HydrationStatus; error?: string }>
    ) {
      const { id, status, error } = action.payload;
      state.hydrationStatus[id] = status;
      if (status === 'error' && error) {
        state.hydrationError[id] = error;
      } else {
        delete state.hydrationError[id];
      }
    },
    setAnimatingTitleId(state, action: PayloadAction<string | null>) {
      state.animatingTitleId = action.payload;
    },
    setReasoningEnabled(state, action: PayloadAction<boolean>) {
      state.reasoningEnabled = action.payload;
    },
    setGlobalError(state, action: PayloadAction<string | null>) {
      state.globalError = action.payload;
    },
    resetConversationState(state) {
      const { reasoningEnabled } = state;
      Object.assign(state, { ...initialState, reasoningEnabled });
    },
  },
});

export const {
  appendConversationList,
  appendMessage,
  clearConversationMessages,
  materializeConversation,
  removeConversation,
  removeMessage,
  requestConversationListRefresh,
  resetConversationState,
  setAllConversations,
  setAnimatingTitleId,
  setConversationList,
  setGlobalError,
  setHydrationStatus,
  setListError,
  setLoadingList,
  setLoadingMore,
  setPendingConversationId,
  setReasoningEnabled,
  toggleReasoningVisibility,
  updateConversationModel,
  updateConversationTitle,
  updateMessage,
  upsertConversation,
} = conversationSlice.actions;

export default conversationSlice.reducer;
