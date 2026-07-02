import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchMock, pathnameMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  pathnameMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({
      models: {
        selectedModelId: 'search-model',
        providers: [{ id: 'provider-a', name: 'Provider A', order: 1 }],
        models: [
          {
            id: 'search-model',
            name: 'Search Model',
            provider: 'provider-a',
            enabled: true,
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
      },
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
  });

  it('/chat/new 可以渲染模型按钮并打开能力标签面板', () => {
    render(<ModelSelector />);

    const trigger = screen.getByRole('button', { name: /Search Model/ });
    expect(trigger).toHaveAttribute('title', expect.stringContaining('可按问题需要自主联网搜索和读取关键来源'));

    fireEvent.click(trigger);

    expect(screen.getByText('可联网')).toBeInTheDocument();
    expect(screen.getByText('不可联网')).toBeInTheDocument();
    expect(screen.getByText('视觉')).toBeInTheDocument();
    expect(screen.getByText('深度任务')).toBeInTheDocument();
  });
});
