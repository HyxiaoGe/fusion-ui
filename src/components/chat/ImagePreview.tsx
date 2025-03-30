'use client';

import React, { useState } from 'react';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { ImageIcon } from 'lucide-react';

interface ImagePreviewProps {
  file: FileWithPreview;
  className?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ file, className }) => {
  // 简化组件，只显示图标
  return (
    <div
      className={`w-12 h-12 flex items-center justify-center ${className || ''}`}
    >
      <ImageIcon className="h-10 w-10 text-blue-500" />
    </div>
  );
};

export default ImagePreview;