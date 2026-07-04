import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ImageViewer, { __clearImageViewerUrlCacheForTest } from './ImageViewer';
import { getFileUrl } from '@/lib/api/files';
import type { FileBlock } from '@/types/conversation';

vi.mock('@/lib/api/files', () => ({
  getFileUrl: vi.fn(),
}));

const getFileUrlMock = vi.mocked(getFileUrl);

function imageBlock(overrides: Partial<FileBlock> = {}): FileBlock {
  return {
    type: 'file',
    id: 'block-1',
    file_id: 'file-1',
    filename: 'diagram.png',
    mime_type: 'image/png',
    ...overrides,
  };
}

describe('ImageViewer', () => {
  beforeEach(() => {
    getFileUrlMock.mockReset();
    __clearImageViewerUrlCacheForTest();
  });

  it('图片 URL 解析期间显示稳定的预览加载舞台', () => {
    getFileUrlMock.mockReturnValue(new Promise(() => undefined));

    render(<ImageViewer fileBlock={imageBlock()} onClose={vi.fn()} />);

    const loadingStage = screen.getByLabelText('图片预览加载中');
    const closeButton = screen.getByRole('button', { name: '关闭图片预览' });

    expect(loadingStage).toBeInTheDocument();
    expect(within(loadingStage).getByText('正在加载图片…')).toBeInTheDocument();
    expect(within(loadingStage).getByText('diagram.png')).toBeInTheDocument();
    expect(closeButton).toHaveClass('fixed');
    expect(closeButton.closest('[aria-label="图片预览加载中"]')).toBeNull();
  });

  it('原图 URL 获取失败时尝试 fresh thumbnail 作为降级图', async () => {
    getFileUrlMock
      .mockRejectedValueOnce(new Error('processed 不可用'))
      .mockResolvedValueOnce('/api/files/file-1/content?variant=thumbnail&token=fresh');

    render(<ImageViewer fileBlock={imageBlock()} onClose={vi.fn()} />);

    const image = await screen.findByAltText('diagram.png');

    expect(image).toHaveAttribute('src', '/api/files/file-1/content?variant=thumbnail&token=fresh');
    expect(getFileUrlMock).toHaveBeenNthCalledWith(1, 'file-1', 'processed');
    expect(getFileUrlMock).toHaveBeenNthCalledWith(2, 'file-1', 'thumbnail');
  });

  it('原图内容加载失败时继续尝试 fresh thumbnail', async () => {
    getFileUrlMock
      .mockResolvedValueOnce('/api/files/file-1/content?variant=processed&token=broken')
      .mockResolvedValueOnce('/api/files/file-1/content?variant=thumbnail&token=fresh');

    render(<ImageViewer fileBlock={imageBlock()} onClose={vi.fn()} />);

    fireEvent.error(await screen.findByAltText('diagram.png'));

    await waitFor(() => {
      expect(screen.getByAltText('diagram.png')).toHaveAttribute(
        'src',
        '/api/files/file-1/content?variant=thumbnail&token=fresh',
      );
    });
    expect(screen.queryByText('图片加载失败')).toBeNull();
    expect(getFileUrlMock).toHaveBeenNthCalledWith(1, 'file-1', 'processed');
    expect(getFileUrlMock).toHaveBeenNthCalledWith(2, 'file-1', 'thumbnail');
  });

  it('fresh thumbnail 内容也加载失败时复用消息里的历史 thumbnail URL', async () => {
    getFileUrlMock
      .mockResolvedValueOnce('/api/files/file-1/content?variant=processed&token=broken')
      .mockResolvedValueOnce('/api/files/file-1/content?variant=thumbnail&token=broken');

    render(
      <ImageViewer
        fileBlock={imageBlock({ thumbnail_url: '/api/files/file-1/content?variant=thumbnail&token=historical' })}
        onClose={vi.fn()}
      />,
    );

    fireEvent.error(await screen.findByAltText('diagram.png'));
    await waitFor(() => {
      expect(screen.getByAltText('diagram.png')).toHaveAttribute(
        'src',
        '/api/files/file-1/content?variant=thumbnail&token=broken',
      );
    });

    fireEvent.error(screen.getByAltText('diagram.png'));
    await waitFor(() => {
      expect(screen.getByAltText('diagram.png')).toHaveAttribute(
        'src',
        '/api/files/file-1/content?variant=thumbnail&token=historical',
      );
    });
    expect(screen.queryByText('图片加载失败')).toBeNull();
  });

  it('所有图片内容都失败时显示明确错误而不是保留破图', async () => {
    getFileUrlMock.mockResolvedValueOnce('/api/files/file-1/content?variant=processed&token=broken');

    render(<ImageViewer fileBlock={imageBlock()} onClose={vi.fn()} />);

    fireEvent.error(await screen.findByAltText('diagram.png'));

    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('diagram.png')).toBeNull();
  });

  it('重新打开同一张消息图片时复用已获取的 processed URL', async () => {
    getFileUrlMock.mockResolvedValueOnce('/api/files/file-cache/content?variant=processed&token=stable');
    const fileBlock = imageBlock({
      file_id: 'file-cache',
      filename: 'cache.png',
    });

    const firstRender = render(<ImageViewer fileBlock={fileBlock} onClose={vi.fn()} />);

    expect(await screen.findByAltText('cache.png')).toHaveAttribute(
      'src',
      '/api/files/file-cache/content?variant=processed&token=stable',
    );

    firstRender.unmount();
    render(<ImageViewer fileBlock={fileBlock} onClose={vi.fn()} />);

    expect(await screen.findByAltText('cache.png')).toHaveAttribute(
      'src',
      '/api/files/file-cache/content?variant=processed&token=stable',
    );
    expect(getFileUrlMock).toHaveBeenCalledTimes(1);
    expect(getFileUrlMock).toHaveBeenCalledWith('file-cache', 'processed');
  });

  it('点击重试时绕过已缓存 URL 重新获取 processed URL', async () => {
    getFileUrlMock
      .mockResolvedValueOnce('/api/files/file-retry/content?variant=processed&token=old')
      .mockRejectedValueOnce(new Error('thumbnail 不可用'))
      .mockResolvedValueOnce('/api/files/file-retry/content?variant=processed&token=new');
    const fileBlock = imageBlock({
      file_id: 'file-retry',
      filename: 'retry.png',
    });

    render(<ImageViewer fileBlock={fileBlock} onClose={vi.fn()} />);

    const image = await screen.findByAltText('retry.png');
    expect(image).toHaveAttribute('src', '/api/files/file-retry/content?variant=processed&token=old');

    fireEvent.error(image);
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));

    await waitFor(() => {
      expect(screen.getByAltText('retry.png')).toHaveAttribute(
        'src',
        '/api/files/file-retry/content?variant=processed&token=new',
      );
    });
    expect(getFileUrlMock).toHaveBeenNthCalledWith(1, 'file-retry', 'processed');
    expect(getFileUrlMock).toHaveBeenNthCalledWith(2, 'file-retry', 'thumbnail');
    expect(getFileUrlMock).toHaveBeenNthCalledWith(3, 'file-retry', 'processed');
  });

  it('缓存的 processed URL 内容加载失败时先刷新 processed URL', async () => {
    getFileUrlMock
      .mockResolvedValueOnce('/api/files/file-expired/content?variant=processed&token=old')
      .mockResolvedValueOnce('/api/files/file-expired/content?variant=processed&token=new');
    const fileBlock = imageBlock({
      file_id: 'file-expired',
      filename: 'expired.png',
    });

    const firstRender = render(<ImageViewer fileBlock={fileBlock} onClose={vi.fn()} />);
    expect(await screen.findByAltText('expired.png')).toHaveAttribute(
      'src',
      '/api/files/file-expired/content?variant=processed&token=old',
    );
    firstRender.unmount();

    render(<ImageViewer fileBlock={fileBlock} onClose={vi.fn()} />);
    const cachedImage = await screen.findByAltText('expired.png');
    expect(cachedImage).toHaveAttribute('src', '/api/files/file-expired/content?variant=processed&token=old');

    fireEvent.error(cachedImage);

    await waitFor(() => {
      expect(screen.getByAltText('expired.png')).toHaveAttribute(
        'src',
        '/api/files/file-expired/content?variant=processed&token=new',
      );
    });
    expect(getFileUrlMock).toHaveBeenNthCalledWith(1, 'file-expired', 'processed');
    expect(getFileUrlMock).toHaveBeenNthCalledWith(2, 'file-expired', 'processed');
  });
});
