import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchWithAuthMock,
  dispatchMock,
  getStateMock,
  startStreamingReasoningMock,
  endStreamingReasoningMock,
  setStreamingReasoningMessageIdMock,
} = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  dispatchMock: vi.fn(),
  getStateMock: vi.fn(() => ({
    chat: {
      streamingReasoningMessageId: null,
    },
  })),
  startStreamingReasoningMock: vi.fn(() => ({ type: 'chat/startStreamingReasoning' })),
  endStreamingReasoningMock: vi.fn(() => ({ type: 'chat/endStreamingReasoning' })),
  setStreamingReasoningMessageIdMock: vi.fn((messageId: string) => ({
    type: 'chat/setStreamingReasoningMessageId',
    payload: messageId,
  })),
}));

vi.mock('./fetchWithAuth', () => ({
  default: fetchWithAuthMock,
}));

vi.mock('../../redux/store', () => ({
  store: {
    dispatch: dispatchMock,
    getState: getStateMock,
  },
}));

vi.mock('../../redux/slices/chatSlice', () => ({
  startStreamingReasoning: startStreamingReasoningMock,
  endStreamingReasoning: endStreamingReasoningMock,
  setStreamingReasoningMessageId: setStreamingReasoningMessageIdMock,
}));

import { sendMessageStream } from './chat';

function createStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

describe('sendMessageStream', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    dispatchMock.mockReset();
    getStateMock.mockReset();
    getStateMock.mockReturnValue({
      chat: {
        streamingReasoningMessageId: null,
      },
    });
    startStreamingReasoningMock.mockClear();
    endStreamingReasoningMock.mockClear();
    setStreamingReasoningMessageIdMock.mockClear();
  });

  it('parses reasoning, answer and done events from SSE stream', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"type":"reasoning_start","conversation_id":"conv-1","message_id":"reason-1"}\n\n',
        'data: {"type":"reasoning_content","conversation_id":"conv-1","content":"step ","message_id":"reason-1"}\n\n',
        'data: {"type":"answering_content","conversation_id":"conv-1","content":"answer","message_id":"assistant-1"}\n\n',
        'data: {"type":"done","conversation_id":"conv-1"}\n\n',
      ])
    );
    const onChunk = vi.fn();

    await sendMessageStream(
      {
        provider: 'qwen',
        model: 'qwen-max-latest',
        message: 'hello',
        conversation_id: 'conv-1',
      },
      onChunk
    );

    expect(setStreamingReasoningMessageIdMock).toHaveBeenCalledWith('reason-1');
    expect(startStreamingReasoningMock).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenNthCalledWith(1, '', false, 'conv-1', 'step ');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'answer', false, 'conv-1', 'step ');
    expect(onChunk).toHaveBeenNthCalledWith(3, 'answer', true, 'conv-1', 'step ');
  });

  it('supports partial SSE chunks and falls back to implicit done on stream end', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"type":"answering_content","conversation_id":"conv-2","content":"hel',
        'lo","message_id":"assistant-2"}\n\n',
      ])
    );
    const onChunk = vi.fn();

    await sendMessageStream(
      {
        provider: 'qwen',
        model: 'qwen-max-latest',
        message: 'hello',
        conversation_id: 'conv-2',
      },
      onChunk
    );

    expect(onChunk).toHaveBeenNthCalledWith(1, 'hello', false, 'conv-2', '');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'hello', true, 'conv-2', '');
  });
});
