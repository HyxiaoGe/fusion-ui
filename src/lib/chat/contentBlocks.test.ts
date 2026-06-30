import { describe, expect, it } from 'vitest';

import {
  recoverReasoningOnlyFinalBlocks,
  shouldRecoverReasoningOnlyFinalBlocks,
} from './contentBlocks';
import type { ContentBlock } from '@/types/conversation';

describe('contentBlocks', () => {
  it('有正文时保留原始 blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', id: 'thinking-1', thinking: '先分析' },
      { type: 'text', id: 'text-1', text: '最终回答' },
    ];

    expect(recoverReasoningOnlyFinalBlocks(blocks)).toBe(blocks);
  });

  it('reasoning-only 完成内容恢复为正文', () => {
    expect(recoverReasoningOnlyFinalBlocks([
      { type: 'thinking', id: 'thinking-1', thinking: '你好！我是 DeepSeek。' },
    ])).toEqual([
      { type: 'text', id: 'recovered-thinking-1', text: '你好！我是 DeepSeek。' },
    ]);
  });

  it('只允许正常 completed run 启用 reasoning-only 恢复', () => {
    expect(shouldRecoverReasoningOnlyFinalBlocks({
      runStatus: 'completed',
      messageMatches: true,
    })).toBe(true);
    expect(shouldRecoverReasoningOnlyFinalBlocks({
      runStatus: 'running',
      messageMatches: true,
    })).toBe(false);
    expect(shouldRecoverReasoningOnlyFinalBlocks({
      runStatus: 'completed',
      messageMatches: false,
    })).toBe(false);
  });
});
