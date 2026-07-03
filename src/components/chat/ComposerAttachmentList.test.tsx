import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComposerAttachment } from './composerAttachments';

import ComposerAttachmentList from './ComposerAttachmentList';

function renderAttachmentList(attachments: ComposerAttachment[]) {
  const props = {
    attachments,
    onRemoveUploadAttachment: vi.fn(),
    onRemoveConversationAttachment: vi.fn(),
    onRetryUploadAttachment: vi.fn(),
    onViewImage: vi.fn(),
  };

  return {
    props,
    ...render(<ComposerAttachmentList {...props} />),
  };
}

describe('ComposerAttachmentList', () => {
  it('attachments 为空时不渲染', () => {
    const { container } = renderAttachmentList([]);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('list', { name: '已添加附件' })).not.toBeInTheDocument();
  });

  it('既有资料点击移除只调用 conversation 移除回调', () => {
    const { props } = renderAttachmentList([
      {
        source: 'conversation',
        fileId: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        status: 'processed',
        thumbnailUrl: 'https://cdn.example.com/thumb.png',
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '移除资料 diagram.png' }));

    expect(props.onRemoveConversationAttachment).toHaveBeenCalledTimes(1);
    expect(props.onRemoveConversationAttachment).toHaveBeenCalledWith('file-1');
    expect(props.onRemoveUploadAttachment).not.toHaveBeenCalled();
  });

  it('上传失败显示重试按钮，点击后传入 localId', () => {
    const { props } = renderAttachmentList([
      {
        source: 'upload',
        localId: 'local-1',
        file: new File(['bad'], 'broken.pdf', { type: 'application/pdf' }),
        fileId: 'file-1',
        status: 'error',
        errorMessage: '解析失败',
      },
    ]);

    expect(screen.getByText('解析失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试上传 broken.pdf' }));

    expect(props.onRetryUploadAttachment).toHaveBeenCalledTimes(1);
    expect(props.onRetryUploadAttachment).toHaveBeenCalledWith('local-1');
  });

  it('展示上传附件的状态文案', () => {
    renderAttachmentList([
      {
        source: 'upload',
        localId: 'pending-file',
        file: new File(['pending'], 'pending.txt', { type: 'text/plain' }),
        status: 'pending',
      },
      {
        source: 'upload',
        localId: 'uploading-file',
        file: new File(['uploading'], 'uploading.txt', { type: 'text/plain' }),
        status: 'uploading',
      },
      {
        source: 'upload',
        localId: 'parsing-file',
        file: new File(['parsing'], 'parsing.txt', { type: 'text/plain' }),
        fileId: 'file-3',
        status: 'parsing',
      },
      {
        source: 'upload',
        localId: 'processed-file',
        file: new File(['processed'], 'processed.txt', { type: 'text/plain' }),
        fileId: 'file-4',
        status: 'processed',
      },
    ]);

    expect(screen.getByText('等待上传')).toBeInTheDocument();
    expect(screen.getByText('上传中')).toBeInTheDocument();
    expect(screen.getByText('解析中')).toBeInTheDocument();
    expect(screen.getByText('已处理')).toBeInTheDocument();
  });

  it('上传图片缩略图点击调用 onViewImage', () => {
    const { props } = renderAttachmentList([
      {
        source: 'upload',
        localId: 'local-1',
        file: new File(['image'], 'photo.png', { type: 'image/png' }),
        fileId: 'file-1',
        status: 'processed',
        previewUrl: 'blob:photo-preview',
        thumbnailUrl: 'https://cdn.example.com/photo-thumb.png',
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '查看 photo.png' }));

    expect(props.onViewImage).toHaveBeenCalledTimes(1);
    expect(props.onViewImage).toHaveBeenCalledWith('blob:photo-preview');
  });

  it('既有资料图片缩略图点击调用 onViewImage', () => {
    const { props } = renderAttachmentList([
      {
        source: 'conversation',
        fileId: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        status: 'processed',
        thumbnailUrl: 'https://cdn.example.com/diagram-thumb.png',
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '查看资料 diagram.png' }));

    expect(props.onViewImage).toHaveBeenCalledTimes(1);
    expect(props.onViewImage).toHaveBeenCalledWith('https://cdn.example.com/diagram-thumb.png');
  });
});
