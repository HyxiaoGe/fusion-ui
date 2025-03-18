'use client';

import { uploadFiles } from '@/lib/api/files';
import { FileWithPreview, createFileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch } from '@/redux/hooks';
import { addFileId, setError, setUploadProgress, setUploading } from '@/redux/slices/fileUploadSlice';
import { AlertCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';

// 导入FilePond相关组件和插件
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import FilePondPluginImageExifOrientation from 'filepond-plugin-image-exif-orientation';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import { FilePond, registerPlugin } from 'react-filepond';

// 导入FilePond CSS
import { FilePondFile } from 'filepond';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css';
import 'filepond/dist/filepond.min.css';

// 注册FilePond插件
registerPlugin(
  FilePondPluginImagePreview,
  FilePondPluginFileValidateSize,
  FilePondPluginFileValidateType,
  FilePondPluginImageExifOrientation
);

interface FileUploadProps {
  files: FileWithPreview[];
  onFilesChange: (files: FileWithPreview[]) => void;
  conversationId: string;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  uploading?: boolean;
  progress?: number;
  onUploadComplete?: (fileIds: string[]) => void;
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
  onUploadComplete
}) => {
  const dispatch = useAppDispatch();
  const [localFiles, setLocalFiles] = useState<any[]>([]);
  const [error, setLocalError] = useState<string | null>(null);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // 当外部files变化时更新本地状态
  useEffect(() => {
    if (files.length > 0 && localFiles.length === 0) {
      const pondFiles = files.map(file => ({
        source: file,
        options: {
          type: 'local',
          file: {
            name: file.name,
            size: file.size,
            type: file.type
          }
        }
      }));
      setLocalFiles(pondFiles);
    }
  }, [files, localFiles.length]);

  // 处理文件上传
  const handleProcessFile = async (
    error: any,
    file: FilePondFile
  ) => {
    if (error) {
      setLocalError(error.message);
      return;
    }

    try {
      const originalFile = file.file as File;
      dispatch(setUploading(true));
      dispatch(setUploadProgress(0));

      // 设置进度更新的模拟
      let uploadProgress = 0;
      const uploadProgressInterval = setInterval(() => {
        if (uploadProgress >= 90) {
          clearInterval(uploadProgressInterval);
          dispatch(setUploadProgress(90));
        } else {
          uploadProgress += 10;
          dispatch(setUploadProgress(uploadProgress));
        }
      }, 500);

      // 上传文件
      const fileIds = await uploadFiles(conversationId, [originalFile]);
      
      // 清除定时器并设置进度为100%
      clearInterval(uploadProgressInterval);
      dispatch(setUploadProgress(100));

      // 保存文件ID到Redux
      if (fileIds.length > 0) {
        const fileIndex = files.length;
        const fileId = fileIds[0]; // 一次只处理一个文件
        
        dispatch(addFileId({
          chatId: conversationId,
          fileId,
          fileIndex
        }));
        
        // 创建带预览的文件对象
        const fileWithPreview = createFileWithPreview(originalFile);
        (fileWithPreview as any).fileId = fileId;
        
        // 更新文件列表
        const newFiles = [...files, fileWithPreview];
        onFilesChange(newFiles);
      }

      // 通知上传完成
      if (onUploadComplete) {
        onUploadComplete(fileIds);
      }

      // 短暂延迟后重置上传状态
      setTimeout(() => {
        dispatch(setUploading(false));
        dispatch(setUploadProgress(0));
      }, 500);
    } catch (error) {
      console.error('文件上传失败:', error);
      setLocalError('文件上传失败，请重试');
      dispatch(setError('文件上传失败'));
      dispatch(setUploading(false));
    }
  };

  // 处理FilePond中的文件被移除
  const handleRemoveFile = (file: any, index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    onFilesChange(newFiles);
  };

  return (
    <div className="w-full">
      <FilePond
        files={localFiles}
        onupdatefiles={setLocalFiles}
        allowMultiple={true}
        maxFiles={maxFiles}
        maxFileSize={`${maxSizeMB}MB`}
        name="files"
        labelIdle='拖放文件 <span class="filepond--label-action">或点击浏览</span>'
        labelMaxFileSizeExceeded={`文件大小超过${maxSizeMB}MB`}
        labelMaxFileSize={`最大文件大小为${maxSizeMB}MB`}
        labelFileTypeNotAllowed="不支持的文件类型"
        fileValidateTypeLabelExpectedTypes="支持图片、PDF、Word、Excel和文本文件"
        labelTapToCancel="点击取消"
        labelTapToRetry="点击重试"
        labelTapToUndo="点击撤销"
        labelButtonRemoveItem="移除"
        labelButtonAbortItemLoad="取消"
        labelButtonProcessItem="上传"
        onaddfile={handleProcessFile}
        onremovefile={(error, file, index) => handleRemoveFile(file, index)}
        disabled={disabled || uploading}
        acceptedFileTypes={[
          'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain'
        ]}
        className="filepond-upload-container"
      />

      {uploading && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">上传中... {progress}%</p>
        </div>
      )}

      {error && (
        <div className="flex items-center p-2 mt-2 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <p className="text-muted-foreground text-xs mt-2">
        最多 {maxFiles} 个文件，每个最大 {maxSizeMB}MB
      </p>
    </div>
  );
};

export default FileUpload;