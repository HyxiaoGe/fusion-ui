'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { ImageOff, Loader2, RefreshCw, X } from 'lucide-react';
import { getFileUrl } from '@/lib/api/files';
import type { FileBlock } from '@/types/conversation';

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
  const [reloadKey, setReloadKey] = useState(0);

  const isOpen = !!(fileBlock || imageUrl);

  useEffect(() => {
    // 模式二：直接 URL，无需异步加载
    if (imageUrl) {
      setFullImageUrl(imageUrl);
      setError(false);
      setIsLoading(false);
      return;
    }

    if (!fileBlock) {
      setFullImageUrl(null);
      setError(false);
      return;
    }

    let cancelled = false;

    async function loadFileImage() {
      setIsLoading(true);
      setError(false);
      setFullImageUrl(null);

      try {
        const processedUrl = await getFileUrl(fileBlock.file_id, 'processed');
        if (cancelled) return;
        setFullImageUrl(processedUrl);
        return;
      } catch {
        // 原图不可用时，主动获取 fresh thumbnail，避免复用历史消息里已过期的签名 URL。
      }

      try {
        const thumbnailUrl = await getFileUrl(fileBlock.file_id, 'thumbnail');
        if (cancelled) return;
        setFullImageUrl(thumbnailUrl);
        return;
      } catch {
        if (cancelled) return;
        if (fileBlock.thumbnail_url) {
          setFullImageUrl(fileBlock.thumbnail_url);
        } else {
          setError(true);
        }
      }
    }

    void loadFileImage().finally(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fileBlock, imageUrl, reloadKey]);

  const altText = fileBlock?.filename || '图片预览';
  const handleImageError = () => {
    setFullImageUrl(null);
    setError(true);
    setIsLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[90vw] max-h-[90vh] sm:max-w-[90vw] p-0 border-none bg-transparent shadow-none flex items-center justify-center [&>button:last-child]:hidden"
        onClick={onClose}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{altText}</DialogTitle>
          <DialogDescription>图片预览</DialogDescription>
        </VisuallyHidden.Root>
        {/* 图片区域：阻止点击冒泡，避免点击图片时关闭 */}
        <div
          className="relative flex items-center justify-center min-h-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          ) : error ? (
            <div className="flex min-w-[220px] flex-col items-center gap-3 rounded-lg border border-white/15 bg-black/50 px-5 py-6 text-white">
              <ImageOff className="h-8 w-8" aria-hidden="true" />
              <div className="text-sm">图片加载失败</div>
              <div className="max-w-[70vw] truncate text-xs text-white/70">{altText}</div>
              {fileBlock ? (
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-white/20 bg-white/10 px-3 text-xs text-white transition-colors hover:bg-white/20"
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  重试
                </button>
              ) : null}
            </div>
          ) : fullImageUrl ? (
            <img
              src={fullImageUrl}
              alt={altText}
              className="max-w-[85vw] max-h-[85vh] object-contain rounded-lg"
              onError={handleImageError}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer;
