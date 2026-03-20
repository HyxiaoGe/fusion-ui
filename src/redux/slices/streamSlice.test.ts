import { describe, expect, it } from 'vitest';

import reducer, {
  migrateStreamConversation,
  startStream,
  startStreamingReasoning,
  updateStreamContent,
  updateStreamReasoning,
} from './streamSlice';

describe('streamSlice', () => {
  it('migrates stream ownership without resetting active stream state', () => {
    let state = reducer(
      undefined,
      startStream({ conversationId: 'temp-conv', messageId: 'assistant-1' })
    );
    state = reducer(state, startStreamingReasoning());
    state = reducer(state, updateStreamReasoning('thinking'));
    state = reducer(state, updateStreamContent('answer'));

    const nextState = reducer(state, migrateStreamConversation('server-conv'));

    expect(nextState.conversationId).toBe('server-conv');
    expect(nextState.messageId).toBe('assistant-1');
    expect(nextState.isStreaming).toBe(true);
    expect(nextState.reasoning).toBe('thinking');
    expect(nextState.content).toBe('answer');
  });
});
