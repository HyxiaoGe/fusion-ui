import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/lib/api/files';

import {
  conversationFileToComposerAttachment,
  isComposerAttachmentError,
  isComposerAttachmentProcessing,
  toFileAttachment,
  type ComposerAttachment,
} from './composerAttachments';

function createConversationFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    id: 'file-1',
    filename: 'diagram.png',
    mimetype: 'image/png',
    size: 1024,
    created_at: '2026-07-03T10:00:00Z',
    status: 'processed',
    error_message: null,
    thumbnail_url: 'https://cdn.example.com/thumb.png',
    width: 640,
    height: 480,
    ...overrides,
  };
}

describe('composerAttachments', () => {
  it('把 processed 会话资料映射为 composer attachment 并转成发送附件', () => {
    const file = createConversationFile();

    const attachment = conversationFileToComposerAttachment(file);

    expect(attachment).toEqual({
      source: 'conversation',
      fileId: 'file-1',
      filename: 'diagram.png',
      mimetype: 'image/png',
      status: 'processed',
      thumbnailUrl: 'https://cdn.example.com/thumb.png',
      width: 640,
      height: 480,
    });
    expect(toFileAttachment(attachment)).toEqual({
      fileId: 'file-1',
      filename: 'diagram.png',
      mimeType: 'image/png',
      previewUrl: 'https://cdn.example.com/thumb.png',
    });
  });

  it('upload 无 fileId 视为处理中，upload error 视为错误，会话资料不视为处理中或错误', () => {
    const processingUpload: ComposerAttachment = {
      source: 'upload',
      localId: 'local-1',
      file: new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      status: 'uploading',
      previewUrl: '',
    };
    const errorUpload: ComposerAttachment = {
      source: 'upload',
      localId: 'local-2',
      file: new File(['bad'], 'bad.txt', { type: 'text/plain' }),
      fileId: 'file-2',
      status: 'error',
      errorMessage: '上传失败',
    };
    const conversationAttachment = conversationFileToComposerAttachment(createConversationFile());

    expect(isComposerAttachmentProcessing(processingUpload)).toBe(true);
    expect(isComposerAttachmentError(processingUpload)).toBe(false);
    expect(isComposerAttachmentProcessing(errorUpload)).toBe(false);
    expect(isComposerAttachmentError(errorUpload)).toBe(true);
    expect(isComposerAttachmentProcessing(conversationAttachment)).toBe(false);
    expect(isComposerAttachmentError(conversationAttachment)).toBe(false);
  });

  it('按 fileId 有无转换 upload 附件', () => {
    const uploadWithoutFileId: ComposerAttachment = {
      source: 'upload',
      localId: 'local-1',
      file: new File(['pending'], 'pending.bin', { type: '' }),
      status: 'pending',
    };
    const uploadWithFileId: ComposerAttachment = {
      source: 'upload',
      localId: 'local-2',
      file: new File(['ready'], 'ready.bin', { type: '' }),
      fileId: 'file-2',
      status: 'processed',
      thumbnailUrl: 'https://cdn.example.com/ready-thumb.png',
    };
    const imageUploadWithPreview: ComposerAttachment = {
      source: 'upload',
      localId: 'local-3',
      file: new File(['image'], 'image.png', { type: 'image/png' }),
      fileId: 'file-3',
      status: 'processed',
      previewUrl: 'blob:local-image',
      thumbnailUrl: 'https://cdn.example.com/image-thumb.png',
    };

    expect(toFileAttachment(uploadWithoutFileId)).toBeNull();
    expect(toFileAttachment(uploadWithFileId)).toEqual({
      fileId: 'file-2',
      filename: 'ready.bin',
      mimeType: 'application/octet-stream',
      previewUrl: 'https://cdn.example.com/ready-thumb.png',
    });
    expect(toFileAttachment(imageUploadWithPreview)).toEqual({
      fileId: 'file-3',
      filename: 'image.png',
      mimeType: 'image/png',
      previewUrl: 'blob:local-image',
    });
  });
});
