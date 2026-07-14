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
    templates?: Array<{ content: string }>;
  }) => (
    <button
      type="button"
      onClick={() => onSelectTemplate?.(templates?.[0]?.content ?? '来自模板库的提示词')}
    >
      使用模板
    </button>
  ),
}));

import HomePage from './HomePage';

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

  it('远端灵感加载期间立即稳定展示四个核心任务', () => {
    fetchPromptExamplesMock.mockReturnValue(new Promise(() => {}));

    render(<HomePage onSelectPrompt={vi.fn()} />);

    expect(within(screen.getByTestId('starter-prompts')).getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /深度调研/ })).toBeInTheDocument();
    expect(screen.queryByText('今日灵感')).toBeNull();
  });

  it('只有用户点击换一批后才替换核心任务', () => {
    render(<HomePage onSelectPrompt={vi.fn()} />);

    expect(screen.getByRole('button', { name: /深度调研/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /分析数据/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '换一批' }));

    expect(screen.queryByRole('button', { name: /深度调研/ })).toBeNull();
    expect(screen.getByRole('button', { name: /分析数据/ })).toBeInTheDocument();
  });

  it('把远端动态问题作为低干扰的今日灵感展示', async () => {
    const onSelectPrompt = vi.fn();
    render(<HomePage onSelectPrompt={onSelectPrompt} />);

    expect(await screen.findByText('今日灵感')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '今天有哪些值得关注的 AI 进展？' }));

    expect(onSelectPrompt).toHaveBeenCalledWith('今天有哪些值得关注的 AI 进展？');
  });

  it('今日灵感固定展示四条并按原翻牌节奏自动轮换', async () => {
    vi.useFakeTimers();
    try {
      render(<HomePage onSelectPrompt={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      const inspirationRegion = screen.getByRole('region', { name: '今日灵感' });
      expect(within(inspirationRegion).getAllByRole('button')).toHaveLength(4);
      expect(within(inspirationRegion).getByText('今天有哪些值得关注的 AI 进展？')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16000);
      });

      expect(within(inspirationRegion).getAllByRole('button')).toHaveLength(4);
      expect(within(inspirationRegion).getByText('分析本周产品数据中的异常趋势')).toBeInTheDocument();
      expect(within(inspirationRegion).queryByText('今天有哪些值得关注的 AI 进展？')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('后端模板目录覆盖首页任务卡并提供模板库内容', async () => {
    const onSelectPrompt = vi.fn();
    fetchPromptTemplatesMock.mockResolvedValue({
      items: [
        {
          id: 'remote-starter',
          kind: 'starter',
          title: '后端任务卡',
          description: '来自后端模板目录',
          content: '后端任务提示词',
          category: '通用',
          icon_key: 'search',
          tone: 'blue',
          sort_order: 10,
          enabled: true,
          required_capabilities: [],
        },
        {
          id: 'remote-template',
          kind: 'template',
          title: '后端模板',
          description: '来自后端模板目录',
          content: '后端模板提示词',
          category: '通用',
          icon_key: 'file-text',
          tone: 'violet',
          sort_order: 20,
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
    fireEvent.click(screen.getByRole('button', { name: '使用模板' }));
    expect(onSelectPrompt).toHaveBeenCalledWith('后端模板提示词');
  });

  it('可以从更多模板选择内容填入输入框', async () => {
    const onSelectPrompt = vi.fn();
    render(<HomePage onSelectPrompt={onSelectPrompt} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: '更多模板' }));
    fireEvent.click(screen.getByRole('button', { name: '使用模板' }));

    expect(onSelectPrompt).toHaveBeenCalledWith(expect.stringContaining('请解释以下代码'));
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
