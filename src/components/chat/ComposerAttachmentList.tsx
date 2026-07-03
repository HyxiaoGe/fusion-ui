'use client';

import { FileIcon, ImageIcon, Loader2, PaperclipIcon, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/utils/fileHelpers';
import type { ComposerAttachment, UploadComposerAttachment } from './composerAttachments';
import { isComposerAttachmentProcessing } from './composerAttachments';

export interface ComposerAttachmentListProps {
  attachments: ComposerAttachment[];
  onRemoveUploadAttachment: (localId: string) => void;
  onRemoveConversationAttachment: (fileId: string) => void;
  onRetryUploadAttachment: (localId: string) => void;
  onViewImage: (url: string) => void;
}

export default function ComposerAttachmentList({
  attachments,
  onRemoveUploadAttachment,
  onRemoveConversationAttachment,
  onRetryUploadAttachment,
  onViewImage,
}: ComposerAttachmentListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div
      role="list"
      aria-label="已添加附件"
      className="space-y-2 border-b border-border/40 p-2.5"
    >
      {attachments.map((attachment) => (
        <ComposerAttachmentItem
          key={getAttachmentKey(attachment)}
          attachment={attachment}
          onRemoveUploadAttachment={onRemoveUploadAttachment}
          onRemoveConversationAttachment={onRemoveConversationAttachment}
          onRetryUploadAttachment={onRetryUploadAttachment}
          onViewImage={onViewImage}
        />
      ))}
    </div>
  );
}

function ComposerAttachmentItem({
  attachment,
  onRemoveUploadAttachment,
  onRemoveConversationAttachment,
  onRetryUploadAttachment,
  onViewImage,
}: {
  attachment: ComposerAttachment;
  onRemoveUploadAttachment: (localId: string) => void;
  onRemoveConversationAttachment: (fileId: string) => void;
  onRetryUploadAttachment: (localId: string) => void;
  onViewImage: (url: string) => void;
}) {
  const fileName = getFileName(attachment);
  const previewUrl = getPreviewUrl(attachment);
  const isImage = isImageAttachment(attachment);
  const removeLabel =
    attachment.source === 'conversation' ? `移除资料 ${attachment.filename}` : `移除 ${attachment.file.name}`;

  return (
    <div
      role="listitem"
      className="flex min-w-0 items-start gap-2 rounded-md border border-border/50 bg-muted/20 p-2"
    >
      <AttachmentVisual
        attachment={attachment}
        fileName={fileName}
        isImage={isImage}
        previewUrl={previewUrl}
        onViewImage={onViewImage}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" title={fileName}>
              {fileName}
            </p>
            <AttachmentMeta attachment={attachment} />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={removeLabel}
            onClick={() => {
              if (attachment.source === 'conversation') {
                onRemoveConversationAttachment(attachment.fileId);
              } else {
                onRemoveUploadAttachment(attachment.localId);
              }
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {attachment.source === 'upload' && attachment.status === 'error' ? (
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-danger">
              {attachment.errorMessage || '上传失败'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              aria-label={`重试上传 ${attachment.file.name}`}
              onClick={() => onRetryUploadAttachment(attachment.localId)}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试上传
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentVisual({
  attachment,
  fileName,
  isImage,
  previewUrl,
  onViewImage,
}: {
  attachment: ComposerAttachment;
  fileName: string;
  isImage: boolean;
  previewUrl?: string;
  onViewImage: (url: string) => void;
}) {
  const isProcessing = isComposerAttachmentProcessing(attachment);

  if (isImage && previewUrl) {
    const ariaLabel = attachment.source === 'conversation' ? `查看资料 ${fileName}` : `查看 ${fileName}`;

    return (
      <button
        type="button"
        aria-label={ariaLabel}
        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted"
        onClick={() => onViewImage(previewUrl)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 本地 blob URL 和后端签名缩略图不能提前声明 next/image 域名。 */}
        <img src={previewUrl} alt={`${fileName} 缩略图`} className="h-full w-full object-cover" />
        {isProcessing ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
          </span>
        ) : null}
      </button>
    );
  }

  const Icon = isImage ? ImageIcon : attachment.source === 'upload' ? PaperclipIcon : FileIcon;

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background text-muted-foreground">
      {isProcessing ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
    </div>
  );
}

function AttachmentMeta({ attachment }: { attachment: ComposerAttachment }) {
  if (attachment.source === 'conversation') {
    return (
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {attachment.mimetype || 'application/octet-stream'}
      </p>
    );
  }

  return (
    <p
      className={cn(
        'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground',
        attachment.status === 'error' && 'text-danger',
      )}
    >
      <span>{formatFileSize(attachment.file.size)}</span>
      <span>{getUploadStatusText(attachment.status)}</span>
    </p>
  );
}

function getAttachmentKey(attachment: ComposerAttachment): string {
  return attachment.source === 'conversation'
    ? `conversation-${attachment.fileId}`
    : `upload-${attachment.localId}`;
}

function getFileName(attachment: ComposerAttachment): string {
  return attachment.source === 'conversation' ? attachment.filename : attachment.file.name;
}

function getPreviewUrl(attachment: ComposerAttachment): string | undefined {
  if (attachment.source === 'conversation') {
    return attachment.thumbnailUrl || undefined;
  }

  return attachment.previewUrl || attachment.thumbnailUrl || undefined;
}

function isImageAttachment(attachment: ComposerAttachment): boolean {
  const mimeType = attachment.source === 'conversation' ? attachment.mimetype : attachment.file.type;
  return mimeType.startsWith('image/');
}

function getUploadStatusText(status: UploadComposerAttachment['status']): string {
  switch (status) {
    case 'pending':
      return '等待上传';
    case 'uploading':
      return '上传中';
    case 'parsing':
      return '解析中';
    case 'processed':
      return '已处理';
    case 'error':
      return '处理失败';
  }
}
