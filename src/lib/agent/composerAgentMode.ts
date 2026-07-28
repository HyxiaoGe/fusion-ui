import type { ModelCapability } from '@/lib/config/modelConfig';
import type {
  AgentPlanMode,
  AgentTaskMode,
  ComposerAgentMode,
} from '@/types/agentRun';

export interface ComposerAgentModeAvailability {
  enabled: boolean;
  unavailableReason?: string;
}

export interface ComposerAgentModeResolution {
  requestedMode: ComposerAgentMode;
  effectiveMode: ComposerAgentMode;
  planMode: Extract<AgentPlanMode, 'auto' | 'on'>;
  taskMode: AgentTaskMode;
  fallbackReason?: string;
}

export const COMPOSER_AGENT_MODE_LABELS: Record<ComposerAgentMode, string> = {
  auto: '自动',
  plan: '计划',
  deep_research: '深度研究',
};

export function getComposerAgentModeAvailability(
  mode: ComposerAgentMode,
  capabilities: ModelCapability | null | undefined,
): ComposerAgentModeAvailability {
  if (mode === 'auto') {
    return { enabled: true };
  }

  if (!capabilities?.functionCalling) {
    return {
      enabled: false,
      unavailableReason: mode === 'plan'
        ? '当前模型不支持工具调用'
        : '深度研究需要支持工具调用与联网工具',
    };
  }

  if (
    mode === 'deep_research'
    && capabilities.searchCapable !== true
  ) {
    return {
      enabled: false,
      unavailableReason: '深度研究需要支持联网工具',
    };
  }

  return { enabled: true };
}

export function resolveComposerAgentMode(
  requestedMode: ComposerAgentMode,
  capabilities: ModelCapability | null | undefined,
): ComposerAgentModeResolution {
  const availability = getComposerAgentModeAvailability(requestedMode, capabilities);
  if (!availability.enabled) {
    return {
      requestedMode,
      effectiveMode: 'auto',
      planMode: 'auto',
      taskMode: 'standard',
      fallbackReason: availability.unavailableReason,
    };
  }

  if (requestedMode === 'deep_research') {
    return {
      requestedMode,
      effectiveMode: requestedMode,
      planMode: 'on',
      taskMode: 'deep_research',
    };
  }

  return {
    requestedMode,
    effectiveMode: requestedMode,
    planMode: requestedMode === 'plan' ? 'on' : 'auto',
    taskMode: 'standard',
  };
}
