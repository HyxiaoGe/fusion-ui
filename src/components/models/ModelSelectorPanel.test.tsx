import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('视觉')).toBeInTheDocument();
    expect(screen.getByText('深度任务')).toBeInTheDocument();
    expect(screen.queryByText('工具')).not.toBeInTheDocument();
  });
});
