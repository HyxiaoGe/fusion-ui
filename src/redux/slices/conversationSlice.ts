import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  Conversation,
  HydrationStatus,
  Message,
  Pagination,
} from '@/types/conversation';

export interface ConversationMetadataSnapshot {
  title: string;
  model_id: string;
  updatedAt: number;
}

export type ConversationListRequestMetadata = Record<string, ConversationMetadataSnapshot>;

function mergeListConversation(
  existing: Conversation,
  incoming: Conversation,
  requestMetadata?: ConversationListRequestMetadata
): Conversation {
  if (requestMetadata === undefined) {
    return {
      ...existing,
      title: incoming.title,
      updatedAt: incoming.updatedAt,
      model_id: incoming.model_id,
      createdAt: incoming.createdAt,
    };
  }

  const existedAtRequestStart = Object.prototype.hasOwnProperty.call(
    requestMetadata,
    incoming.id
  );
  if (!existedAtRequestStart) {
    // 请求发出后才在本地创建/物化的同 ID 会话，远端旧分页不得覆盖其元数据。
    return existing;
  }

  const requestSnapshot = requestMetadata[incoming.id];
  return {
    ...existing,
    title: existing.title !== requestSnapshot.title ? existing.title : incoming.title,
    model_id: existing.model_id !== requestSnapshot.model_id ? existing.model_id : incoming.model_id,
    updatedAt: existing.updatedAt !== requestSnapshot.updatedAt ? existing.updatedAt : incoming.updatedAt,
    createdAt: incoming.createdAt,
  };
}

export interface ConversationState {
  byId: Record<string, Conversation>;
  lastReadyConversationSnapshot: {
    chatId: string;
    messages: Message[];
  } | null;
  listIds: string[];
  pagination: Pagination | null;
  isLoadingList: boolean;
  isLoadingMore: boolean;
  listError: string | null;
  conversationListVersion: number;
  conversationListEpoch: number;
  conversationListDirtyIds: string[];
  conversationListDirtyRevisions: Record<string, number>;
  hydrationStatus: Record<string, HydrationStatus>;
  hydrationError: Record<string, string>;
  pendingConversationId: string | null;
  animatingTitleId: string | null;
  reasoningEnabled: boolean;
  globalError: string | null;
  searchResults: Conversation[] | null;  // null = 未搜索；[] = 搜了但无结果
  isSearching: boolean;
  searchError: string | null;
}

const initialState: ConversationState = {
  byId: {},
  lastReadyConversationSnapshot: null,
  listIds: [],
  pagination: null,
  isLoadingList: false,
  isLoadingMore: false,
  listError: null,
  conversationListVersion: 0,
  conversationListEpoch: 0,
  conversationListDirtyIds: [],
  conversationListDirtyRevisions: {},
  hydrationStatus: {},
  hydrationError: {},
  pendingConversationId: null,
  animatingTitleId: null,
  reasoningEnabled: true,
  globalError: null,
  searchResults: null,
  isSearching: false,
  searchError: null,
};

const conversationSlice = createSlice({
  name: 'conversation',
  initialState,
  reducers: {
    setConversationList(
      state,
      action: PayloadAction<{
        conversations: Conversation[];
        pagination: Pagination;
        requestMetadata?: ConversationListRequestMetadata;
        requestListIds?: string[];
      }>
    ) {
      const { conversations, pagination, requestMetadata, requestListIds } = action.payload;
      let visibleConversations = conversations;
      if (requestListIds) {
        const requestIdSet = new Set(requestListIds);
        const currentIdSet = new Set(state.listIds);
        const addedAfterRequest = state.listIds.filter((id) => !requestIdSet.has(id));
        const addedAfterRequestSet = new Set(addedAfterRequest);
        const removedAfterRequestSet = new Set(
          requestListIds.filter((id) => !currentIdSet.has(id))
        );
        visibleConversations = conversations.filter(
          (conversation) => !removedAfterRequestSet.has(conversation.id)
        );
        state.listIds = [
          ...addedAfterRequest,
          ...visibleConversations
            .map((conversation) => conversation.id)
            .filter((id) => !addedAfterRequestSet.has(id)),
        ];
      } else {
        state.listIds = conversations.map((conversation) => conversation.id);
      }
      visibleConversations.forEach((conversation) => {
        const existing = state.byId[conversation.id];
        if (existing) {
          // 只更新元数据，永远不覆盖已有消息（保留 hydrated messages）
          state.byId[conversation.id] = mergeListConversation(
            existing,
            conversation,
            requestMetadata
          );
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
      action: PayloadAction<{
        conversations: Conversation[];
        pagination: Pagination;
        requestMetadata?: ConversationListRequestMetadata;
        requestListIds?: string[];
      }>
    ) {
      const { conversations, pagination, requestMetadata, requestListIds } = action.payload;
      const currentIdSet = new Set(state.listIds);
      const removedAfterRequestSet = new Set(
        requestListIds?.filter((id) => !currentIdSet.has(id)) ?? []
      );
      const visibleConversations = conversations.filter(
        (conversation) => !removedAfterRequestSet.has(conversation.id)
      );
      visibleConversations.forEach((conversation) => {
        if (!state.listIds.includes(conversation.id)) {
          state.listIds.push(conversation.id);
        }
        const existing = state.byId[conversation.id];
        if (existing) {
          // 只更新元数据，保留本地消息
          state.byId[conversation.id] = mergeListConversation(
            existing,
            conversation,
            requestMetadata
          );
        } else {
          state.byId[conversation.id] = conversation;
        }
      });
      state.pagination = pagination;
      state.isLoadingMore = false;
    },
    requestConversationListRefresh(state, action: PayloadAction<string>) {
      if (!state.conversationListDirtyIds.includes(action.payload)) {
        state.conversationListDirtyIds.push(action.payload);
      }
      state.conversationListVersion += 1;
      state.conversationListDirtyRevisions[action.payload] = state.conversationListVersion;
    },
    acknowledgeConversationListRefresh(
      state,
      action: PayloadAction<Array<{ id: string; revision: number }>>
    ) {
      const acknowledgedRevisions = new Map(
        action.payload.map((item) => [item.id, item.revision])
      );
      state.conversationListDirtyIds = state.conversationListDirtyIds.filter(
        (id) => {
          const acknowledgedRevision = acknowledgedRevisions.get(id);
          if (
            acknowledgedRevision === undefined ||
            state.conversationListDirtyRevisions[id] !== acknowledgedRevision
          ) {
            return true;
          }
          delete state.conversationListDirtyRevisions[id];
          return false;
        }
      );
    },
    updateConversationsMetadata(
      state,
      action: PayloadAction<Array<{
        id: string;
        title: string;
        model_id: string;
        updatedAt: number;
        requestMetadata?: ConversationMetadataSnapshot | null;
      }>>
    ) {
      // 仅更新 byId 中已存在的对话的元数据，不动 listIds / pagination / messages
      action.payload.forEach((item) => {
        const existing = state.byId[item.id];
        if (!existing) return;  // 不存在的 ID 直接忽略
        const preserveLocalMetadata = item.requestMetadata === null;
        const titleChangedAfterRequest = Boolean(
          item.requestMetadata && existing.title !== item.requestMetadata.title
        );
        const modelChangedAfterRequest = Boolean(
          item.requestMetadata && existing.model_id !== item.requestMetadata.model_id
        );
        const updatedAtChangedAfterRequest = Boolean(
          item.requestMetadata && existing.updatedAt !== item.requestMetadata.updatedAt
        );
        state.byId[item.id] = {
          ...existing,
          title: preserveLocalMetadata || titleChangedAfterRequest ? existing.title : item.title,
          model_id: preserveLocalMetadata || modelChangedAfterRequest ? existing.model_id : item.model_id,
          updatedAt: preserveLocalMetadata || updatedAtChangedAfterRequest ? existing.updatedAt : item.updatedAt,
        };
      });
    },
    resetConversationListForAuthChange(state) {
      const { reasoningEnabled, conversationListEpoch } = state;
      Object.assign(state, {
        ...initialState,
        reasoningEnabled,
        conversationListEpoch: conversationListEpoch + 1,
      });
    },
    setSearchLoading(state, action: PayloadAction<boolean>) {
      state.isSearching = action.payload;
      if (action.payload) {
        state.searchError = null;
      }
    },
    setSearchResults(state, action: PayloadAction<Conversation[] | null>) {
      state.searchResults = action.payload;
      state.isSearching = false;
      state.searchError = null;
    },
    setSearchError(state, action: PayloadAction<string | null>) {
      state.searchError = action.payload;
      state.isSearching = false;
    },
    clearSearch(state) {
      state.searchResults = null;
      state.isSearching = false;
      state.searchError = null;
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
    mergeHydratedConversation(
      state,
      action: PayloadAction<{
        conversation: Conversation;
        preserveMessageIds?: string[];
        requestMetadata?: {
          title: string;
          model_id: string;
          updatedAt: number;
        } | null;
      }>
    ) {
      const { conversation, preserveMessageIds = [], requestMetadata = null } = action.payload;
      const existing = state.byId[conversation.id];
      const existingMessagesById = new Map(
        (existing?.messages ?? []).map((message) => [message.id, message])
      );
      const preservedIds = new Set(preserveMessageIds);
      const serverIds = new Set(conversation.messages.map((message) => message.id));
      const mergedServerMessages = conversation.messages.map((serverMessage) => {
        const localMessage = existingMessagesById.get(serverMessage.id);
        if (!localMessage) {
          return serverMessage;
        }
        if (preservedIds.has(serverMessage.id)) {
          return localMessage;
        }
        return {
          ...serverMessage,
          status: localMessage.status ?? serverMessage.status,
          isReasoningVisible: localMessage.isReasoningVisible ?? serverMessage.isReasoningVisible,
          shouldSyncToDb: localMessage.shouldSyncToDb ?? serverMessage.shouldSyncToDb,
          suggestedQuestions: serverMessage.suggestedQuestions ?? localMessage.suggestedQuestions,
        };
      });
      const localOnlyMessages = (existing?.messages ?? []).filter(
        (message) => !serverIds.has(message.id)
      );
      const messages = [...mergedServerMessages, ...localOnlyMessages]
        .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));
      const titleChangedAfterRequest = Boolean(
        existing && requestMetadata && existing.title !== requestMetadata.title
      );
      const modelChangedAfterRequest = Boolean(
        existing && requestMetadata && existing.model_id !== requestMetadata.model_id
      );
      const updatedAtChangedAfterRequest = Boolean(
        existing && requestMetadata && existing.updatedAt !== requestMetadata.updatedAt
      );

      state.byId[conversation.id] = {
        ...conversation,
        title: titleChangedAfterRequest ? existing!.title : conversation.title,
        model_id: modelChangedAfterRequest ? existing!.model_id : conversation.model_id,
        updatedAt: updatedAtChangedAfterRequest ? existing!.updatedAt : conversation.updatedAt,
        messages,
      };
      if (!state.listIds.includes(conversation.id)) {
        state.listIds.unshift(conversation.id);
      }
      state.hydrationStatus[conversation.id] = 'done';
      delete state.hydrationError[conversation.id];
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
      if (state.lastReadyConversationSnapshot?.chatId === id) {
        state.lastReadyConversationSnapshot = null;
      }
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
      action: PayloadAction<{ id: string; model_id: string }>
    ) {
      const { id, model_id } = action.payload;
      if (state.byId[id]) {
        state.byId[id].model_id = model_id;
        state.byId[id].updatedAt = Date.now();
      }
    },
    clearConversationMessages(state, action: PayloadAction<string>) {
      const conversation = state.byId[action.payload];
      if (conversation) {
        conversation.messages = [];
        conversation.updatedAt = Date.now();
      }
      if (state.lastReadyConversationSnapshot?.chatId === action.payload) {
        state.lastReadyConversationSnapshot = null;
      }
      state.hydrationStatus[action.payload] = 'done';
      delete state.hydrationError[action.payload];
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
    setLastReadyConversationSnapshot(
      state,
      action: PayloadAction<{ chatId: string; messages: Message[] }>
    ) {
      state.lastReadyConversationSnapshot = action.payload;
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
      const { reasoningEnabled, conversationListEpoch } = state;
      Object.assign(state, {
        ...initialState,
        reasoningEnabled,
        conversationListEpoch: conversationListEpoch + 1,
      });
    },
  },
});

export const {
  acknowledgeConversationListRefresh,
  appendConversationList,
  appendMessage,
  clearConversationMessages,
  clearSearch,
  materializeConversation,
  mergeHydratedConversation,
  removeConversation,
  removeMessage,
  requestConversationListRefresh,
  resetConversationListForAuthChange,
  resetConversationState,
  setAllConversations,
  setAnimatingTitleId,
  setConversationList,
  setGlobalError,
  setHydrationStatus,
  setLastReadyConversationSnapshot,
  setListError,
  setLoadingList,
  setLoadingMore,
  setPendingConversationId,
  setReasoningEnabled,
  setSearchError,
  setSearchLoading,
  setSearchResults,
  toggleReasoningVisibility,
  updateConversationModel,
  updateConversationTitle,
  updateConversationsMetadata,
  updateMessage,
  upsertConversation,
} = conversationSlice.actions;

export default conversationSlice.reducer;
