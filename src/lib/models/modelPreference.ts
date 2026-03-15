import { ModelInfo } from '@/lib/config/modelConfig';

export const getPreferredModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled'>[],
  requestedModelId?: string | null,
): string | null => {
  const requestedModel = requestedModelId ? models.find((model) => model.id === requestedModelId) : null;

  if (requestedModel?.enabled) {
    return requestedModel.id;
  }

  const firstEnabledModel = models.find((model) => model.enabled);
  if (firstEnabledModel) {
    return firstEnabledModel.id;
  }

  return models[0]?.id ?? null;
};
