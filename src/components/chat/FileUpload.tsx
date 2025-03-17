'use client';

import { Progress } from '@/components/ui/progress';
import { createFileWithPreview, FileWithPreview } from '@/lib/utils/fileHelpers';
import { AlertCircle, UploadIcon } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { FileRejection, useDropzone } from 'react-dropzone';
import FileCard from './FileCard';

interface FileUploadProps {
  files: FileWithPreview[]; 
  onFilesChange: (files: FileWithPreview[]) => void;
  conversationId?: string; // 设为可选
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  uploading?: boolean;
  progress?: number;
  simulateMode?: boolean; // 新增，是否为模拟模式
}

const FileUpload: React.FC<FileUploadProps> = ({
  files,
  onFilesChange,
  conversationId,
  maxFiles = 5,
  maxSizeMB = 10,
  disabled = false,
  uploading = false,
  progress = 0,
  simulateMode = false // 默认为非模拟模式
}) => {
  const [error, setError] = useState<string | null>(null);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFileProcess = useCallback(
    (selectedFiles: File[]) => {
      setError(null);
      
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
      onFilesChange(updatedFiles);
    },
    [files, maxFiles, maxSizeBytes, maxSizeMB, onFilesChange]
  );

  // 处理被拒绝的文件
  const handleRejectedFiles = useCallback((rejectedFiles: FileRejection[]) => {
    // 检查拒绝原因
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      
      // 文件类型不匹配
      if (rejection.errors.some(e => e.code === 'file-invalid-type')) {
        setError(`不支持的文件格式: ${rejection.file.name}`);
      } 
      // 文件过大
      else if (rejection.errors.some(e => e.code === 'file-too-large')) {
        setError(`文件 ${rejection.file.name} 超过了 ${maxSizeMB}MB 的大小限制`);
      }
      // 其他错误
      else {
        setError('文件上传失败，请检查文件格式和大小');
      }
    }
  }, [maxSizeMB]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileProcess,
    onDropRejected: handleRejectedFiles,
    disabled: disabled || uploading,
    maxSize: maxSizeBytes,
    multiple: true,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
    }
  });

  const handleRemoveFile = (index: number) => {
    const updatedFiles = [...files];
    updatedFiles.splice(index, 1);
    onFilesChange(updatedFiles);
  };

  return (
    <div className="w-full">
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-md p-4 transition-colors ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-muted'
        } ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center justify-center text-center">
          <UploadIcon className="h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">
            {isDragActive ? '释放文件以上传' : '拖拽文件到此处或点击上传'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            支持图片、PDF、Word、Excel和文本文件，最大 {maxSizeMB}MB
          </p>
          {simulateMode && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              文件将在发送消息时上传
            </p>
          )}
        </div>
      </div>
      
      {uploading && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">上传中... {progress}%</p>
          <Progress value={progress} className="h-1" />
        </div>
      )}
      
      <div className="flex flex-col space-y-2 mt-4">
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
        
        {error && (
          <div className="flex items-center p-2 mt-2 bg-destructive/10 text-destructive rounded-md">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        
        <p className="text-muted-foreground text-xs">
          最多 {maxFiles} 个文件，每个最大 {maxSizeMB}MB
        </p>
      </div>
    </div>
  );
};

export default FileUpload;