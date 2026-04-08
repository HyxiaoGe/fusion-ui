'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Loader2 } from 'lucide-react';
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

    // 模式一：从后端获取原图 URL
    setIsLoading(true);
    setError(false);

    getFileUrl(fileBlock.file_id, 'processed')
      .then((url) => {
        setFullImageUrl(url);
      })
      .catch(() => {
        // 回退到缩略图
        setFullImageUrl(fileBlock.thumbnail_url || null);
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [fileBlock, imageUrl]);

  const altText = fileBlock?.filename || '图片预览';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none [&>button]:text-white [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:p-1">
        <VisuallyHidden.Root>
          <DialogTitle>{altText}</DialogTitle>
        </VisuallyHidden.Root>
        <div className="flex items-center justify-center min-h-[200px]">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          ) : fullImageUrl ? (
            <img
              src={fullImageUrl}
              alt={altText}
              className="max-w-[85vw] max-h-[85vh] object-contain rounded-lg"
              onError={() => setError(true)}
            />
          ) : error ? (
            <div className="text-white text-sm">图片加载失败</div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer;
