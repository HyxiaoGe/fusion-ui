import type { FileInfo } from '@/lib/api/files';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import type { FileProcessingStatus } from '@/redux/slices/fileUploadSlice';

export interface UploadComposerAttachment {
  source: 'upload';
  localId: string;
  file: File;
  fileId?: string;
  status: FileProcessingStatus;
  previewUrl?: string;
  thumbnailUrl?: string | null;
  errorMessage?: string;
}

export interface ConversationComposerAttachment {
  source: 'conversation';
  fileId: string;
  filename: string;
  mimetype: string;
  status: FileProcessingStatus;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

export type ComposerAttachment = UploadComposerAttachment | ConversationComposerAttachment;

export function conversationFileToComposerAttachment(file: FileInfo): ConversationComposerAttachment {
  return {
    source: 'conversation',
    fileId: file.id,
    filename: file.filename,
    mimetype: file.mimetype,
    status: file.status,
    thumbnailUrl: file.thumbnail_url,
    width: file.width,
    height: file.height,
  };
}

export function isComposerAttachmentProcessing(attachment: ComposerAttachment): boolean {
  if (attachment.source === 'conversation') {
    return false;
  }

  return (
    !attachment.fileId ||
    attachment.status === 'pending' ||
    attachment.status === 'uploading' ||
    attachment.status === 'parsing'
  );
}

export function isComposerAttachmentError(attachment: ComposerAttachment): boolean {
  return attachment.source === 'upload' && attachment.status === 'error';
}

export function toFileAttachment(attachment: ComposerAttachment): FileAttachment | null {
  if (attachment.source === 'conversation') {
    return {
      fileId: attachment.fileId,
      filename: attachment.filename,
      mimeType: attachment.mimetype,
      previewUrl: attachment.thumbnailUrl || undefined,
    };
  }

  if (!attachment.fileId) {
    return null;
  }

  return {
    fileId: attachment.fileId,
    filename: attachment.file.name,
    mimeType: attachment.file.type || 'application/octet-stream',
    previewUrl: attachment.previewUrl || attachment.thumbnailUrl || undefined,
  };
}
