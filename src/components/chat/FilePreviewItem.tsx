import React from 'react';
import { FileIcon, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatFileSize, getFileType } from '@/lib/utils/fileHelpers';

interface FilePreviewItemProps {
  file: File;
  previewUrl: string;
  onRemove: () => void;
}

const FilePreviewItem: React.FC<FilePreviewItemProps> = ({ 
  file, 
  previewUrl, 
  onRemove 
}) => {
  const fileType = getFileType(file);
  const isImage = fileType === 'image';

  // 根据文件类型选择不同图标
  const getIcon = () => {
    switch(fileType) {
      case 'image':
        return <ImageIcon className="w-6 h-6 text-blue-500" />;
      case 'pdf':
        return <FileIcon className="w-6 h-6 text-red-500" />;
      case 'document':
        return <FileIcon className="w-6 h-6 text-green-500" />;
      case 'code':
        return <FileIcon className="w-6 h-6 text-purple-500" />;
      case 'archive':
        return <FileIcon className="w-6 h-6 text-yellow-500" />;
      default:
        return <FileIcon className="w-6 h-6 text-muted-foreground" />;
    }
  };

  return (
    <div className="relative flex items-center gap-3 p-2 border rounded-md bg-background group">
      {/* 文件图标 */}
      <div className="flex-shrink-0 w-12 h-12 overflow-hidden rounded-md border flex items-center justify-center bg-muted/20">
        {getIcon()}
      </div>
      
      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        {isImage && <p className="text-xs text-blue-500">图片文件</p>}
      </div>
      
      {/* 删除按钮 */}
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

export default FilePreviewItem;