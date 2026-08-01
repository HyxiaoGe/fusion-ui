import type { RootState } from '@/redux/store';
import type { Model } from '@/redux/slices/modelsSlice';

export type SendModelResolution =
  | { status: 'ready'; model: Model }
  | { status: 'conversation_not_ready' }
  | { status: 'conversation_model_unavailable' }
  | { status: 'no_enabled_model' };

export function isModelAvailableForSending(model: Model): boolean {
  return model.enabled !== false && model.health?.status !== 'unhealthy';
}

export function resolveSendModel(
  state: Pick<RootState, 'conversation' | 'models'>,
  conversationId: string | null,
): SendModelResolution {
  if (conversationId !== null) {
    const conversationModelId = state.conversation.byId[conversationId]?.model_id;
    if (!conversationModelId) {
      return { status: 'conversation_not_ready' };
    }

    const conversationModel = state.models.models.find(
      (model) => model.id === conversationModelId && isModelAvailableForSending(model),
    );
    return conversationModel
      ? { status: 'ready', model: conversationModel }
      : { status: 'conversation_model_unavailable' };
  }

  const selectedModel = state.models.models.find(
    (model) => (
      model.id === state.models.selectedModelId
      && isModelAvailableForSending(model)
    ),
  );
  const fallbackModel = selectedModel
    ?? state.models.models.find(isModelAvailableForSending);
  return fallbackModel
    ? { status: 'ready', model: fallbackModel }
    : { status: 'no_enabled_model' };
}

export function getSendModelErrorMessage(
  resolution: Exclude<SendModelResolution, { status: 'ready'; model: Model }>,
): string {
  if (resolution.status === 'conversation_not_ready') {
    return '对话尚未加载完成，请稍后重试';
  }
  if (resolution.status === 'conversation_model_unavailable') {
    return '该对话使用的模型当前不可用，请新建对话并选择其他模型';
  }
  return '没有可用的模型，请先在设置中启用一个模型';
}
