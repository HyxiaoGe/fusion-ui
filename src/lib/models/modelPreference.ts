import { ModelInfo } from '@/lib/config/modelConfig';

export const getPreferredModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled' | 'selectable'>[],
  requestedModelId?: string | null,
): string | null => {
  const requestedModel = requestedModelId ? models.find((model) => model.id === requestedModelId) : null;

  if (requestedModel && isModelSelectable(requestedModel)) {
    return requestedModel.id;
  }

  return getDefaultModelId(models);
};

export const getFirstEnabledModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled' | 'selectable'>[],
): string | null => {
  const firstEnabledModel = models.find(isModelSelectable);
  return firstEnabledModel?.id ?? null;
};

export const getDefaultModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled' | 'selectable'>[],
): string | null => {
  return getFirstEnabledModelId(models);
};

export const isModelSelectable = (
  model: Pick<ModelInfo, 'enabled' | 'selectable'>,
): boolean => {
  return model.enabled !== false && model.selectable !== false;
};
