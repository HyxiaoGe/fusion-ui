import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/lib/api/files';

import {
  isComposerAttachmentError,
  isComposerAttachmentProcessing,
  toFileAttachment,
  tryConversationFileToComposerAttachment,
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

    const attachment = tryConversationFileToComposerAttachment(file);

    expect(attachment).not.toBeNull();
    if (!attachment) throw new Error('processed 会话资料应该可加入 composer');

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

  it('未处理会话资料不会映射为可发送附件', () => {
    const parsingFile = createConversationFile({ id: 'file-parsing', status: 'parsing' });
    const errorFile = createConversationFile({ id: 'file-error', status: 'error' });

    expect(tryConversationFileToComposerAttachment(parsingFile)).toBeNull();
    expect(tryConversationFileToComposerAttachment(errorFile)).toBeNull();
  });

  it('非图片会话资料暂停映射为可发送附件', () => {
    const pdfFile = createConversationFile({
      id: 'file-pdf',
      filename: 'report.pdf',
      mimetype: 'application/pdf',
      thumbnail_url: null,
      width: null,
      height: null,
    });

    expect(tryConversationFileToComposerAttachment(pdfFile)).toBeNull();
  });

  it('按上传状态判断 processing/error，会话资料不视为处理中或错误', () => {
    const processingUpload: ComposerAttachment = {
      source: 'upload',
      localId: 'local-1',
      file: new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      status: 'uploading',
      previewUrl: '',
    };
    const errorWithoutFileId: ComposerAttachment = {
      source: 'upload',
      localId: 'local-error-without-file-id',
      file: new File(['bad'], 'bad-before-id.txt', { type: 'text/plain' }),
      status: 'error',
      errorMessage: '上传失败',
    };
    const errorUpload: ComposerAttachment = {
      source: 'upload',
      localId: 'local-2',
      file: new File(['bad'], 'bad.txt', { type: 'text/plain' }),
      fileId: 'file-2',
      status: 'error',
      errorMessage: '上传失败',
    };
    const conversationAttachment = tryConversationFileToComposerAttachment(createConversationFile());

    expect(conversationAttachment).not.toBeNull();
    if (!conversationAttachment) throw new Error('processed 会话资料应该可加入 composer');

    expect(isComposerAttachmentProcessing(processingUpload)).toBe(true);
    expect(isComposerAttachmentError(processingUpload)).toBe(false);
    expect(isComposerAttachmentProcessing(errorWithoutFileId)).toBe(false);
    expect(isComposerAttachmentError(errorWithoutFileId)).toBe(true);
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
      file: new File(['ready'], 'ready.png', { type: 'image/png' }),
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
    const parsingWithFileId: ComposerAttachment = {
      source: 'upload',
      localId: 'local-4',
      file: new File(['parsing'], 'parsing.pdf', { type: 'application/pdf' }),
      fileId: 'file-4',
      status: 'parsing',
    };
    const errorWithFileId: ComposerAttachment = {
      source: 'upload',
      localId: 'local-5',
      file: new File(['error'], 'error.pdf', { type: 'application/pdf' }),
      fileId: 'file-5',
      status: 'error',
    };

    expect(toFileAttachment(uploadWithoutFileId)).toBeNull();
    expect(toFileAttachment(parsingWithFileId)).toBeNull();
    expect(toFileAttachment(errorWithFileId)).toBeNull();
    expect(toFileAttachment(uploadWithFileId)).toEqual({
      fileId: 'file-2',
      filename: 'ready.png',
      mimeType: 'image/png',
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
