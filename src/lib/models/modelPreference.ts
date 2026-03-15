import { ModelInfo } from '@/lib/config/modelConfig';

export const getPreferredModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled'>[],
  requestedModelId?: string | null,
): string | null => {
  const requestedModel = requestedModelId ? models.find((model) => model.id === requestedModelId) : null;

  if (requestedModel && requestedModel.enabled !== false) {
    return requestedModel.id;
  }

  return getDefaultModelId(models);
};

export const getFirstEnabledModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled'>[],
): string | null => {
  const firstEnabledModel = models.find((model) => model.enabled !== false);
  return firstEnabledModel?.id ?? null;
};

export const getDefaultModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled'>[],
): string | null => {
  const firstEnabledModel = getFirstEnabledModelId(models);
  if (firstEnabledModel) {
    return firstEnabledModel;
  }

  return models[0]?.id ?? null;
};
