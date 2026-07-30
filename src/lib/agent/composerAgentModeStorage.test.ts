import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readComposerAgentMode,
  writeComposerAgentMode,
} from './composerAgentModeStorage';

describe('composerAgentModeStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('在当前标签页保存并恢复执行模式', () => {
    writeComposerAgentMode('deep_research');

    expect(readComposerAgentMode()).toBe('deep_research');
  });

  it('忽略非法或缺失的执行模式', () => {
    sessionStorage.setItem('fusion:composer-agent-mode', 'invalid-mode');
    expect(readComposerAgentMode()).toBeNull();

    sessionStorage.clear();
    expect(readComposerAgentMode()).toBeNull();
  });

  it('存储读取受限时安全回退为空', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => readComposerAgentMode()).not.toThrow();
    expect(readComposerAgentMode()).toBeNull();
  });

  it('存储写入受限时不把异常抛给模式切换流程', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => writeComposerAgentMode('plan')).not.toThrow();
  });
});
