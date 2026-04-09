'use client';

import React, { useState, useRef } from 'react';
import { getFileUrl } from '@/lib/api/files';

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
 * 3. 签名 URL 也失败则显示 null（由父组件处理 fallback）
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
  const [failed, setFailed] = useState(false);
  const triedFetchRef = useRef(false);

  // initialSrc 变化时重置状态（切换消息/对话）
  const prevSrcRef = useRef(initialSrc);
  if (prevSrcRef.current !== initialSrc) {
    prevSrcRef.current = initialSrc;
    setSrc(initialSrc || '');
    setFailed(false);
    triedFetchRef.current = false;
  }

  // 没有初始 src 且未尝试过获取 → 立即获取签名 URL
  if (!src && !triedFetchRef.current && !failed) {
    triedFetchRef.current = true;
    getFileUrl(fileId, variant)
      .then((url) => setSrc(url))
      .catch(() => setFailed(true));
  }

  const handleError = async () => {
    if (triedFetchRef.current) {
      setFailed(true);
      return;
    }
    // 首次加载失败（blob URL 过期等），尝试获取签名 URL
    triedFetchRef.current = true;
    try {
      const url = await getFileUrl(fileId, variant);
      setSrc(url);
    } catch {
      setFailed(true);
    }
  };

  if (failed || !src) return null;

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
