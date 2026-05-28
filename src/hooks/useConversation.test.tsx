import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import conversationReducer from '@/redux/slices/conversationSlice';
import { useConversation } from './useConversation';

const { getConversationMock } = vi.hoisted(() => ({
  getConversationMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  getConversation: getConversationMock,
}));

function createStore() {
  return configureStore({
    reducer: {
      conversation: conversationReducer,
    },
  });
}

function createWrapper(store: ReturnType<typeof createStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(Provider, { store, children })
  );
}

describe('useConversation', () => {
  beforeEach(() => {
    getConversationMock.mockReset();
    getConversationMock.mockReturnValue(new Promise(() => {}));
  });

  it('aborts in-flight hydration and resets status when switching away', async () => {
    const store = createStore();
    const { unmount } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('loading');
    });

    const signal = getConversationMock.mock.calls[0][1] as AbortSignal;

    act(() => {
      unmount();
    });

    expect(signal.aborted).toBe(true);
    expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('idle');
  });
});
