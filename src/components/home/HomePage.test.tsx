import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchPromptExamplesMock, fetchPromptTemplatesMock, preloadChatMessageListMock } = vi.hoisted(() => ({
  fetchPromptExamplesMock: vi.fn(),
  fetchPromptTemplatesMock: vi.fn(),
  preloadChatMessageListMock: vi.fn(),
}));

vi.mock('@/lib/api/prompts', () => ({
  fetchPromptExamples: fetchPromptExamplesMock,
  fetchPromptTemplates: fetchPromptTemplatesMock,
}));

vi.mock('@/components/lazy/preloaders', () => ({
  preloadChatMessageList: preloadChatMessageListMock,
}));

vi.mock('@/components/prompts/PromptTemplateList', () => ({
  default: ({
    onSelectTemplate,
    templates,
  }: {
    onSelectTemplate?: (content: string) => void;
    templates?: Array<{ title: string; content: string }>;
  }) => (
    <div>
      <output data-testid="template-list-items">
        {templates?.map((template) => template.title).join('|')}
      </output>
      <button
        type="button"
        onClick={() => onSelectTemplate?.(templates?.[0]?.content ?? '来自模板库的提示词')}
      >
        使用模板
      </button>
      {templates?.map((template) => (
        <button
          key={template.title}
          type="button"
          onClick={() => onSelectTemplate?.(template.content)}
        >
          使用模板：{template.title}
        </button>
      ))}
    </div>
  ),
}));

import HomePage from './HomePage';

const COMMUTE_CONTENT = '我从【出发地】前往【目的地】，计划【出发时间】出发。请比较驾车、公共交通、骑行和步行等可用方式，给出具体路线，并根据用时、距离、换乘和步行距离推荐合适方案。';

function createTravelCatalogItems() {
  const baseStarters = Array.from({ length: 8 }, (_, index) => ({
    id: `remote-base-${index + 1}`,
    kind: 'starter',
    title: `基础任务 ${index + 1}`,
    description: `基础任务描述 ${index + 1}`,
    content: `基础任务提示词 ${index + 1}`,
    category: '通用',
    icon_key: 'search',
    tone: 'blue',
    sort_order: (index + 1) * 10,
    enabled: true,
    required_capabilities: [],
  }));
  return [
    ...baseStarters,
    {
      id: 'commute-planning',
      kind: 'starter',
      title: '规划通勤',
      description: '对比路线、耗时和换乘成本',
      content: COMMUTE_CONTENT,
      category: '出行',
      icon_key: 'map-pinned',
      tone: 'sky',
      sort_order: 90,
      enabled: true,
      required_capabilities: [],
    },
    {
      id: 'weekend-itinerary',
      kind: 'starter',
      title: '安排周末行程',
      description: '串联地点、时间和交通路线',
      content: '我计划【日期/时间】从【出发地】出发，想去【地点1、地点2、地点3】，一共【人数】人，偏好【兴趣】，预算【预算】。请推荐合理的游玩顺序，并规划每段路线和时间安排。',
      category: '出行',
      icon_key: 'calendar-range',
      tone: 'orange',
      sort_order: 100,
      enabled: true,
      required_capabilities: [],
    },
    {
      id: 'dining-entertainment',
      kind: 'starter',
      title: '聚餐与娱乐',
      description: '推荐地点并规划饭后转场',
      content: '我计划【日期/时间】在【区域】和【人数】人聚餐，偏好【餐饮类型】，总预算【预算】，饭后想【娱乐活动】。请推荐合适地点，并规划聚餐与娱乐之间的转场路线。',
      category: '出行',
      icon_key: 'utensils-crossed',
      tone: 'teal',
      sort_order: 110,
      enabled: true,
      required_capabilities: [],
    },
  ];
}

describe('HomePage', () => {
  beforeEach(() => {
    preloadChatMessageListMock.mockReset();
    fetchPromptExamplesMock.mockReset();
    fetchPromptTemplatesMock.mockReset();
    fetchPromptExamplesMock.mockResolvedValue({
      examples: [
        { question: '今天有哪些值得关注的 AI 进展？', category: 'tech' },
        { question: '最近有哪些重要科技新闻？', category: 'news' },
        { question: '如何安排一次高质量复盘？', category: 'general' },
        { question: '帮我设计一套用户访谈提纲', category: 'general' },
        { question: '分析本周产品数据中的异常趋势', category: 'tech' },
        { question: '比较三个技术方案的成本和风险', category: 'tech' },
        { question: '整理一份项目复盘行动清单', category: 'general' },
        { question: '总结今天的重要行业新闻', category: 'news' },
        { question: '设计一个新用户引导流程', category: 'general' },
        { question: '解释分布式系统中的背压机制', category: 'tech' },
        { question: '制定下季度产品目标和里程碑', category: 'general' },
        { question: '分析一份竞品报告的关键差异', category: 'general' },
        { question: '把会议纪要整理成责任清单', category: 'general' },
        { question: '规划一周的高效学习安排', category: 'general' },
        { question: '审查接口设计中的兼容性风险', category: 'tech' },
        { question: '为发布公告调整表达和语气', category: 'general' },
      ],
      refreshed_at: '2026-07-14T09:00:00+08:00',
    });
    fetchPromptTemplatesMock.mockResolvedValue({
      items: [],
      source: 'default',
      version: 'code-default',
    });
  });

  it('点击任务卡只选择提示词，不直接创建会话', () => {
    const onSelectPrompt = vi.fn();

    render(<HomePage onSelectPrompt={onSelectPrompt} />);

    fireEvent.click(screen.getByRole('button', { name: /深度调研/ }));

    expect(onSelectPrompt).toHaveBeenCalledWith(expect.stringContaining('联网调研'));
    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
  });

  it('远端灵感加载期间立即稳定展示四个核心任务和两行灵感', () => {
    fetchPromptExamplesMock.mockReturnValue(new Promise(() => {}));

    render(<HomePage onSelectPrompt={vi.fn()} />);

    expect(within(screen.getByTestId('starter-prompts')).getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /深度调研/ })).toBeInTheDocument();
    const inspirationRegion = screen.getByRole('region', { name: '今日灵感' });
    expect(screen.getByTestId('inspiration-cloud')).toHaveAttribute('data-row-count', '2');
    expect(within(inspirationRegion).getAllByRole('button').length).toBeGreaterThan(4);
  });

  it('点击换一批后按波浪翻牌效果替换核心任务', async () => {
    vi.useFakeTimers();
    try {
      render(<HomePage onSelectPrompt={vi.fn()} />);

      expect(screen.getByRole('button', { name: /深度调研/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /分析数据/ })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: '换一批' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getAllByTestId('starter-card')[0]).toHaveStyle({
        transform: 'rotateX(90deg)',
      });
      expect(screen.getAllByTestId('starter-card').map((card) => card.style.transitionDelay)).toEqual([
        '0ms',
        '80ms',
        '160ms',
        '240ms',
      ]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      expect(screen.queryByRole('button', { name: /深度调研/ })).toBeNull();
      expect(screen.getByRole('button', { name: /分析数据/ })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('任务模板会自动切换到下一批', async () => {
    vi.useFakeTimers();
    try {
      render(<HomePage onSelectPrompt={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /深度调研/ })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_001);
      });
      expect(screen.getAllByTestId('starter-card')[0]).toHaveStyle({
        transform: 'rotateX(90deg)',
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      expect(screen.queryByRole('button', { name: /深度调研/ })).toBeNull();
      expect(screen.getByRole('button', { name: /分析数据/ })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('把远端动态问题作为低干扰的今日灵感展示', async () => {
    const onSelectPrompt = vi.fn();
    render(<HomePage onSelectPrompt={onSelectPrompt} />);

    expect(await screen.findByText('今日灵感')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '今天有哪些值得关注的 AI 进展？' }));

    expect(onSelectPrompt).toHaveBeenCalledWith('今天有哪些值得关注的 AI 进展？');
  });

  it('今日灵感按宽度填充两行并继续自动轮换', async () => {
    vi.useFakeTimers();
    try {
      render(<HomePage onSelectPrompt={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      const inspirationRegion = screen.getByRole('region', { name: '今日灵感' });
      const inspirationCloud = screen.getByTestId('inspiration-cloud');
      const beforeRotation = within(inspirationRegion).getAllByRole('button').map(
        (button) => button.textContent,
      );
      expect(inspirationCloud).toHaveAttribute('data-row-count', '2');
      expect(beforeRotation.length).toBeGreaterThan(4);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16000);
      });

      const afterRotation = within(inspirationRegion).getAllByRole('button').map(
        (button) => button.textContent,
      );
      expect(afterRotation.length).toBeGreaterThan(4);
      expect(afterRotation).not.toEqual(beforeRotation);
    } finally {
      vi.useRealTimers();
    }
  });

  it('后端统一模板目录同时驱动首页精选任务和完整模板库', async () => {
    const onSelectPrompt = vi.fn();
    fetchPromptTemplatesMock.mockResolvedValue({
      items: [
        ...Array.from({ length: 4 }, (_, index) => ({
          id: `remote-starter-${index + 1}`,
          kind: 'starter',
          title: index === 0 ? '后端任务卡' : `扩展任务 ${index + 1}`,
          description: '来自后端模板目录',
          content: index === 0 ? '后端任务提示词' : `后端任务提示词 ${index + 1}`,
          category: '通用',
          icon_key: 'search',
          tone: 'blue',
          sort_order: (index + 1) * 10,
          enabled: true,
          required_capabilities: [],
        })),
        {
          id: 'remote-template',
          kind: 'template',
          title: '后端模板',
          description: '来自后端模板目录',
          content: '后端模板提示词',
          category: '通用',
          icon_key: 'file-text',
          tone: 'violet',
          sort_order: 50,
          enabled: true,
          required_capabilities: [],
        },
      ],
      source: 'db',
      version: '2026-07-14.v1',
    });

    render(<HomePage onSelectPrompt={onSelectPrompt} />);

    fireEvent.click(await screen.findByRole('button', { name: /后端任务卡/ }));
    expect(onSelectPrompt).toHaveBeenCalledWith('后端任务提示词');

    fireEvent.click(screen.getByRole('button', { name: '更多模板' }));
    expect(screen.getByTestId('template-list-items')).toHaveTextContent('后端任务卡');
    expect(screen.getByTestId('template-list-items')).toHaveTextContent('后端模板');
    fireEvent.click(screen.getByRole('button', { name: '使用模板' }));
    expect(onSelectPrompt).toHaveBeenLastCalledWith('后端任务提示词');
  });

  it('十一条后端任务手动跨过尾页后按真实起点继续轮换，并从两个入口只预填内容', async () => {
    vi.useFakeTimers();
    const onSelectPrompt = vi.fn();
    fetchPromptTemplatesMock.mockResolvedValue({
      items: createTravelCatalogItems(),
      source: 'db',
      version: '2026-07-21.travel-v1',
    });

    try {
      render(<HomePage onSelectPrompt={onSelectPrompt} />);
      await act(async () => {
        await Promise.resolve();
      });

      for (let page = 0; page < 2; page += 1) {
        fireEvent.click(screen.getByRole('button', { name: '换一批' }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(700);
        });
      }

      const starterRegion = screen.getByTestId('starter-prompts');
      expect(within(starterRegion).getAllByTestId('starter-card')).toHaveLength(4);
      const commuteButton = within(starterRegion).getByRole('button', { name: /规划通勤/ });
      const weekendButton = within(starterRegion).getByRole('button', { name: /安排周末行程/ });
      const diningButton = within(starterRegion).getByRole('button', { name: /聚餐与娱乐/ });
      expect(commuteButton.querySelector('.lucide-map-pinned')?.parentElement).toHaveClass(
        'bg-sky-500/10',
        'text-sky-600',
      );
      expect(weekendButton.querySelector('.lucide-calendar-range')?.parentElement).toHaveClass(
        'bg-orange-500/10',
        'text-orange-600',
      );
      expect(diningButton.querySelector('.lucide-utensils-crossed')?.parentElement).toHaveClass(
        'bg-teal-500/10',
        'text-teal-600',
      );

      fireEvent.click(commuteButton);
      expect(onSelectPrompt).toHaveBeenCalledTimes(1);
      expect(onSelectPrompt).toHaveBeenLastCalledWith(COMMUTE_CONTENT);

      fireEvent.click(screen.getByRole('button', { name: '更多模板' }));
      expect(screen.getByTestId('template-list-items')).toHaveTextContent(
        '规划通勤|安排周末行程|聚餐与娱乐',
      );
      fireEvent.click(screen.getByRole('button', { name: '使用模板：规划通勤' }));
      expect(onSelectPrompt).toHaveBeenCalledTimes(2);
      expect(onSelectPrompt).toHaveBeenLastCalledWith(COMMUTE_CONTENT);

      fireEvent.click(screen.getByRole('button', { name: '换一批' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      expect(within(starterRegion).getAllByTestId('starter-card')).toHaveLength(4);
      expect(within(starterRegion).getByRole('button', { name: /基础任务 2/ })).toBeInTheDocument();
      expect(within(starterRegion).getByRole('button', { name: /基础任务 5/ })).toBeInTheDocument();
      expect(within(starterRegion).queryByRole('button', { name: /基础任务 1/ })).toBeNull();
      expect(within(starterRegion).queryByRole('button', { name: /规划通勤/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('十一条后端任务自动跨过尾页后从下一个真实起点继续轮换', async () => {
    vi.useFakeTimers();
    fetchPromptTemplatesMock.mockResolvedValue({
      items: createTravelCatalogItems(),
      source: 'db',
      version: '2026-07-21.travel-v1',
    });

    try {
      render(<HomePage onSelectPrompt={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
      });

      for (let rotation = 0; rotation < 3; rotation += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(12_001);
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(700);
        });
      }

      const starterRegion = screen.getByTestId('starter-prompts');
      expect(within(starterRegion).getAllByTestId('starter-card')).toHaveLength(4);
      expect(within(starterRegion).getByRole('button', { name: /基础任务 2/ })).toBeInTheDocument();
      expect(within(starterRegion).getByRole('button', { name: /基础任务 5/ })).toBeInTheDocument();
      expect(within(starterRegion).queryByRole('button', { name: /基础任务 1/ })).toBeNull();
      expect(within(starterRegion).queryByRole('button', { name: /规划通勤/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('远端启用任务不足四条时首页保留四卡兜底，更多模板仍使用远端完整目录', async () => {
    fetchPromptTemplatesMock.mockResolvedValue({
      items: [
        ...createTravelCatalogItems().slice(8),
        {
          id: 'remote-template',
          kind: 'template',
          title: '后端补充模板',
          description: '仅在完整模板库展示',
          content: '后端补充模板内容',
          category: '通用',
          icon_key: 'file-text',
          tone: 'violet',
          sort_order: 120,
          enabled: true,
          required_capabilities: [],
        },
      ],
      source: 'db',
      version: '2026-07-21.sparse-v1',
    });

    render(<HomePage onSelectPrompt={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });

    const starterRegion = screen.getByTestId('starter-prompts');
    expect(within(starterRegion).getAllByTestId('starter-card')).toHaveLength(4);
    expect(within(starterRegion).getByRole('button', { name: /深度调研/ })).toBeInTheDocument();
    expect(within(starterRegion).queryByRole('button', { name: /规划通勤/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '更多模板' }));
    const templateItems = screen.getByTestId('template-list-items');
    expect(templateItems).toHaveTextContent('规划通勤|安排周末行程|聚餐与娱乐|后端补充模板');
    expect(templateItems).not.toHaveTextContent('深度调研');
  });

  it('前端兜底时更多模板也包含首页精选任务', async () => {
    const onSelectPrompt = vi.fn();
    render(<HomePage onSelectPrompt={onSelectPrompt} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: '更多模板' }));
    expect(screen.getByTestId('template-list-items')).toHaveTextContent('深度调研');
    expect(screen.getByTestId('template-list-items')).toHaveTextContent('代码解释');
    expect(screen.getByTestId('template-list-items')).toHaveTextContent(
      '规划通勤|安排周末行程|聚餐与娱乐',
    );
    fireEvent.click(screen.getByRole('button', { name: '使用模板' }));

    expect(onSelectPrompt).toHaveBeenCalledWith(expect.stringContaining('联网调研'));
    expect(screen.queryByRole('dialog', { name: '提示词模板' })).toBeNull();
  });

  it('模板分类切换时保持与全部分类一致的弹窗高度', () => {
    render(<HomePage onSelectPrompt={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '更多模板' }));

    expect(screen.getByRole('dialog', { name: '提示词模板' })).toHaveClass(
      'h-[min(36rem,80vh)]'
    );
  });

  it('从首页预加载对话消息列表代码块', async () => {
    render(<HomePage onSelectPrompt={vi.fn()} />);

    await waitFor(() => {
      expect(preloadChatMessageListMock).toHaveBeenCalledTimes(1);
    });
  });
});
