import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchWithAuthMock,
} = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('./fetchWithAuth', () => ({
  default: fetchWithAuthMock,
}));

import { getConversation, sendMessageStream } from './chat';

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

  it('surfaces backend detail when fetching a conversation fails', async () => {
    fetchWithAuthMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: '对话不存在或无权访问' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    await expect(getConversation('missing-chat')).rejects.toThrow('对话不存在或无权访问');
  });
});
