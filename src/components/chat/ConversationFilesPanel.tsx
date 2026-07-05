'use client';

import { FileIcon, ImageIcon, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FileInfo } from '@/lib/api/files';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/utils/fileHelpers';
import type { FileBlock } from '@/types/conversation';
import ImageViewer from './ImageViewer';

export interface ConversationFilesPanelProps {
  open: boolean;
  files: FileInfo[];
  isLoading: boolean;
  error: string | null;
  selectedFileIds: Set<string>;
  onClose: () => void;
  onRefresh: () => void;
  onAddFile: (file: FileInfo) => void;
  onDeleteFile: (fileId: string) => void;
}

interface AddButtonState {
  disabled: boolean;
  label: string;
  ariaLabel: string;
  className?: string;
}

export default function ConversationFilesPanel({
  open,
  files,
  isLoading,
  error,
  selectedFileIds,
  onClose,
  onRefresh,
  onAddFile,
  onDeleteFile,
}: ConversationFilesPanelProps) {
  const [viewingImageFile, setViewingImageFile] = useState<FileInfo | null>(null);

  if (!open) {
    return null;
  }

  const handleDeleteFile = (fileId: string) => {
    if (viewingImageFile?.id === fileId) {
      setViewingImageFile(null);
    }
    onDeleteFile(fileId);
  };

  return (
    <>
      <section
        aria-label="会话资料"
        className="flex h-full min-h-0 w-full flex-col border-l border-border/60 bg-background"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-foreground">会话资料</h2>
            <p className="text-xs text-muted-foreground">{files.length} 个资料</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="刷新资料"
              onClick={onRefresh}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="关闭资料面板"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground" role="status">
              正在加载资料
            </p>
          ) : error ? (
            <p className="rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : files.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">当前会话还没有资料</p>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <ConversationFileItem
                  key={file.id}
                  file={file}
                  selected={selectedFileIds.has(file.id)}
                  onAddFile={onAddFile}
                  onDeleteFile={handleDeleteFile}
                  onViewImage={setViewingImageFile}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
      <ImageViewer
        fileBlock={viewingImageFile ? toFileBlock(viewingImageFile) : null}
        onClose={() => setViewingImageFile(null)}
      />
    </>
  );
}

function ConversationFileItem({
  file,
  selected,
  onAddFile,
  onDeleteFile,
  onViewImage,
}: {
  file: FileInfo;
  selected: boolean;
  onAddFile: (file: FileInfo) => void;
  onDeleteFile: (fileId: string) => void;
  onViewImage: (file: FileInfo) => void;
}) {
  const addButtonState = getAddButtonState(file, selected);
  const statusText = getStatusText(file);

  return (
    <li className="rounded-md border border-border/50 bg-muted/10 px-2.5 py-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <FileVisual file={file} onViewImage={onViewImage} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground" title={file.filename}>
                {file.filename}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{formatFileSize(file.size)}</span>
                <span>{statusText}</span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-danger"
              aria-label={`删除资料 ${file.filename}`}
              onClick={() => onDeleteFile(file.id)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {file.status === 'error' ? (
            <p className="mt-1 text-xs text-danger">{file.error_message || '处理失败'}</p>
          ) : null}

          <Button
            type="button"
            variant={selected ? 'secondary' : 'outline'}
            size="sm"
            className={cn('mt-2 h-7 w-full justify-center text-xs', addButtonState.className)}
            disabled={addButtonState.disabled}
            aria-label={addButtonState.ariaLabel}
            onClick={() => onAddFile(file)}
          >
            {!addButtonState.disabled ? <Plus className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {addButtonState.label}
          </Button>
        </div>
      </div>
    </li>
  );
}

function FileVisual({ file, onViewImage }: { file: FileInfo; onViewImage: (file: FileInfo) => void }) {
  const isImage = isImageFile(file);

  if (isImage) {
    return (
      <button
        type="button"
        aria-label={`预览资料图片 ${file.filename}`}
        className="group flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-background text-muted-foreground outline-none transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => onViewImage(file)}
      >
        {file.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 缩略图可能是已签名的本地代理或外部存储 URL，不能提前声明 next/image 域名。
          <img
            src={file.thumbnail_url}
            alt={`${file.filename} 缩略图`}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <ImageIcon className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    );
  }

  const Icon = isImage ? ImageIcon : FileIcon;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background text-muted-foreground">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </div>
  );
}

function getAddButtonState(file: FileInfo, selected: boolean): AddButtonState {
  if (!isImageFile(file)) {
    return {
      disabled: true,
      label: '暂不支持',
      ariaLabel: `当前暂不支持加入文件资料 ${file.filename}`,
      className: 'text-muted-foreground',
    };
  }

  if (selected) {
    return {
      disabled: true,
      label: '已加入',
      ariaLabel: `已加入 ${file.filename}`,
      className: 'text-muted-foreground',
    };
  }

  if (file.status === 'processed') {
    return {
      disabled: false,
      label: '加入本次提问',
      ariaLabel: `加入本次提问 ${file.filename}`,
    };
  }

  if (file.status === 'error') {
    return {
      disabled: true,
      label: '不可加入',
      ariaLabel: `处理失败，无法加入 ${file.filename}`,
      className: 'text-muted-foreground',
    };
  }

  return {
    disabled: true,
    label: '处理中',
    ariaLabel: `资料正在处理，暂不可加入 ${file.filename}`,
    className: 'text-muted-foreground',
  };
}

function getStatusText(file: FileInfo): string {
  switch (file.status) {
    case 'processed':
      return '已处理';
    case 'uploading':
      return '上传中';
    case 'parsing':
      return '解析中';
    case 'pending':
      return '等待处理';
    case 'error':
      return '处理失败';
    default:
      return '等待处理';
  }
}

function isImageFile(file: FileInfo): boolean {
  return file.mimetype.startsWith('image/');
}

function toFileBlock(file: FileInfo): FileBlock {
  return {
    type: 'file',
    id: file.id,
    file_id: file.id,
    filename: file.filename,
    mime_type: file.mimetype,
    ...(file.thumbnail_url ? { thumbnail_url: file.thumbnail_url } : {}),
    ...(file.width != null ? { width: file.width } : {}),
    ...(file.height != null ? { height: file.height } : {}),
  };
}
