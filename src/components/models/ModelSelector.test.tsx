import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelSelector from './ModelSelector';

const { useAppSelectorMock, useAppDispatchMock } = vi.hoisted(() => ({
  useAppSelectorMock: vi.fn(),
  useAppDispatchMock: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
  useAppDispatch: () => useAppDispatchMock,
}));

vi.mock('@/redux/slices/chatSlice', () => ({
  updateChatModel: (payload: unknown) => ({ type: 'chat/updateChatModel', payload }),
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  setSelectedModel: (payload: unknown) => ({ type: 'models/setSelectedModel', payload }),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <div data-disabled={disabled ? 'true' : 'false'}>{children}</div>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ModelSelector', () => {
  beforeEach(() => {
    useAppDispatchMock.mockReset();
  });

  it('surfaces an unavailable active chat model clearly', () => {
    const state = {
      models: {
        models: [
          { id: 'qwen3', name: 'Qwen3', provider: 'qwen', enabled: true, capabilities: {}, temperature: 0.7 },
          { id: 'legacy', name: 'Legacy', provider: 'qwen', enabled: false, capabilities: {}, temperature: 0.7 },
        ],
        providers: [{ id: 'qwen', name: '通义千问', order: 1 }],
        selectedModelId: 'qwen3',
        isLoading: false,
      },
      chat: {
        activeChatId: 'chat-1',
        chats: [{ id: 'chat-1', model: 'legacy', messages: [{ id: 'm1', role: 'user', content: 'hi' }] }],
      },
      theme: { mode: 'light' },
    };

    useAppSelectorMock.mockImplementation((selector: (state: typeof state) => unknown) => selector(state));

    render(<ModelSelector onChange={() => {}} />);

    expect(screen.getAllByText('Legacy').length).toBeGreaterThan(0);
    expect(screen.getByText('当前不可用')).toBeTruthy();
    expect(screen.getByText('建议新建会话切换')).toBeTruthy();
  });

  it('marks the stable default enabled model as recommended', () => {
    const state = {
      models: {
        models: [
          { id: 'qwen3', name: 'Qwen3', provider: 'qwen', enabled: true, capabilities: {}, temperature: 0.7 },
          { id: 'qwen-max', name: 'Qwen Max', provider: 'qwen', enabled: true, capabilities: {}, temperature: 0.7 },
        ],
        providers: [{ id: 'qwen', name: '通义千问', order: 1 }],
        selectedModelId: 'qwen-max',
        isLoading: false,
      },
      chat: {
        activeChatId: null,
        chats: [],
      },
      theme: { mode: 'light' },
    };

    useAppSelectorMock.mockImplementation((selector: (state: typeof state) => unknown) => selector(state));

    render(<ModelSelector onChange={() => {}} />);

    expect(screen.getByText('推荐')).toBeTruthy();
    expect(screen.getByText('Qwen3')).toBeTruthy();
  });
});
