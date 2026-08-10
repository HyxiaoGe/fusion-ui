import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchMock, pathnameMock, modelsStateMock, conversationStateMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  pathnameMock: vi.fn(),
  modelsStateMock: {
    current: {
      selectedModelId: 'search-model',
      providers: [{ id: 'provider-a', name: 'Provider A', order: 1 }],
      models: [
        {
          id: 'search-model',
          name: 'Search Model',
          provider: 'provider-a',
          enabled: true,
          contextWindowTokens: 128000,
          capabilities: {
            searchCapable: true,
            agentTools: true,
            webSearch: true,
            vision: true,
            deepThinking: true,
          },
        },
        {
          id: 'plain-model',
          name: 'Plain Model',
          provider: 'provider-a',
          enabled: true,
          capabilities: {
            searchCapable: false,
            agentTools: false,
            functionCalling: true,
            vision: false,
            deepThinking: false,
          },
        },
        {
          id: 'hidden-model',
          name: 'Hidden Model',
          provider: 'provider-a',
          enabled: true,
          selectable: false,
          routable: true,
          capabilities: {},
        },
        {
          id: 'unhealthy-model',
          name: 'Unhealthy Model',
          provider: 'provider-a',
          enabled: true,
          selectable: true,
          routable: true,
          health: { status: 'unhealthy', error: '模型已下线' },
          capabilities: {},
        },
      ],
    } as any,
  },
  conversationStateMock: {
    current: {
      byId: {},
      hydrationStatus: {},
    } as any,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({
      models: modelsStateMock.current,
      conversation: conversationStateMock.current,
    }),
}));

vi.mock('./ProviderIcon', () => ({
  default: ({ providerId }: { providerId: string }) => <span aria-hidden="true">{providerId}</span>,
}));

import ModelSelector from './ModelSelector';

describe('ModelSelector 集成渲染', () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    pathnameMock.mockReturnValue('/chat/new');
    modelsStateMock.current = {
      selectedModelId: 'search-model',
      loadStatus: 'ready',
      providers: [{ id: 'provider-a', name: 'Provider A', order: 1 }],
      models: [
        {
          id: 'search-model',
          name: 'Search Model',
          provider: 'provider-a',
          enabled: true,
          contextWindowTokens: 128000,
          capabilities: {
            searchCapable: true,
            agentTools: true,
            webSearch: true,
            vision: true,
            deepThinking: true,
          },
        },
        {
          id: 'plain-model',
          name: 'Plain Model',
          provider: 'provider-a',
          enabled: true,
          capabilities: {
            searchCapable: false,
            agentTools: false,
            functionCalling: true,
            vision: false,
            deepThinking: false,
          },
        },
        {
          id: 'hidden-model',
          name: 'Hidden Model',
          provider: 'provider-a',
          enabled: true,
          selectable: false,
          routable: true,
          capabilities: {},
        },
        {
          id: 'unhealthy-model',
          name: 'Unhealthy Model',
          provider: 'provider-a',
          enabled: true,
          selectable: true,
          routable: true,
          health: { status: 'unhealthy', error: '模型已下线' },
          capabilities: {},
        },
      ],
    };
    conversationStateMock.current = {
      byId: {},
      hydrationStatus: {},
    };
  });

  it('/chat/new 可以渲染模型按钮并打开能力标签面板', () => {
    render(<ModelSelector />);

    const trigger = screen.getByRole('button', { name: /Search Model/ });
    expect(trigger).toHaveAttribute('data-testid', 'model-selector-trigger');
    expect(trigger).not.toHaveAttribute('title');
    expect(trigger).toHaveTextContent('可联网');
    expect(trigger).toHaveTextContent('读图');
    expect(trigger).toHaveTextContent('长上下文');

    fireEvent.click(trigger);

    expect(screen.getByTestId('model-selector-panel')).toBeInTheDocument();
    expect(screen.getAllByText('可联网')).toHaveLength(2);
    expect(screen.getAllByText('不可联网')).toHaveLength(2);
    expect(screen.getAllByText('读图')).toHaveLength(2);
    expect(screen.getAllByText('长上下文')).toHaveLength(2);
    expect(screen.getByText('深度任务')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Model')).toBeNull();
    expect(screen.getByRole('button', { name: /Unhealthy Model/ })).toBeDisabled();
  });

  it('目录只有隐藏模型时直接显示不可用，不打开空选择面板', () => {
    modelsStateMock.current = {
      selectedModelId: null,
      loadStatus: 'ready',
      providers: [{ id: 'provider-a', name: 'Provider A', order: 1 }],
      models: [
        {
          id: 'hidden-model',
          name: 'Hidden Model',
          provider: 'provider-a',
          enabled: true,
          selectable: false,
          routable: true,
          capabilities: {},
        },
      ],
    };

    render(<ModelSelector />);

    expect(screen.getByRole('button', { name: '模型不可用' })).toBeDisabled();
    expect(screen.queryByTestId('model-selector-panel')).toBeNull();
  });

  it('toolbarMode 在窄屏隐藏 provider 和能力标签，sm 恢复桌面信息', () => {
    render(<ModelSelector toolbarMode />);

    const trigger = screen.getByTestId('model-selector-trigger');
    expect(trigger).toHaveClass('h-8', 'w-[112px]', 'sm:h-[66px]', 'sm:w-64');
    expect(screen.getByTestId('model-selector-provider')).toHaveClass('hidden', 'sm:block');
    expect(screen.getByTestId('model-selector-capabilities')).toHaveClass('hidden', 'sm:block');
    expect(screen.getByText('Search Model')).toHaveClass('max-w-[64px]', 'sm:max-w-[140px]');
  });

  it('模型目录尚未加载时保留同尺寸且不可操作的选择器', () => {
    modelsStateMock.current = {
      selectedModelId: null,
      loadStatus: 'loading',
      providers: [],
      models: [],
    };

    render(<ModelSelector toolbarMode />);

    const trigger = screen.getByRole('button', { name: '模型加载中' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveClass('h-8', 'w-[112px]', 'sm:h-[66px]', 'sm:w-64');
  });

  it('已有会话水合完成前不回退显示全局默认模型', () => {
    pathnameMock.mockReturnValue('/chat/chat-1');
    conversationStateMock.current = {
      byId: {},
      hydrationStatus: { 'chat-1': 'loading' },
    };

    const { rerender } = render(<ModelSelector toolbarMode />);

    expect(screen.getByRole('button', { name: '模型加载中' })).toBeDisabled();
    expect(screen.queryByText('Search Model')).toBeNull();

    conversationStateMock.current = {
      byId: {
        'chat-1': {
          id: 'chat-1',
          model_id: 'plain-model',
          messages: [{ id: 'message-1', role: 'user' }],
        },
      },
      hydrationStatus: { 'chat-1': 'done' },
    };
    rerender(<ModelSelector toolbarMode />);

    expect(screen.getByRole('button', { name: /Plain Model/ })).toBeDisabled();
    expect(screen.queryByText('Search Model')).toBeNull();
  });
});
