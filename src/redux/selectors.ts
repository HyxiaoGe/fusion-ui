// src/redux/selectors.ts
/**
 * 集中式 Redux selector
 *
 * 跨 slice 派生值统一在这里定义，组件不再重复计算。
 */

import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';

// ==================== 认证 ====================

/** 当前用户是否已登录 */
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;

// ==================== 模型 ====================

/** 全局选中的模型 ID */
export const selectSelectedModelId = (state: RootState) => state.models.selectedModelId;

/** 全部模型列表 */
export const selectModels = (state: RootState) => state.models.models;

/** 全局选中的模型对象（组合 models + selectedModelId） */
export const selectSelectedModel = createSelector(
  [selectModels, selectSelectedModelId],
  (models, selectedModelId) =>
    selectedModelId ? models.find((m) => m.id === selectedModelId) ?? null : null,
);

/**
 * 获取对话关联的模型对象。
 * 优先用对话自身的 model_id，无对话时回退到全局 selectedModelId。
 *
 * 用法：
 *   const model = useAppSelector(state => selectChatModel(state, chatId));
 */
export const selectChatModel = (state: RootState, chatId: string | null | undefined) => {
  const models = state.models.models;
  const chat = chatId ? state.conversation.byId[chatId] : undefined;
  const modelId = chat?.model_id ?? state.models.selectedModelId;
  return modelId ? models.find((m) => m.id === modelId) ?? null : null;
};

/** 模型显示名称，找不到时返回 'AI' */
export const selectSelectedModelName = createSelector(
  [selectSelectedModel],
  (model) => model?.name ?? 'AI',
);
