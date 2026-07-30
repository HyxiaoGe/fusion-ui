import type { ComposerAgentMode } from '@/types/agentRun';

const STORAGE_KEY = 'fusion:composer-agent-mode';
const VALID_MODES = new Set<ComposerAgentMode>(['auto', 'plan', 'deep_research']);

export function readComposerAgentMode(): ComposerAgentMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return VALID_MODES.has(value as ComposerAgentMode)
      ? value as ComposerAgentMode
      : null;
  } catch {
    return null;
  }
}

export function writeComposerAgentMode(mode: ComposerAgentMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 当前标签页存储不可用时仍由 Redux 维持本次选择，不阻断用户操作。
  }
}
