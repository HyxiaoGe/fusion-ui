'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { Download, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import React, { useState } from 'react';

interface ImagePreviewProps {
  file: FileWithPreview;
  className?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ file, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.preview;
    link.download = file.name;
    link.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div
          className={`relative cursor-pointer overflow-hidden rounded-md border border-border ${className || ''}`}
          style={{ maxWidth: '120px', maxHeight: '120px' }}
        >
          <img
            src={file.preview}
            alt={file.name}
            className="h-full w-full object-cover"
            style={{ maxHeight: '120px' }}
          />
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        {/* 添加必要的DialogTitle */}
        <DialogTitle className="sr-only">图片预览：{file.name}</DialogTitle>
        
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="text-lg font-medium truncate max-w-md">{file.name}</h3>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleZoomIn}>
                <ZoomIn className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleZoomOut}>
                <ZoomOut className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleRotate}>
                <RotateCw className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload}>
                <Download className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            <div 
              className="relative"
              style={{ 
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s',
              }}
            >
              <img
                src={file.preview}
                alt={file.name}
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImagePreview;