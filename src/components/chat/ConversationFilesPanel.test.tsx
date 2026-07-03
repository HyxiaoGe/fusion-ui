import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FileInfo } from '@/lib/api/files';
import ConversationFilesPanel from './ConversationFilesPanel';

function createFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    id: 'file-1',
    filename: 'notes.txt',
    mimetype: 'text/plain',
    size: 2048,
    created_at: '2026-07-03T00:00:00Z',
    status: 'processed',
    ...overrides,
  };
}

function renderPanel(props: Partial<ComponentProps<typeof ConversationFilesPanel>> = {}) {
  const baseProps: ComponentProps<typeof ConversationFilesPanel> = {
    open: true,
    files: [],
    isLoading: false,
    error: null,
    selectedFileIds: new Set(),
    onClose: vi.fn(),
    onRefresh: vi.fn(),
    onAddFile: vi.fn(),
    onDeleteFile: vi.fn(),
  };

  return {
    props: { ...baseProps, ...props },
    ...render(<ConversationFilesPanel {...baseProps} {...props} />),
  };
}

describe('ConversationFilesPanel', () => {
  it('open=false 时不渲染', () => {
    const { container } = renderPanel({ open: false });

    expect(container.innerHTML).toBe('');
    expect(screen.queryByLabelText('会话资料')).not.toBeInTheDocument();
  });

  it('无资料时显示空态', () => {
    renderPanel();

    expect(screen.getByLabelText('会话资料')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '会话资料' })).toBeInTheDocument();
    expect(screen.getByText('当前会话还没有资料')).toBeInTheDocument();
  });

  it('loading 和 error 状态分别展示对应文案', () => {
    const { rerender, props } = renderPanel({ isLoading: true });

    expect(screen.getByText('正在加载资料')).toBeInTheDocument();
    expect(screen.queryByText('当前会话还没有资料')).not.toBeInTheDocument();

    rerender(
      <ConversationFilesPanel
        {...props}
        isLoading={false}
        error="资料接口暂不可用"
      />,
    );

    expect(screen.getByText('资料接口暂不可用')).toBeInTheDocument();
    expect(screen.queryByText('当前会话还没有资料')).not.toBeInTheDocument();
  });

  it('processed 文件可加入，parsing 文件禁用', () => {
    const processedFile = createFile({ id: 'processed-file', filename: 'done.pdf', mimetype: 'application/pdf' });
    const parsingFile = createFile({ id: 'parsing-file', filename: 'pending.txt', status: 'parsing' });
    const onAddFile = vi.fn();

    renderPanel({ files: [processedFile, parsingFile], onAddFile });

    fireEvent.click(screen.getByRole('button', { name: '加入本次提问 done.pdf' }));

    expect(onAddFile).toHaveBeenCalledTimes(1);
    expect(onAddFile).toHaveBeenCalledWith(processedFile);
    expect(screen.getByRole('button', { name: 'pending.txt 正在处理' })).toBeDisabled();
  });

  it('selected 文件禁用且显示已加入', () => {
    renderPanel({
      files: [createFile({ id: 'selected-file', filename: 'selected.txt' })],
      selectedFileIds: new Set(['selected-file']),
    });

    const addButton = screen.getByRole('button', { name: '已加入 selected.txt' });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveTextContent('已加入');
  });

  it('error 文件显示错误信息且不可加入', () => {
    renderPanel({
      files: [
        createFile({
          id: 'error-file',
          filename: 'broken.pdf',
          mimetype: 'application/pdf',
          status: 'error',
          error_message: '解析失败',
        }),
        createFile({
          id: 'default-error-file',
          filename: 'unknown.pdf',
          mimetype: 'application/pdf',
          status: 'error',
          error_message: null,
        }),
      ],
    });

    expect(screen.getByText('解析失败')).toBeInTheDocument();
    const defaultErrorItem = screen.getByText('unknown.pdf').closest('li');
    expect(defaultErrorItem).not.toBeNull();
    expect(within(defaultErrorItem as HTMLElement).getAllByText('处理失败')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '不可加入 broken.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '不可加入 unknown.pdf' })).toBeDisabled();
  });

  it('删除按钮回调传入文件 id', () => {
    const onDeleteFile = vi.fn();
    renderPanel({
      files: [createFile({ id: 'delete-file', filename: 'delete-me.txt' })],
      onDeleteFile,
    });

    fireEvent.click(screen.getByRole('button', { name: '删除资料 delete-me.txt' }));

    expect(onDeleteFile).toHaveBeenCalledTimes(1);
    expect(onDeleteFile).toHaveBeenCalledWith('delete-file');
  });

  it('刷新和关闭按钮触发回调', () => {
    const onRefresh = vi.fn();
    const onClose = vi.fn();
    renderPanel({ onRefresh, onClose });

    fireEvent.click(screen.getByRole('button', { name: '刷新资料' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭资料面板' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('图片缩略图保留 alt 和 src', () => {
    renderPanel({
      files: [
        createFile({
          id: 'image-file',
          filename: 'diagram.png',
          mimetype: 'image/png',
          thumbnail_url: 'https://static.example.com/diagram-thumb.png',
        }),
      ],
    });

    const thumbnail = screen.getByAltText('diagram.png 缩略图');
    expect(thumbnail).toHaveAttribute('src', 'https://static.example.com/diagram-thumb.png');
  });
});
