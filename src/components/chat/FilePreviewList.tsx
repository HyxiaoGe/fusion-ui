import React, { useEffect } from 'react';
import FilePreviewItem from './FilePreviewItem';

interface FilePreviewListProps {
  files: Array<{
    file: File;
    previewUrl: string;
    id: string;
  }>;
  onRemove: (id: string) => void;
}

const FilePreviewList: React.FC<FilePreviewListProps> = ({ files, onRemove }) => {
  useEffect(() => {
    console.log('FilePreviewList接收到的文件列表:', files);
  }, [files]);

  if (files.length === 0) return null;
  
  return (
    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto p-2 border rounded-md bg-background/50">
      <p className="text-xs font-medium text-muted-foreground mb-1">已选择 {files.length} 个文件</p>
      {files.map((fileItem) => (
        <FilePreviewItem
          key={fileItem.id}
          file={fileItem.file}
          previewUrl={fileItem.previewUrl}
          onRemove={() => onRemove(fileItem.id)}
        />
      ))}
    </div>
  );
};

export default FilePreviewList;