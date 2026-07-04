import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AuthImage from './AuthImage';
import { getFileUrl } from '@/lib/api/files';

vi.mock('@/lib/api/files', () => ({
  getFileUrl: vi.fn(),
}));

const getFileUrlMock = vi.mocked(getFileUrl);

describe('AuthImage', () => {
  beforeEach(() => {
    getFileUrlMock.mockReset();
  });

  it('历史缩略图 URL 过期且刷新失败时保留可见文件卡', async () => {
    getFileUrlMock.mockRejectedValueOnce(new Error('无权访问'));

    render(
      <AuthImage
        fileId="file-1"
        src="/api/files/file-1/content?variant=thumbnail&token=expired"
        alt="diagram.png"
      />,
    );

    fireEvent.error(screen.getByAltText('diagram.png'));

    expect(await screen.findByText('图片加载失败')).toBeInTheDocument();
    expect(screen.getByText('diagram.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新加载 diagram.png' })).toBeInTheDocument();
  });

  it('没有初始 URL 时自动获取 fresh thumbnail 并渲染图片', async () => {
    getFileUrlMock.mockResolvedValueOnce('/api/files/file-1/content?variant=thumbnail&token=fresh');

    render(<AuthImage fileId="file-1" alt="diagram.png" />);

    const image = await screen.findByAltText('diagram.png');

    expect(image).toHaveAttribute('src', '/api/files/file-1/content?variant=thumbnail&token=fresh');
    expect(getFileUrlMock).toHaveBeenCalledWith('file-1', 'thumbnail');
  });

  it('点击失败卡片上的重试按钮会重新获取 URL', async () => {
    getFileUrlMock
      .mockRejectedValueOnce(new Error('过期'))
      .mockResolvedValueOnce('/api/files/file-1/content?variant=thumbnail&token=fresh');

    render(
      <AuthImage
        fileId="file-1"
        src="/api/files/file-1/content?variant=thumbnail&token=expired"
        alt="diagram.png"
      />,
    );

    fireEvent.error(screen.getByAltText('diagram.png'));
    fireEvent.click(await screen.findByRole('button', { name: '重新加载 diagram.png' }));

    await waitFor(() => {
      expect(screen.getByAltText('diagram.png')).toHaveAttribute(
        'src',
        '/api/files/file-1/content?variant=thumbnail&token=fresh',
      );
    });
  });
});
