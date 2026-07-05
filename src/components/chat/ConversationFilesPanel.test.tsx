import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FileInfo } from '@/lib/api/files';
import ConversationFilesPanel from './ConversationFilesPanel';

vi.mock('./ImageViewer', () => ({
  default: ({ fileBlock, onClose }: { fileBlock: { file_id: string; filename: string; mime_type: string } | null; onClose: () => void }) => (
    fileBlock ? (
      <div aria-label="图片预览查看器">
        <span>{fileBlock.file_id}</span>
        <span>{fileBlock.filename}</span>
        <span>{fileBlock.mime_type}</span>
        <button type="button" onClick={onClose}>关闭预览</button>
      </div>
    ) : null
  ),
}));

function createFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    id: 'file-1',
    filename: 'notes.png',
    mimetype: 'image/png',
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
    const processedFile = createFile({ id: 'processed-file', filename: 'done.png', mimetype: 'image/png' });
    const parsingFile = createFile({ id: 'parsing-file', filename: 'pending.txt', status: 'parsing' });
    const onAddFile = vi.fn();

    renderPanel({ files: [processedFile, parsingFile], onAddFile });

    fireEvent.click(screen.getByRole('button', { name: '加入本次提问 done.png' }));

    expect(onAddFile).toHaveBeenCalledTimes(1);
    expect(onAddFile).toHaveBeenCalledWith(processedFile);
    expect(screen.getByRole('button', { name: '资料正在处理，暂不可加入 pending.txt' })).toBeDisabled();
  });

  it('processed 非图片资料暂停加入本次提问', () => {
    const onAddFile = vi.fn();
    renderPanel({
      files: [createFile({ id: 'doc-file', filename: 'done.pdf', mimetype: 'application/pdf' })],
      onAddFile,
    });

    const addButton = screen.getByRole('button', { name: '当前暂不支持加入文件资料 done.pdf' });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveTextContent('暂不支持');
    fireEvent.click(addButton);
    expect(onAddFile).not.toHaveBeenCalled();
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

  it('父层更新 selectedFileIds 后加入按钮变为已加入', () => {
    const file = createFile({ id: 'select-after-add', filename: 'after-add.txt' });
    const { rerender, props } = renderPanel({ files: [file] });

    fireEvent.click(screen.getByRole('button', { name: '加入本次提问 after-add.txt' }));

    rerender(
      <ConversationFilesPanel
        {...props}
        files={[file]}
        selectedFileIds={new Set(['select-after-add'])}
      />,
    );

    expect(screen.getByRole('button', { name: '已加入 after-add.txt' })).toBeDisabled();
  });

  it('error 文件显示错误信息且不可加入', () => {
    renderPanel({
      files: [
        createFile({
          id: 'error-file',
          filename: 'broken.png',
          mimetype: 'image/png',
          status: 'error',
          error_message: '解析失败',
        }),
        createFile({
          id: 'default-error-file',
          filename: 'unknown.png',
          mimetype: 'image/png',
          status: 'error',
          error_message: null,
        }),
      ],
    });

    expect(screen.getByText('解析失败')).toBeInTheDocument();
    const defaultErrorItem = screen.getByText('unknown.png').closest('li');
    expect(defaultErrorItem).not.toBeNull();
    expect(within(defaultErrorItem as HTMLElement).getAllByText('处理失败')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '处理失败，无法加入 broken.png' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '处理失败，无法加入 unknown.png' })).toBeDisabled();
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

  it('点击图片资料缩略图复用图片预览查看器', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '预览资料图片 diagram.png' }));

    const viewer = screen.getByLabelText('图片预览查看器');
    expect(within(viewer).getByText('image-file')).toBeInTheDocument();
    expect(within(viewer).getByText('diagram.png')).toBeInTheDocument();
    expect(within(viewer).getByText('image/png')).toBeInTheDocument();

    fireEvent.click(within(viewer).getByRole('button', { name: '关闭预览' }));
    expect(screen.queryByLabelText('图片预览查看器')).not.toBeInTheDocument();
  });
});
