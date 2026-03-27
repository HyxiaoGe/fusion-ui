import { describe, expect, it } from 'vitest';

import reducer, {
  advanceTypewriter,
  appendTextDelta,
  appendThinkingDelta,
  endStream,
  migrateStreamConversation,
  selectFullStreamContentBlocks,
  selectStreamContentBlocks,
  setStreamStatus,
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

  it('assembles full content blocks via selectFullStreamContentBlocks', () => {
    let state = reducer(
      undefined,
      startStream({ conversationId: 'conv-1', messageId: 'msg-1' })
    );
    state = reducer(state, appendThinkingDelta({ blockId: 'blk_think', delta: 'let me ' }));
    state = reducer(state, appendThinkingDelta({ blockId: 'blk_think', delta: 'think' }));
    state = reducer(state, appendTextDelta({ blockId: 'blk_text', delta: 'hello' }));

    const blocks = selectFullStreamContentBlocks(state);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: 'thinking', id: 'blk_think', thinking: 'let me think' });
    expect(blocks[1]).toEqual({ type: 'text', id: 'blk_text', text: 'hello' });
  });

  it('truncates text blocks by displayedTextLength in selectStreamContentBlocks', () => {
    let state = reducer(
      undefined,
      startStream({ conversationId: 'conv-1', messageId: 'msg-1' })
    );
    state = reducer(state, appendTextDelta({ blockId: 'blk_text', delta: 'hello world' }));

    // 未推进显示进度 → 文本被截断为空
    expect(selectStreamContentBlocks(state)[0]).toEqual(
      expect.objectContaining({ type: 'text', text: '' })
    );

    // 推进 5 字符
    state = reducer(state, advanceTypewriter(5));
    expect(selectStreamContentBlocks(state)[0]).toEqual(
      expect.objectContaining({ type: 'text', text: 'hello' })
    );

    // 推进到完整长度
    state = reducer(state, advanceTypewriter(100));
    expect(selectStreamContentBlocks(state)[0]).toEqual(
      expect.objectContaining({ type: 'text', text: 'hello world' })
    );
  });

  it('streamStatus defaults to idle and resets on endStream', () => {
    const initial = reducer(undefined, { type: '@@INIT' });
    expect(initial.streamStatus).toBe('idle');

    let state = reducer(initial, setStreamStatus('reconnecting'));
    expect(state.streamStatus).toBe('reconnecting');

    state = reducer(state, endStream());
    expect(state.streamStatus).toBe('idle');
  });
});
