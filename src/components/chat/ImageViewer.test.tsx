import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ImageViewer from './ImageViewer';
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

  it('所有图片 URL 都失败时显示明确错误而不是保留破图', async () => {
    getFileUrlMock.mockResolvedValueOnce('/api/files/file-1/content?variant=processed&token=broken');

    render(<ImageViewer fileBlock={imageBlock()} onClose={vi.fn()} />);

    fireEvent.error(await screen.findByAltText('diagram.png'));

    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('diagram.png')).toBeNull();
  });
});
