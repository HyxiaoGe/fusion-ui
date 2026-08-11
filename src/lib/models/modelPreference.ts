import { ModelInfo } from '@/lib/config/modelConfig';

export const getPreferredModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled' | 'selectable' | 'routable' | 'health'>[],
  requestedModelId?: string | null,
): string | null => {
  const requestedModel = requestedModelId ? models.find((model) => model.id === requestedModelId) : null;

  if (requestedModel && isModelSelectable(requestedModel)) {
    return requestedModel.id;
  }

  return getDefaultModelId(models);
};

export const getFirstEnabledModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled' | 'selectable' | 'routable' | 'health'>[],
): string | null => {
  const firstEnabledModel = models.find(isModelSelectable);
  return firstEnabledModel?.id ?? null;
};

export const getDefaultModelId = (
  models: Pick<ModelInfo, 'id' | 'enabled' | 'selectable' | 'routable' | 'health'>[],
): string | null => {
  return getFirstEnabledModelId(models);
};

export const isModelSelectable = (
  model: Pick<ModelInfo, 'enabled' | 'selectable' | 'routable' | 'health'>,
): boolean => {
  return (
    isModelVisibleInSelector(model)
    && model.health?.status !== 'unhealthy'
  );
};

export const isModelVisibleInSelector = (
  model: Pick<ModelInfo, 'enabled' | 'selectable' | 'routable'>,
): boolean => (
  model.enabled !== false
  && model.selectable !== false
  && model.routable !== false
);
