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

  it('parses content deltas and completes on done marker', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"id":"assistant-1","conversation_id":"conv-1","choices":[{"index":0,"delta":{"content":"hel"},"finish_reason":null}]}\n\n',
        'data: {"id":"assistant-1","conversation_id":"conv-1","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const callbacks = {
      onReady: vi.fn(),
      onContent: vi.fn(),
      onReasoning: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await sendMessageStream(
      {
        provider: 'qwen',
        model: 'qwen-max-latest',
        message: 'hello',
        conversation_id: 'conv-1',
      },
      callbacks
    );

    expect(callbacks.onReady).toHaveBeenCalledWith({
      messageId: 'assistant-1',
      conversationId: 'conv-1',
    });
    expect(callbacks.onContent).toHaveBeenNthCalledWith(1, 'hel', {
      messageId: 'assistant-1',
      conversationId: 'conv-1',
    });
    expect(callbacks.onContent).toHaveBeenNthCalledWith(2, 'lo', {
      messageId: 'assistant-1',
      conversationId: 'conv-1',
    });
    expect(callbacks.onDone).toHaveBeenCalledWith('assistant-1', 'conv-1', 'hello', '');
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('parses reasoning deltas before content and completes with accumulated values', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"id":"assistant-2","conversation_id":"conv-2","choices":[{"index":0,"delta":{"reasoning_content":"think "},"finish_reason":null}]}\n\n',
        'data: {"id":"assistant-2","conversation_id":"conv-2","choices":[{"index":0,"delta":{"content":"answer"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const callbacks = {
      onReady: vi.fn(),
      onContent: vi.fn(),
      onReasoning: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await sendMessageStream(
      {
        provider: 'qwen',
        model: 'qwen-max-latest',
        message: 'hello',
        conversation_id: 'conv-2',
      },
      callbacks
    );

    expect(callbacks.onReady).toHaveBeenCalledWith({
      messageId: 'assistant-2',
      conversationId: 'conv-2',
    });
    expect(callbacks.onReasoning).toHaveBeenCalledBefore(callbacks.onContent);
    expect(callbacks.onDone).toHaveBeenCalledWith('assistant-2', 'conv-2', 'answer', 'think ');
  });

  it('raises on backend error chunks and does not complete on trailing done markers', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"id":"assistant-3","conversation_id":"conv-3","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
        'data: {"id":"assistant-3","conversation_id":"conv-3","error":{"message":"模型调用超时"},"choices":[{"index":0,"delta":{},"finish_reason":"error"}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const callbacks = {
      onReady: vi.fn(),
      onContent: vi.fn(),
      onReasoning: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await expect(
      sendMessageStream(
        {
          provider: 'qwen',
          model: 'qwen-max-latest',
          message: 'hello',
          conversation_id: 'conv-3',
        },
        callbacks
      )
    ).rejects.toThrow('模型调用超时');

    expect(callbacks.onError).toHaveBeenCalledWith('模型调用超时');
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });

  it('supports partial SSE chunks with buffered parsing', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"id":"assistant-4","conversation_id":"conv-4","choices":[{"index":0,"delta":{"content":"hel',
        'lo"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const callbacks = {
      onReady: vi.fn(),
      onContent: vi.fn(),
      onReasoning: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await sendMessageStream(
      {
        provider: 'qwen',
        model: 'qwen-max-latest',
        message: 'hello',
        conversation_id: 'conv-4',
      },
      callbacks
    );

    expect(callbacks.onContent).toHaveBeenCalledWith('hello', {
      messageId: 'assistant-4',
      conversationId: 'conv-4',
    });
    expect(callbacks.onDone).toHaveBeenCalledWith('assistant-4', 'conv-4', 'hello', '');
  });

  it('skips invalid json lines and continues processing later chunks', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"id":"assistant-5","conversation_id":"conv-5","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
        'data: {"broken-json"\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const callbacks = {
      onReady: vi.fn(),
      onContent: vi.fn(),
      onReasoning: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await sendMessageStream(
      {
        provider: 'qwen',
        model: 'qwen-max-latest',
        message: 'hello',
        conversation_id: 'conv-5',
      },
      callbacks
    );

    expect(callbacks.onContent).toHaveBeenCalledWith('ok', {
      messageId: 'assistant-5',
      conversationId: 'conv-5',
    });
    expect(callbacks.onDone).toHaveBeenCalledWith('assistant-5', 'conv-5', 'ok', '');
  });

  it('treats eof without done marker as an error', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'data: {"id":"assistant-6","conversation_id":"conv-6","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
      ])
    );
    const callbacks = {
      onReady: vi.fn(),
      onContent: vi.fn(),
      onReasoning: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await expect(
      sendMessageStream(
        {
          provider: 'qwen',
          model: 'qwen-max-latest',
          message: 'hello',
          conversation_id: 'conv-6',
        },
        callbacks
      )
    ).rejects.toThrow('流异常结束');

    expect(callbacks.onError).toHaveBeenCalledWith('流异常结束');
    expect(callbacks.onDone).not.toHaveBeenCalled();
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
