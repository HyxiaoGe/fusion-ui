import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const dispatchMock = vi.hoisted(() => vi.fn());

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: vi.fn(() => ({ currentRun: { runId: 'global-run' } })),
}));

vi.mock('@/lib/db/chatStore', () => ({
  chatStore: { upsertMessage: vi.fn() },
}));

import AdminMessageCard from './AdminMessageCard';

describe('AdminMessageCard 只读边界', () => {
  it('渲染已知与未知 block，但不提供任何聊天 mutation 操作', () => {
    render(<AdminMessageCard message={{
      id: 'msg-1',
      role: 'assistant',
      model_id: 'gpt-5',
      created_at: '2026-07-11T10:00:00Z',
      usage: { input_tokens: 12, output_tokens: 34 },
      content: [
        { type: 'thinking', id: 'b1', thinking: '内部推理摘要' },
        { type: 'text', id: 'b2', text: '最终回答' },
        { type: 'future_block', id: 'b3', safe: '保留内容' },
      ],
    }} />);

    expect(screen.getByText('最终回答')).toBeInTheDocument();
    expect(screen.getByText('未知内容块：future_block')).toBeInTheDocument();
    expect(screen.getByText(/保留内容/)).toBeInTheDocument();
    for (const name of ['编辑', '重新发送', '重新生成', '继续执行', '停止', '删除', '导出']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('思考内容只在组件局部展开，不派发 Redux action', () => {
    dispatchMock.mockReset();
    render(<AdminMessageCard message={{
      id: 'msg-2', role: 'assistant', created_at: null, model_id: null, usage: null,
      content: [{ type: 'thinking', id: 'b1', thinking: '折叠思考' }],
    }} />);

    fireEvent.click(screen.getByRole('button', { name: /已深度思考/ }));
    expect(screen.getByText('折叠思考')).toBeInTheDocument();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('文件块只展示元数据，不渲染图片、预览或下载入口', () => {
    render(<AdminMessageCard message={{
      id: 'msg-3', role: 'user', created_at: null, model_id: null, usage: null,
      content: [{ type: 'file', id: 'f1', file_id: 'file-1', filename: 'private.png', mime_type: 'image/png' }],
    }} />);

    expect(screen.getByText('private.png')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link', { name: /下载|预览/ })).toBeNull();
  });

  it('不允许用户正文通过 HTML、Markdown 图片或 iframe 发起外部请求', () => {
    const { container } = render(<AdminMessageCard message={{
      id: 'msg-malicious', role: 'assistant', created_at: null, model_id: null, usage: null,
      content: [{
        type: 'text', id: 'b1',
        text: '<img src="https://tracker.invalid/raw">\n\n![跟踪图](https://tracker.invalid/md)\n\n<iframe src="https://tracker.invalid/frame"></iframe>\n\n[安全链接](https://example.com/path)',
      }],
    }} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/图片已隐藏：跟踪图/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '安全链接' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
});
