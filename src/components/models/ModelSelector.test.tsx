import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDispatch,
  mockUsePathname,
  mockSetSelectedModel,
  mockUpdateConversationModel,
  mockAddRecentModel,
  mockGetRecentModels,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockUsePathname: vi.fn(),
  mockSetSelectedModel: vi.fn((payload: string) => ({ type: 'models/setSelectedModel', payload })),
  mockUpdateConversationModel: vi.fn((payload: { id: string; model_id: string }) => ({
    type: 'conversation/updateConversationModel',
    payload,
  })),
  mockAddRecentModel: vi.fn(),
  mockGetRecentModels: vi.fn(() => [] as string[]),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({
      models: {
        selectedModelId: 'model-a',
        providers: [{ id: 'provider-a', name: 'Provider A', order: 1 }],
        models: [
          {
            id: 'model-a',
            name: '模型 A',
            provider: 'provider-a',
            enabled: true,
            capabilities: { agentTools: true, webSearch: true, vision: true, deepThinking: true },
          },
          {
            id: 'model-b',
            name: '模型 B',
            provider: 'provider-a',
            enabled: true,
            capabilities: { agentTools: false, functionCalling: true, vision: false, deepThinking: false },
          },
        ],
      },
      conversation: {
        byId: {
          new: {
            id: 'new',
            model_id: 'model-a',
            messages: [{ id: 'message-1', role: 'user' }],
          },
        },
      },
    }),
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  setSelectedModel: mockSetSelectedModel,
}));

vi.mock('@/redux/slices/conversationSlice', () => ({
  updateConversationModel: mockUpdateConversationModel,
}));

vi.mock('@/lib/models/recentModels', () => ({
  getRecentModels: mockGetRecentModels,
  addRecentModel: mockAddRecentModel,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./ModelSelectorTrigger', () => ({
  default: ({ disabled, title }: { disabled?: boolean; title?: string }) => (
    <button type="button" disabled={disabled} title={title}>
      选择模型
    </button>
  ),
}));

vi.mock('./ModelSelectorPanel', () => ({
  default: ({ onSelect }: { onSelect: (modelId: string) => void }) => (
    <button type="button" onClick={() => onSelect('model-b')}>
      模型 B
    </button>
  ),
}));

import ModelSelector from './ModelSelector';

describe('ModelSelector 路由语义', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockSetSelectedModel.mockClear();
    mockUpdateConversationModel.mockClear();
    mockAddRecentModel.mockClear();
    mockGetRecentModels.mockClear();
    mockGetRecentModels.mockReturnValue([]);
    mockUsePathname.mockReturnValue('/chat/new');
  });

  it('在 /chat/new 且 Redux 存在 byId.new.messages 时仍可选择模型且不更新 id 为 new 的会话', () => {
    render(<ModelSelector />);

    expect(screen.getByRole('button', { name: '选择模型' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '模型 B' }));

    expect(mockSetSelectedModel).toHaveBeenCalledWith('model-b');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'models/setSelectedModel', payload: 'model-b' });
    expect(mockUpdateConversationModel).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'conversation/updateConversationModel',
      payload: { id: 'new', model_id: 'model-b' },
    });
  });

  it('给模型按钮传递当前模型能力说明 tooltip 文案', () => {
    render(<ModelSelector />);

    const trigger = screen.getByRole('button', { name: '选择模型' });
    expect(trigger).toHaveAttribute('title', expect.stringContaining('可按问题需要自主联网搜索和读取关键来源'));
    expect(trigger).toHaveAttribute('title', expect.stringContaining('支持图片理解'));
  });
});
