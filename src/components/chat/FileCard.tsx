'use client';

import React from 'react';
import { X, FileIcon, ImageIcon, FileTextIcon, FileCodeIcon, ArchiveIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FileWithPreview, getFileType, formatFileSize } from '@/lib/utils/fileHelpers';
import ImagePreview from './ImagePreview';

interface FileCardProps {
  file: FileWithPreview;
  onRemove: () => void;
}

const FileCard: React.FC<FileCardProps> = ({ file, onRemove }) => {
  const fileType = getFileType(file);
  const fileSize = formatFileSize(file.size);

  const renderFileIcon = () => {
    switch (fileType) {
      case 'image':
        return <ImagePreview file={file} />;
      case 'document':
        return <FileTextIcon className="h-10 w-10 text-blue-500" />;
      case 'pdf':
        return <FileTextIcon className="h-10 w-10 text-red-500" />;
      case 'code':
        return <FileCodeIcon className="h-10 w-10 text-green-500" />;
      case 'archive':
        return <ArchiveIcon className="h-10 w-10 text-amber-500" />;
      default:
        return <FileIcon className="h-10 w-10 text-gray-500" />;
    }
  };

  return (
    <div className="group relative flex items-center space-x-3 rounded-md border border-border p-2 bg-card">
      <div className="shrink-0">
        {fileType === 'image' ? (
          <ImagePreview file={file} />
        ) : (
          <div className="flex items-center justify-center w-12 h-12">
            {renderFileIcon()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-sm font-medium truncate">{file.name}</p>
          </TooltipTrigger>
          <TooltipContent>
            <p>{file.name}</p>
          </TooltipContent>
        </Tooltip>
        <p className="text-xs text-muted-foreground">{fileSize}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default FileCard;