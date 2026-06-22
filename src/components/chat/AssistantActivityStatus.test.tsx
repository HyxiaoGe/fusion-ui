import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AssistantActivity } from './assistantActivity';
import AssistantActivityStatus from './AssistantActivityStatus';

function baseActivity(overrides: Partial<AssistantActivity>): AssistantActivity {
  return {
    kind: 'completed',
    tool: null,
    issue: null,
    searchBlock: null,
    urlBlocks: [],
    hasText: false,
    hasThinking: false,
    shouldSuppressReasoning: false,
    shouldShowSources: false,
    suggestionState: 'idle',
    ...overrides,
  };
}

describe('AssistantActivityStatus', () => {
  it('renders waiting state', () => {
    render(<AssistantActivityStatus activity={baseActivity({ kind: 'waiting' })} />);

    expect(screen.getByText('正在准备回答')).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('renders running web search with query', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'tool_running',
          tool: {
            kind: 'web_search',
            toolName: 'web_search',
            label: '正在搜索',
            target: 'AI 异常检测',
            call: {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 异常检测' },
              status: 'running',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    const label = screen.getByText('正在搜索：AI 异常检测');
    expect(label).toBeTruthy();
    expect(label).toHaveClass('min-w-0', 'flex-1', 'truncate');
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('running 状态使用紧凑辅助条基础样式', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'tool_running',
          tool: {
            kind: 'web_search',
            toolName: 'web_search',
            label: '正在搜索',
            target: 'AI 异常检测',
            call: {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 异常检测' },
              status: 'running',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass(
      'mb-2',
      'flex',
      'min-w-0',
      'items-center',
      'gap-2',
      'rounded-lg',
      'border',
      'px-2.5',
      'py-1.5',
      'text-xs',
      'border-info-border',
      'bg-info-bg',
      'text-info',
    );
  });

  it('renders running url read with hostname', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'tool_running',
          tool: {
            kind: 'url_read',
            toolName: 'url_read',
            label: '正在读取网页',
            target: 'example.com',
            call: {
              toolCallId: 'tool-1',
              toolName: 'url_read',
              arguments: { url: 'https://example.com/path' },
              status: 'running',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    expect(screen.getByText('正在读取网页：example.com')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders failed state as alert', () => {
    render(<AssistantActivityStatus activity={baseActivity({ kind: 'failed' })} />);

    expect(screen.getByText('生成失败，请重试')).toBeTruthy();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
    expect(alert).toHaveClass('border-danger/30', 'bg-danger/10', 'text-danger');
  });

  it('renders interrupted state', () => {
    render(<AssistantActivityStatus activity={baseActivity({ kind: 'interrupted' })} />);

    expect(screen.getByText('生成已停止')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders degraded search issue after completion', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'completed',
          issue: {
            kind: 'degraded',
            toolKind: 'web_search',
            toolName: 'web_search',
            title: '搜索暂不可用',
            detail: '已基于现有信息回答',
            call: {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 新闻' },
              status: 'degraded',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    expect(screen.getByText('搜索暂不可用')).toBeTruthy();
    expect(screen.getByText('已基于现有信息回答')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('prioritizes failed state over issue copy', () => {
    render(
      <AssistantActivityStatus
        activity={baseActivity({
          kind: 'failed',
          issue: {
            kind: 'failed',
            toolKind: 'web_search',
            toolName: 'web_search',
            title: '搜索失败',
            detail: '本轮回答未使用搜索结果',
            call: {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 新闻' },
              status: 'failed',
              startedAt: 1,
            },
          },
        })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('生成失败，请重试');
    expect(screen.queryByText('搜索失败')).toBeNull();
    expect(screen.queryByText('本轮回答未使用搜索结果')).toBeNull();
  });

  it('renders nothing for normal completed state without issue', () => {
    const { container } = render(<AssistantActivityStatus activity={baseActivity({ kind: 'completed' })} />);

    expect(container.innerHTML).toBe('');
  });
});
