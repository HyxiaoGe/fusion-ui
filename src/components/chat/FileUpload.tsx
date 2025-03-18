'use client';

import { uploadFiles } from '@/lib/api/files';
import { FileWithPreview, createFileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch } from '@/redux/hooks';
import { addFileId, setError, setUploadProgress, setUploading } from '@/redux/slices/fileUploadSlice';
import { AlertCircle } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

// 导入FilePond相关组件和插件
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import FilePondPluginImageExifOrientation from 'filepond-plugin-image-exif-orientation';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import { FilePond, FilePondFile, registerPlugin } from 'react-filepond';

// 导入FilePond CSS
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
  const [localError, setLocalError] = useState<string | null>(null);
  const pondRef = useRef<FilePond>(null);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  // 组件挂载时清理文件状态
  useEffect(() => {
    return () => {
      // 组件卸载时清理
      if (pondRef.current) {
        pondRef.current.removeFiles();
      }
    };
  }, []);

  // 处理文件添加
  const handleFileAdded = async (error: any, file: FilePondFile) => {
    if (error) {
      console.error('文件添加错误:', error);
      setLocalError(error.message || '添加文件时发生错误');
      return;
    }

    try {
      const originalFile = file.file as File;
      
      // 先将文件添加到UI列表中，但标记为上传中
      const fileWithPreview = createFileWithPreview(originalFile);
      const newFiles = [...files, fileWithPreview];
      onFilesChange(newFiles);
      
      dispatch(setUploading(true));
      dispatch(setUploadProgress(0));

      // 设置进度更新
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

      try {
        // 上传文件
        const fileIds = await uploadFiles(conversationId, [originalFile]);
        
        // 清除定时器并设置进度为100%
        clearInterval(uploadProgressInterval);
        dispatch(setUploadProgress(100));

        // 保存文件ID到Redux
        if (fileIds.length > 0) {
          const fileIndex = files.length;
          const fileId = fileIds[0];
          
          dispatch(addFileId({
            chatId: conversationId,
            fileId,
            fileIndex
          }));
          
          // 更新文件对象添加fileId
          (fileWithPreview as any).fileId = fileId;
          
          // 更新文件列表
          const updatedFiles = [...files.slice(0, -1), fileWithPreview];
          onFilesChange(updatedFiles);
        }

        // 通知上传完成
        if (onUploadComplete) {
          onUploadComplete(fileIds);
        }
      } catch (error: any) {
        console.error('文件上传失败:', error);
        setLocalError('文件上传失败，请重试: ' + (error.message || '未知错误'));
        
        // 移除已添加的文件
        const newFiles = [...files];
        newFiles.pop(); // 移除最后添加的文件
        onFilesChange(newFiles);
        
        // 从FilePond UI中移除
        if (pondRef.current) {
          pondRef.current.removeFile(file.id);
        }
        
        dispatch(setError('文件上传失败'));
      } finally {
        // 重置上传状态
        clearInterval(uploadProgressInterval);
        dispatch(setUploading(false));
        dispatch(setUploadProgress(0));
      }
    } catch (error: any) {
      console.error('处理文件时发生错误:', error);
      setLocalError('处理文件时发生错误: ' + (error.message || '未知错误'));
      dispatch(setUploading(false));
    }
  };

  // 处理文件移除
  const handleFileRemoved = (file: FilePondFile) => {
    try {
      const originalFile = file.file as File;
      const fileIndex = files.findIndex(f => 
        f.name === originalFile.name && f.size === originalFile.size
      );
      
      if (fileIndex !== -1) {
        const newFiles = [...files];
        newFiles.splice(fileIndex, 1);
        onFilesChange(newFiles);
        
        // 清除错误消息
        setLocalError(null);
      }
    } catch (error) {
      console.error('移除文件错误:', error);
    }
  };

  // 手动渲染已上传文件
  const renderUploadedFiles = () => {
    return files.map((file, index) => (
      <div key={index} className="flex items-center space-x-2 p-2 bg-muted rounded-md mt-2">
        <span className="text-sm truncate flex-1">{file.name}</span>
        <button 
          onClick={() => {
            const newFiles = [...files];
            newFiles.splice(index, 1);
            onFilesChange(newFiles);
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    ));
  };

  // FilePond 实例加载完成时
  const handleInit = () => {
    console.log('FilePond 初始化完成');
  };

  return (
    <div className="w-full">
      <FilePond
        ref={pondRef}
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
        onaddfile={handleFileAdded}
        onremovefile={(error, file) => handleFileRemoved(file)}
        disabled={disabled || uploading}
        allowRevert={false}
        instantUpload={false}
        oninit={handleInit}
        server={{
          process: (fieldName, file, metadata, load, error, progress) => {
            // 模拟上传进度 - 实际上传由handleFileAdded处理
            const interval = setInterval(() => {
              progress(true, {}, 100);
            }, 500);
            
            // 2秒后完成
            setTimeout(() => {
              clearInterval(interval);
              load(true);
            }, 2000);
            
            return {
              abort: () => {
                clearInterval(interval);
              }
            };
          }
        }}
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

      {/* 显示已上传文件列表 - 更可靠的方式 */}
      <div className="mt-4">
        <h3 className="text-sm font-medium mb-2">已上传文件</h3>
        {files.length > 0 ? renderUploadedFiles() : (
          <p className="text-sm text-muted-foreground">无已上传文件</p>
        )}
      </div>

      {localError && (
        <div className="flex items-center p-2 mt-2 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
          <p className="text-sm">{localError}</p>
        </div>
      )}

      <p className="text-muted-foreground text-xs mt-2">
        最多 {maxFiles} 个文件，每个最大 {maxSizeMB}MB
      </p>
    </div>
  );
};

export default FileUpload;