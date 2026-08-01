interface ReasoningModelIdentity {
  modelId?: string | null;
  providerId?: string | null;
}

/**
 * Kimi K3 的思考流按 Moonshot 的累计快照协议处理，前端只对这个明确模型放开 Agent 阶段展示。
 */
export function isKimiK3ReasoningModel({
  modelId,
  providerId,
}: ReasoningModelIdentity): boolean {
  const normalizedModelId = modelId?.trim().toLowerCase();
  const normalizedProviderId = providerId?.trim().toLowerCase();

  return normalizedProviderId === 'moonshot'
    && (normalizedModelId === 'kimi-k3' || normalizedModelId === 'moonshot/kimi-k3');
}
