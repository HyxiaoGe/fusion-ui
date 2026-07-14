import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchPromptExamplesMock, preloadChatMessageListMock } = vi.hoisted(() => ({
  fetchPromptExamplesMock: vi.fn(),
  preloadChatMessageListMock: vi.fn(),
}));

vi.mock('@/lib/api/prompts', () => ({
  fetchPromptExamples: fetchPromptExamplesMock,
}));

vi.mock('@/components/lazy/preloaders', () => ({
  preloadChatMessageList: preloadChatMessageListMock,
}));

vi.mock('@/components/prompts/PromptTemplateList', () => ({
  default: ({ onSelectTemplate }: { onSelectTemplate?: (content: string) => void }) => (
    <button type="button" onClick={() => onSelectTemplate?.('来自模板库的提示词')}>
      使用模板
    </button>
  ),
}));

import HomePage from './HomePage';

describe('HomePage', () => {
  beforeEach(() => {
    preloadChatMessageListMock.mockReset();
    fetchPromptExamplesMock.mockReset();
    fetchPromptExamplesMock.mockResolvedValue({
      examples: [
        { question: '今天有哪些值得关注的 AI 进展？', category: 'tech' },
        { question: '最近有哪些重要科技新闻？', category: 'news' },
        { question: '如何安排一次高质量复盘？', category: 'general' },
      ],
      refreshed_at: '2026-07-14T09:00:00+08:00',
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

  it('可以从更多模板选择内容填入输入框', () => {
    const onSelectPrompt = vi.fn();
    render(<HomePage onSelectPrompt={onSelectPrompt} />);

    fireEvent.click(screen.getByRole('button', { name: '更多模板' }));
    fireEvent.click(screen.getByRole('button', { name: '使用模板' }));

    expect(onSelectPrompt).toHaveBeenCalledWith('来自模板库的提示词');
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
