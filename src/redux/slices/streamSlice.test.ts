import { describe, expect, it } from 'vitest';

import reducer, {
  appendTextDelta,
  appendThinkingDelta,
  migrateStreamConversation,
  selectStreamContentBlocks,
  startStream,
} from './streamSlice';

describe('streamSlice', () => {
  it('migrates stream ownership without resetting active stream state', () => {
    let state = reducer(
      undefined,
      startStream({ conversationId: 'temp-conv', messageId: 'assistant-1' })
    );
    state = reducer(state, appendThinkingDelta({ blockId: 'blk_think', delta: 'thinking' }));
    state = reducer(state, appendTextDelta({ blockId: 'blk_text', delta: 'answer' }));

    const nextState = reducer(state, migrateStreamConversation('server-conv'));

    expect(nextState.conversationId).toBe('server-conv');
    expect(nextState.messageId).toBe('assistant-1');
    expect(nextState.isStreaming).toBe(true);
    expect(nextState.thinkingBlocks['blk_think']).toBe('thinking');
    expect(nextState.textBlocks['blk_text']).toBe('answer');
  });

  it('assembles content blocks in correct order via selectStreamContentBlocks', () => {
    let state = reducer(
      undefined,
      startStream({ conversationId: 'conv-1', messageId: 'msg-1' })
    );
    state = reducer(state, appendThinkingDelta({ blockId: 'blk_think', delta: 'let me ' }));
    state = reducer(state, appendThinkingDelta({ blockId: 'blk_think', delta: 'think' }));
    state = reducer(state, appendTextDelta({ blockId: 'blk_text', delta: 'hello' }));

    const blocks = selectStreamContentBlocks(state);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: 'thinking', id: 'blk_think', thinking: 'let me think' });
    expect(blocks[1]).toEqual({ type: 'text', id: 'blk_text', text: 'hello' });
  });
});
