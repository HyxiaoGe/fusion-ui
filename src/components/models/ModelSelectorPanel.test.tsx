import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ModelSelectorPanel from './ModelSelectorPanel';
import type { ModelInfo, ProviderInfo } from '@/lib/config/modelConfig';

vi.mock('./ProviderIcon', () => ({
  default: ({ providerId }: { providerId: string }) => <span aria-hidden="true">{providerId}</span>,
}));

const provider: ProviderInfo = {
  id: 'provider-a',
  name: 'Provider A',
  order: 1,
};

const models: ModelInfo[] = [
  {
    id: 'search-model',
    name: 'Search Model',
    provider: 'provider-a',
    temperature: 0.7,
    enabled: true,
    contextWindowTokens: 128000,
    capabilities: {
      searchCapable: true,
      agentTools: true,
      functionCalling: true,
      webSearch: true,
      vision: true,
      deepThinking: true,
    },
  },
  {
    id: 'plain-model',
    name: 'Plain Model',
    provider: 'provider-a',
    temperature: 0.7,
    enabled: true,
    capabilities: {
      searchCapable: false,
      agentTools: false,
      functionCalling: true,
      vision: false,
      deepThinking: false,
    },
  },
];

describe('ModelSelectorPanel', () => {
  it('在模型卡片中展示面向用户的能力标签', () => {
    render(
      <ModelSelectorPanel
        modelsByProvider={[{ ...provider, models }]}
        selectedModelId="search-model"
        recentModelIds={[]}
        allModels={models}
        activeProvider="provider-a"
        onSelect={vi.fn()}
        onProviderChange={vi.fn()}
      />,
    );

    expect(screen.getByText('可联网')).toBeInTheDocument();
    expect(screen.getByText('不可联网')).toBeInTheDocument();
    expect(screen.getByText('读图')).toBeInTheDocument();
    expect(screen.getByText('长上下文')).toBeInTheDocument();
    expect(screen.getByText('深度任务')).toBeInTheDocument();
    expect(screen.getByText('工具')).toBeInTheDocument();
  });

  it('在模型卡片中保留能力分但不内联展示推荐解释', () => {
    render(
      <ModelSelectorPanel
        modelsByProvider={[{ ...provider, models }]}
        selectedModelId="search-model"
        recentModelIds={[]}
        allModels={models}
        activeProvider="provider-a"
        onSelect={vi.fn()}
        onProviderChange={vi.fn()}
      />,
    );

    const searchCard = screen.getByRole('button', { name: /Search Model/ });
    const plainCard = screen.getByRole('button', { name: /Plain Model/ });

    expect(within(searchCard).getByText('能力 100')).toBeInTheDocument();
    expect(within(plainCard).getByText('能力 40')).toBeInTheDocument();
    expect(screen.queryByText('推荐：实时资料、图片和长任务')).not.toBeInTheDocument();
    expect(screen.queryByText('适合：稳定知识与普通对话')).not.toBeInTheDocument();
    expect(screen.queryByText('不支持实时联网，涉及最新信息时会基于已有知识谨慎回答')).not.toBeInTheDocument();

    expect(searchCard).toHaveAttribute('title', expect.stringContaining('推荐：实时资料、图片和长任务'));
    expect(plainCard).toHaveAttribute(
      'title',
      expect.stringContaining('不支持实时联网，涉及最新信息时会基于已有知识谨慎回答'),
    );
  });

  it('健康异常模型保留能力分并把不可用解释放到悬停提示', () => {
    const unhealthyModels: ModelInfo[] = [
      {
        id: 'offline-model',
        name: 'Offline Model',
        provider: 'provider-a',
        temperature: 0.7,
        enabled: true,
        capabilities: {
          searchCapable: true,
          agentTools: true,
          vision: true,
        },
        health: {
          status: 'unhealthy',
          error: '模型已下线',
        },
      },
    ];

    render(
      <ModelSelectorPanel
        modelsByProvider={[{ ...provider, models: unhealthyModels }]}
        selectedModelId="offline-model"
        recentModelIds={[]}
        allModels={unhealthyModels}
        activeProvider="provider-a"
        onSelect={vi.fn()}
        onProviderChange={vi.fn()}
      />,
    );

    const offlineCard = screen.getByRole('button', { name: /Offline Model/ });

    expect(within(offlineCard).getByText('能力 0')).toBeInTheDocument();
    expect(screen.queryByText('不建议：当前不可用')).not.toBeInTheDocument();
    expect(screen.queryByText('模型已下线')).not.toBeInTheDocument();
    expect(offlineCard).toHaveAttribute('title', expect.stringContaining('不建议：当前不可用'));
    expect(offlineCard).toHaveAttribute('title', expect.stringContaining('模型已下线'));
  });
});
