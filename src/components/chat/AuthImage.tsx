'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, RefreshCw } from 'lucide-react';

import { getFileUrl } from '@/lib/api/files';
import { cn } from '@/lib/utils';

interface AuthImageProps {
  fileId: string;
  src?: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  variant?: 'thumbnail' | 'processed';
}

/**
 * 带认证回退的图片组件。
 *
 * 渲染逻辑：
 * 1. 优先使用 src（blob URL 或签名 URL），直接渲染
 * 2. 如果 src 缺失或加载失败，通过 getFileUrl() 获取签名 URL 重试
 * 3. 签名 URL 也失败则保留可见失败卡片，避免历史消息里的图片直接消失
 */
const AuthImage: React.FC<AuthImageProps> = ({
  fileId,
  src: initialSrc,
  alt,
  className,
  onClick,
  variant = 'thumbnail',
}) => {
  const [src, setSrc] = useState(initialSrc || '');
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(initialSrc ? 'ready' : 'loading');
  const [source, setSource] = useState<'initial' | 'fetched' | null>(initialSrc ? 'initial' : null);
  const requestIdRef = useRef(0);

  const loadFreshUrl = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus('loading');
    setSrc('');
    setSource(null);

    try {
      const url = await getFileUrl(fileId, variant);
      if (requestIdRef.current !== requestId) return;
      setSrc(url);
      setSource('fetched');
      setStatus('ready');
    } catch {
      if (requestIdRef.current !== requestId) return;
      setSrc('');
      setSource(null);
      setStatus('failed');
    }
  }, [fileId, variant]);

  useEffect(() => {
    requestIdRef.current += 1;

    if (initialSrc) {
      setSrc(initialSrc);
      setSource('initial');
      setStatus('ready');
      return;
    }

    void loadFreshUrl();
  }, [fileId, initialSrc, loadFreshUrl, variant]);

  const handleError = () => {
    if (source === 'initial') {
      void loadFreshUrl();
      return;
    }

    setSrc('');
    setSource(null);
    setStatus('failed');
  };

  const handleRetry = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void loadFreshUrl();
  };

  if (status !== 'ready' || !src) {
    return (
      <div
        className={cn(
          'flex min-h-[96px] w-[180px] max-w-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center text-muted-foreground',
          className,
        )}
        aria-label={`${alt} ${status === 'failed' ? '加载失败' : '加载中'}`}
      >
        {status === 'loading' ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-xs">图片加载中</span>
          </>
        ) : (
          <>
            <ImageOff className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">图片加载失败</span>
            <span className="max-w-full truncate text-[11px]">{alt}</span>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-foreground transition-colors hover:bg-muted"
              onClick={handleRetry}
              aria-label={`重新加载 ${alt}`}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              重试
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onClick={onClick}
      onError={handleError}
    />
  );
};

export default AuthImage;
