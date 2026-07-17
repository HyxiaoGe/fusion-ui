'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface ChatDetailOverlayContextValue {
  hasOpenDetailOverlay: boolean;
  registerDetailOverlay: (overlayId: symbol) => () => void;
}

const DEFAULT_CONTEXT: ChatDetailOverlayContextValue = {
  hasOpenDetailOverlay: false,
  registerDetailOverlay: () => () => undefined,
};

const ChatDetailOverlayContext = createContext<ChatDetailOverlayContextValue>(DEFAULT_CONTEXT);

export function ChatDetailOverlayProvider({ children }: { children: ReactNode }) {
  const [openOverlayIds, setOpenOverlayIds] = useState<Set<symbol>>(() => new Set());

  const registerDetailOverlay = useCallback((overlayId: symbol) => {
    setOpenOverlayIds((current) => {
      if (current.has(overlayId)) return current;
      const next = new Set(current);
      next.add(overlayId);
      return next;
    });

    return () => {
      setOpenOverlayIds((current) => {
        if (!current.has(overlayId)) return current;
        const next = new Set(current);
        next.delete(overlayId);
        return next;
      });
    };
  }, []);

  const value = useMemo(() => ({
    hasOpenDetailOverlay: openOverlayIds.size > 0,
    registerDetailOverlay,
  }), [openOverlayIds.size, registerDetailOverlay]);

  return (
    <ChatDetailOverlayContext.Provider value={value}>
      {children}
    </ChatDetailOverlayContext.Provider>
  );
}

export function useHasOpenChatDetailOverlay(): boolean {
  return useContext(ChatDetailOverlayContext).hasOpenDetailOverlay;
}

export function useChatDetailOverlayRegistration(isOpen: boolean): void {
  const { registerDetailOverlay } = useContext(ChatDetailOverlayContext);
  const [overlayId] = useState(() => Symbol('chat-detail-overlay'));

  useLayoutEffect(() => {
    if (!isOpen) return;
    return registerDetailOverlay(overlayId);
  }, [isOpen, overlayId, registerDetailOverlay]);
}
