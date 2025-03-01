'use client';

import React, { useState, useRef } from 'react';
import { PaperclipIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createFileWithPreview, FileWithPreview, formatFileSize } from '@/lib/utils/fileHelpers';
import FileCard from './FileCard';

interface FileUploadProps {
  onFilesChange: (files: FileWithPreview[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFilesChange,
  maxFiles = 5,
  maxSizeMB = 10,
  disabled = false,
}) => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selectedFiles = Array.from(e.target.files || []);
    
    // 检查文件数量限制
    if (files.length + selectedFiles.length > maxFiles) {
      setError(`最多可上传 ${maxFiles} 个文件`);
      return;
    }
    
    // 检查文件大小限制
    const oversizedFiles = selectedFiles.filter(file => file.size > maxSizeBytes);
    if (oversizedFiles.length > 0) {
      setError(`文件大小不能超过 ${maxSizeMB}MB`);
      return;
    }
    
    // 处理文件并添加预览
    const newFiles = selectedFiles.map(file => createFileWithPreview(file));
    const updatedFiles = [...files, ...newFiles];
    setFiles(updatedFiles);
    onFilesChange(updatedFiles);
    
    // 重置文件输入
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    const updatedFiles = [...files];
    updatedFiles.splice(index, 1);
    setFiles(updatedFiles);
    onFilesChange(updatedFiles);
  };

  const handleButtonClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        ref={fileInputRef}
        disabled={disabled}
      />
      
      <div className="flex flex-col space-y-2">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {files.map((file, index) => (
              <FileCard
                key={`${file.name}-${index}`}
                file={file}
                onRemove={() => handleRemoveFile(index)}
              />
            ))}
          </div>
        )}
        
        {files.length < maxFiles && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleButtonClick}
            disabled={disabled}
            className="w-auto mr-auto"
          >
            <PaperclipIcon className="h-4 w-4 mr-2" />
            添加文件
          </Button>
        )}
        
        {error && (
          <p className="text-destructive text-sm mt-1">{error}</p>
        )}
        
        <p className="text-muted-foreground text-xs">
          最多 {maxFiles} 个文件，每个最大 {maxSizeMB}MB
        </p>
      </div>
    </div>
  );
};

export default FileUpload;