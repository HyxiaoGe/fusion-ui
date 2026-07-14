import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchMock, pathnameMock, modelsStateMock } = vi.hoisted(() => ({
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
      ],
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
      conversation: {
        byId: {},
      },
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
      ],
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
    expect(screen.getByText('不可联网')).toBeInTheDocument();
    expect(screen.getAllByText('读图')).toHaveLength(2);
    expect(screen.getAllByText('长上下文')).toHaveLength(2);
    expect(screen.getByText('深度任务')).toBeInTheDocument();
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
      providers: [],
      models: [],
    };

    render(<ModelSelector toolbarMode />);

    const trigger = screen.getByRole('button', { name: '模型加载中' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveClass('h-8', 'w-[112px]', 'sm:h-[66px]', 'sm:w-64');
  });
});
