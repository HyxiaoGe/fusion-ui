'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { ImageOff, Loader2, RefreshCw, X } from 'lucide-react';
import { getFileUrl } from '@/lib/api/files';
import type { FileBlock } from '@/types/conversation';

type FileVariant = 'processed' | 'thumbnail';
type ImageCandidateResult = {
  cacheKey?: string;
  fromCache?: boolean;
  url: string | null;
};
type ImageCandidate = {
  load: () => Promise<ImageCandidateResult>;
};

const resolvedFileUrlCache = new Map<string, string>();

function fileUrlCacheKey(fileId: string, variant: FileVariant) {
  return `${fileId}:${variant}`;
}

async function getCachedFileUrl(
  fileId: string,
  variant: FileVariant,
  bypassCache: boolean,
): Promise<ImageCandidateResult> {
  const cacheKey = fileUrlCacheKey(fileId, variant);
  if (!bypassCache) {
    const cachedUrl = resolvedFileUrlCache.get(cacheKey);
    if (cachedUrl) {
      return { cacheKey, fromCache: true, url: cachedUrl };
    }
  }

  const url = await getFileUrl(fileId, variant);
  if (url) {
    resolvedFileUrlCache.set(cacheKey, url);
  }
  return { cacheKey, fromCache: false, url };
}

export function __clearImageViewerUrlCacheForTest() {
  resolvedFileUrlCache.clear();
}

interface ImageViewerProps {
  /** 模式一：传入 FileBlock，自动加载原图（消息气泡中使用） */
  fileBlock?: FileBlock | null;
  /** 模式二：直接传入图片 URL（输入框预览使用） */
  imageUrl?: string | null;
  onClose: () => void;
}

/**
 * 统一图片 Lightbox 查看器
 * - 消息气泡：传 fileBlock，自动请求原图 URL
 * - 输入框预览：传 imageUrl（blob URL），直接展示
 */
const ImageViewer: React.FC<ImageViewerProps> = ({ fileBlock, imageUrl, onClose }) => {
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(-1);
  const activeCandidateRef = useRef<{ cacheKey?: string; fromCache: boolean; index: number } | null>(null);
  const requestIdRef = useRef(0);

  const isOpen = !!(fileBlock || imageUrl);

  const loadCandidate = useCallback(async (startIndex: number, bypassCache = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(false);
    setFullImageUrl(null);

    const candidates: ImageCandidate[] = imageUrl
      ? [
          { load: async () => ({ url: imageUrl }) },
        ]
      : fileBlock
        ? [
            { load: async () => getCachedFileUrl(fileBlock.file_id, 'processed', bypassCache) },
            { load: async () => getCachedFileUrl(fileBlock.file_id, 'thumbnail', bypassCache) },
            { load: async () => ({ url: fileBlock.thumbnail_url || null }) },
          ]
        : [];

    for (let index = startIndex; index < candidates.length; index += 1) {
      try {
        const result = await candidates[index].load();
        if (requestIdRef.current !== requestId) return;
        if (!result.url) continue;
        setActiveCandidateIndex(index);
        activeCandidateRef.current = {
          cacheKey: result.cacheKey,
          fromCache: result.fromCache === true,
          index,
        };
        setFullImageUrl(result.url);
        setError(false);
        setIsLoading(false);
        return;
      } catch {
        // 继续尝试下一个候选 URL。
      }
    }

    if (requestIdRef.current === requestId) {
      setActiveCandidateIndex(-1);
      activeCandidateRef.current = null;
      setFullImageUrl(null);
      setError(true);
      setIsLoading(false);
    }
  }, [fileBlock, imageUrl]);

  useEffect(() => {
    if (!fileBlock && !imageUrl) {
      requestIdRef.current += 1;
      setActiveCandidateIndex(-1);
      activeCandidateRef.current = null;
      setFullImageUrl(null);
      setError(false);
      setIsLoading(false);
      return;
    }

    void loadCandidate(0);

    return () => {
      requestIdRef.current += 1;
    };
  }, [fileBlock, imageUrl, loadCandidate]);

  const altText = fileBlock?.filename || '图片预览';
  const handleImageError = () => {
    const activeCandidate = activeCandidateRef.current;
    if (activeCandidate?.fromCache && activeCandidate.cacheKey) {
      resolvedFileUrlCache.delete(activeCandidate.cacheKey);
      void loadCandidate(activeCandidate.index, true);
      return;
    }
    void loadCandidate(activeCandidateIndex + 1, true);
  };
  const handleRetry = () => {
    void loadCandidate(0, true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="inset-0 left-0 top-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-none bg-transparent p-0 shadow-none sm:max-w-none [&>button:last-child]:hidden"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{altText}</DialogTitle>
          <DialogDescription>图片预览</DialogDescription>
        </VisuallyHidden.Root>
        <button
          type="button"
          aria-label="关闭图片预览"
          onClick={onClose}
          className="fixed right-4 top-4 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/70"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div
          data-testid="image-preview-dismiss-surface"
          className="absolute inset-0 flex h-full w-full items-center justify-center px-4 py-12"
          onClick={onClose}
        >
          {isLoading ? (
            <div
              aria-label="图片预览加载中"
              className="flex h-[min(78vh,640px)] w-[min(92vw,960px)] items-center justify-center rounded-lg border border-white/10 bg-black/25 text-white shadow-2xl backdrop-blur-sm"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex min-w-[220px] flex-col items-center gap-3 rounded-lg border border-white/15 bg-black/45 px-5 py-5">
                <Loader2 className="h-6 w-6 animate-spin text-white/90" aria-hidden="true" />
                <div className="text-sm font-medium">正在加载图片…</div>
                <div className="max-w-[56vw] truncate text-xs text-white/65">{altText}</div>
              </div>
            </div>
          ) : error ? (
            <div
              className="flex h-[min(78vh,640px)] w-[min(92vw,960px)] items-center justify-center rounded-lg border border-white/10 bg-black/25 text-white shadow-2xl backdrop-blur-sm"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex min-w-[220px] flex-col items-center gap-3 rounded-lg border border-white/15 bg-black/50 px-5 py-6">
                <ImageOff className="h-8 w-8" aria-hidden="true" />
                <div className="text-sm">图片加载失败</div>
                <div className="max-w-[70vw] truncate text-xs text-white/70">{altText}</div>
                {fileBlock ? (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-white/20 bg-white/10 px-3 text-xs text-white transition-colors hover:bg-white/20"
                    onClick={handleRetry}
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    重试
                  </button>
                ) : null}
              </div>
            </div>
          ) : fullImageUrl ? (
            <img
              src={fullImageUrl}
              alt={altText}
              className="max-w-[85vw] max-h-[85vh] object-contain rounded-lg"
              onClick={(event) => event.stopPropagation()}
              onError={handleImageError}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer;
