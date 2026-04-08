'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { getFileUrl } from '@/lib/api/files';
import type { FileBlock } from '@/types/conversation';

interface ImageViewerProps {
  fileBlock: FileBlock | null;
  onClose: () => void;
}

/**
 * 图片查看器组件
 * 点击缩略图后弹出，加载原图全屏展示
 */
const ImageViewer: React.FC<ImageViewerProps> = ({ fileBlock, onClose }) => {
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!fileBlock) {
      setFullImageUrl(null);
      setError(false);
      return;
    }

    // 加载原图 URL
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
  }, [fileBlock]);

  return (
    <Dialog open={!!fileBlock} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none [&>button]:text-white [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:p-1">
        <div className="flex items-center justify-center min-h-[200px]">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          ) : fullImageUrl ? (
            <img
              src={fullImageUrl}
              alt={fileBlock?.filename || '图片'}
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
