"use client";

import { uploadFiles } from "@/lib/api/files";
import {
  FileWithPreview,
  createFileWithPreview,
} from "@/lib/utils/fileHelpers";
import { useAppDispatch } from "@/redux/hooks";
import {
  addFileId,
  setError,
  setUploadProgress,
  setUploading,
} from "@/redux/slices/fileUploadSlice";
import { AlertCircle } from "lucide-react";
import React, { useEffect, useState, forwardRef, useRef, useImperativeHandle } from "react";

// 导入FilePond相关组件和插件
import FilePondPluginFileValidateSize from "filepond-plugin-file-validate-size";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import FilePondPluginImageExifOrientation from "filepond-plugin-image-exif-orientation";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import { FilePond, registerPlugin } from "react-filepond";

// 导入FilePond CSS
import { FilePondFile, FileStatus } from "filepond";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";
import "filepond/dist/filepond.min.css";

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

// 修复：删除了fileUploadRef属性，添加了ref参数
const FileUpload = forwardRef<any, FileUploadProps>(({
  files,
  onFilesChange,
  conversationId,
  maxFiles = 5,
  maxSizeMB = 10,
  disabled = false,
  uploading = false,
  progress = 0,
  onUploadComplete,
}, ref) => {
  const dispatch = useAppDispatch();
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set());
  const [localFiles, setLocalFiles] = useState<any[]>([]);
  const [error, setLocalError] = useState<string | null>(null);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const pondRef = useRef<FilePond>(null);

  useImperativeHandle(ref, () => ({
    resetFiles: () => {
      if (pondRef.current) {
        pondRef.current.removeFiles();
      }
    }
  }));

  // 当外部files变化时更新本地状态
  useEffect(() => {
    // 当外部files变化时，更新FilePond的本地状态
    if (files.length > 0) {
      // 转换为FilePond可识别的格式
      const pondFiles = files.map((file) => {
        // 标记已上传的文件，包含fileId信息
        if ((file as any).fileId) {
          return {
            source: file,
            options: {
              type: "local",
              file: {
                name: file.name,
                size: file.size,
                type: file.type,
                // 标记文件已上传
                fileId: (file as any).fileId
              },
              // 标记为已处理状态，避免再次处理
              metadata: {
                processed: true
              }
            }
          };
        }
        return {
          source: file,
          options: {
            type: "local",
            file: {
              name: file.name,
              size: file.size,
              type: file.type
            }
          }
        };
      });
      setLocalFiles(pondFiles);
    }
  }, [files]);

  const [processedFileIds, setProcessedFileIds] = useState<Set<string>>(new Set());

  // 自定义server配置来控制上传行为
  const serverConfig = {
    process: (fieldName: string, file: File, metadata: any, load: Function, error: Function, progress: Function, abort: Function) => {
      // 为文件创建唯一ID（可以使用名称+大小的组合）
      const fileId = `${file.name}-${file.size}`;

      // 如果文件已经上传过，直接标记为完成
      if (processedFileIds.has(fileId)) {
        console.log('文件已处理，不再重复上传:', file.name);
        // 直接调用load完成上传过程，但不实际发送请求
        setTimeout(() => load(fileId), 100);
        return;
      }

      // 正常上传流程
      dispatch(setUploading(true));
      dispatch(setUploadProgress(0));

      // 进度条模拟
      let progressValue = 0;
      const interval = setInterval(() => {
        progressValue += 10;
        if (progressValue >= 90) {
          clearInterval(interval);
        }
        progress(progressValue);
        dispatch(setUploadProgress(progressValue));
      }, 300);

      // 执行实际上传
      uploadFiles(conversationId, [file]).then(fileIds => {
        clearInterval(interval);
        progress(100);
        dispatch(setUploadProgress(100));

        if (fileIds.length > 0) {
          const uploadedFileId = fileIds[0];

          // 保存到已处理文件集合
          setProcessedFileIds(prev => {
            const newSet = new Set(prev);
            newSet.add(fileId);
            return newSet;
          });

          // 处理文件预览和ID
          const fileWithPreview = createFileWithPreview(file);
          (fileWithPreview as any).fileId = uploadedFileId;
          onFilesChange([fileWithPreview]);

          dispatch(addFileId({
            chatId: conversationId,
            fileId: uploadedFileId,
            fileIndex: 0,
          }));
        }

        if (onUploadComplete) {
          onUploadComplete(fileIds);
        }

        setTimeout(() => {
          dispatch(setUploading(false));
          dispatch(setUploadProgress(0));
        }, 500);

        // 完成上传处理
        load(fileId);
      }).catch(err => {
        clearInterval(interval);
        console.error("文件上传失败:", err);
        setLocalError("文件上传失败，请重试");
        dispatch(setError("文件上传失败"));
        dispatch(setUploading(false));
        error('上传失败');
      });

      // 返回中止函数
      return {
        abort: () => {
          abort();
          dispatch(setUploading(false));
        }
      };
    },
    // 不需要实现revert，因为我们在关闭时保留文件
    revert: null
  };

  // 处理文件上传
  const handleProcessFile = async (error: any, file: FilePondFile) => {
    if (error) {
      setLocalError(error.message);
      return;
    }

    // 检查文件是否已上传过（通过自定义属性）
    if (file.file && (file.file as any).fileId) {
      console.log('文件已上传，跳过处理', (file.file as any).fileId);
      return;
    }

    try {
      const originalFile = file.file as File;
      dispatch(setUploading(true));
      dispatch(setUploadProgress(0));

      // 检查文件是否已上传过
      if (uploadedFiles.has(originalFile.name)) {
        console.log("文件已上传，跳过重复上传:", originalFile.name);
        return; // 直接返回，不再上传
      }

      // 设置进度更新的模拟
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        if (progress >= 90) {
          clearInterval(interval);
        }
        dispatch(setUploadProgress(progress));
      }, 300);

      // 上传文件
      const fileIds = await uploadFiles(conversationId, [originalFile]);
      clearInterval(interval);
      dispatch(setUploadProgress(100));

      // 保存文件ID到Redux
      if (fileIds.length > 0) {
        const fileIndex = files.length;
        const fileId = fileIds[0]; // 一次只处理一个文件

        // 标记文件已上传
        (file.file as any).fileId = fileId;

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

      setUploadedFiles(prev => {
        const newSet = new Set(prev);
        newSet.add(originalFile.name);
        return newSet;
      });

      // 短暂延迟后重置上传状态
      setTimeout(() => {
        dispatch(setUploading(false));
        dispatch(setUploadProgress(0));
      }, 500);
    } catch (error) {
      console.error("文件上传失败:", error);
      setLocalError("文件上传失败，请重试");
      dispatch(setError("文件上传失败"));
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
        ref={pondRef}
        files={localFiles}
        onupdatefiles={setLocalFiles}
        allowMultiple={false}
        maxFiles={maxFiles}
        server={serverConfig}
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
        beforeAddFile={(file) => {
          // 如果文件已经有fileId，说明已上传
          if (file.file && (file.file as any).fileId) {
            console.log('检测到已上传的文件:', (file.file as any).fileId);
            // 返回true允许添加，但后续会跳过上传处理
            return true;
          }
          return true; // 允许添加新文件
        }}
        onaddfile={handleProcessFile}
        onremovefile={(error, file, index) => handleRemoveFile(file, index)}
        disabled={disabled || uploading}
        acceptedFileTypes={[
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/gif",
          "image/webp",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/plain",
        ]}
        className="filepond-upload-container"
      />
      <p className="text-muted-foreground text-xs mt-2">
        单次对话仅支持上传1个文件，最大 {maxSizeMB}MB
      </p>

      {uploading && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">
            上传中... {progress}%
          </p>
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
});

FileUpload.displayName = 'FileUpload';

export default FileUpload;