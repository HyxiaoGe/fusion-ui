// FileUpload.tsx
"use client";

import { uploadFiles } from "@/lib/api/files";
import {
  FileWithPreview,
  createFileWithPreview,
} from "@/lib/utils/fileHelpers";
import { useAppDispatch } from "@/redux/hooks";
import {
  addFileId,
  setUploadProgress,
  setUploading
} from "@/redux/slices/fileUploadSlice";
import { AlertCircle } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// 导入FilePond相关组件和插件
import FilePondPluginFileValidateSize from "filepond-plugin-file-validate-size";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import FilePondPluginImageExifOrientation from "filepond-plugin-image-exif-orientation";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import { FilePond, registerPlugin } from "react-filepond";

// 导入FilePond CSS
import { FilePondFile } from "filepond";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";
import "filepond/dist/filepond.min.css";
import { toast } from "../ui/toast";

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
  provider: string;
  model: string;
  conversationId: string;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  uploading?: boolean;
  progress?: number;
  onUploadComplete?: (fileIds: string[]) => void;
}

const FileUpload = forwardRef<any, FileUploadProps>(({
  files,
  onFilesChange,
  provider,
  model,
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

  // 添加上传控制器引用
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 暴露更完整的重置方法
  useImperativeHandle(ref, () => ({
    resetFiles: () => {
      // 通知父组件清除文件
      onFilesChange([]);

      // 清除本地状态
      setLocalFiles([]);
      setUploadedFiles(new Set());
      setLocalError(null);

      // 清除FilePond实例的文件
      if (pondRef.current) {
        pondRef.current.removeFiles();
      }

      // 中止任何正在进行的上传
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // 清除进度条
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // 重置上传状态
      dispatch(setUploading(false));
      dispatch(setUploadProgress(0));

      console.log('已完全重置文件状态');
    }
  }));

  // 当组件卸载时清理
  useEffect(() => {
    return () => {
      // 清理任何正在进行的上传
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // 清理进度条定时器
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }
  }, []);

  // 当外部files变化时更新本地状态
  useEffect(() => {
    console.log('外部files变化:', files);

    // 如果外部files为空，完全清除FilePond
    if (files.length === 0) {
      setLocalFiles([]);
      // 直接清除FilePond实例
      if (pondRef.current) {
        pondRef.current.removeFiles();
      }
      return;
    }

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

  useEffect(() => {
    // 组件挂载时清理状态
    setProcessedFileIds(new Set());
    setLocalFiles([]);

    return () => {
      // 组件卸载时清理
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [provider, model, conversationId]);

  const [processedFileIds, setProcessedFileIds] = useState<Set<string>>(new Set());

  // 自定义server配置来控制上传行为
  const serverConfig = {
    process: (fieldName: string, file: File, metadata: any, load: Function, error: Function, progress: Function, abort: Function) => {
      // 为文件创建唯一ID（可以使用名称+大小的组合）
      const fileId = `${file.name}-${file.size}`;

      // 如果文件已经上传过，直接标记为完成
      if (processedFileIds.has(fileId)) {
        console.log('文件已处理，跳过上传:', file.name);
        setTimeout(() => load(fileId), 100);
        return;
      }

      // 添加锁定机制，防止并发上传
      if (abortControllerRef.current) {
        console.log('已有上传任务正在进行，取消旧任务');
        abortControllerRef.current.abort();
      }

      // 创建新的中止控制器
      abortControllerRef.current = new AbortController();

      // 清理任何现有的进度定时器
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // 正常上传流程
      dispatch(setUploading(true));
      dispatch(setUploadProgress(0));

      progress(0);

      let isAborted = false;

      // 执行实际上传，但增加中止控制
      try {
        // 修改uploadFiles调用，确保传递abort controller
        uploadFiles(provider, model, conversationId, [file], abortControllerRef.current, 0)
          .then(fileIds => {
            // 如果用户已取消，不处理结果
            if (isAborted) return;

            progress(100);
            dispatch(setUploadProgress(100));

            if (fileIds.length > 0) {
              setProcessedFileIds(prev => new Set(prev).add(fileId));

              // 处理文件预览和ID
              const fileWithPreview = createFileWithPreview(file);
              (fileWithPreview as any).fileId = fileIds[0];

              // 更新父组件的文件列表 - 只替换而不是追加
              onFilesChange([fileWithPreview]);

              dispatch(addFileId({
                chatId: conversationId,
                fileId: fileIds[0],
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
          })
          .catch(err => {
            if (!isAborted) {
              console.error("文件上传失败:", err);
              toast.error("文件上传失败，请重试");
              dispatch(setUploading(false));
              error('上传失败');
            }
          });
      } catch (err) {
        // 处理同步错误
        if (!isAborted) {
          console.error("文件上传处理错误:", err);
          dispatch(setUploading(false));
          error('处理失败');
        }
      }

      // 返回中止函数，这是关键部分
      return {
        abort: () => {
          console.log('用户取消了上传:', file.name);
          isAborted = true;

          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }

          // 重置上传状态
          dispatch(setUploading(false));
          dispatch(setUploadProgress(0));
          abort();
        }
      };
    },
    revert: null
  };

  // 处理文件上传完成后的移除
  const handleRemoveFile = (error: any, file: FilePondFile, index: number) => {
    console.log('移除文件:', file.filename);

    // 通知父组件清除文件
    onFilesChange([]);

    // 重置上传状态
    dispatch(setUploading(false));
    dispatch(setUploadProgress(0));
  };

  // 添加对上传取消的处理
  const handleAbortItemLoad = (file: FilePondFile) => {
    console.log('处理文件取消事件:', file.filename);

    // 确保中止正在进行的上传
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 清理进度条
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // 重置上传状态
    dispatch(setUploading(false));
    dispatch(setUploadProgress(0));

    // 重要：通知父组件文件已被取消
    onFilesChange([]);
  };

  return (
    <div className="w-full">
      <FilePond
        ref={pondRef}
        files={localFiles}
        onupdatefiles={(files) => {
          setLocalFiles(files);

          // 如果FilePond中没有文件，通知父组件
          if (files.length === 0 && localFiles.length > 0) {
            onFilesChange([]);
          }
        }}
        allowMultiple={false}
        maxFiles={maxFiles}
        server={serverConfig}
        maxFileSize={`${maxSizeMB}MB`}
        name="files"
        beforeAddFile={(file) => {
          console.log('beforeAddFile检查:', file.filename);
          // 检查是否已经在上传队列
          if (localFiles.some(f => f.filename === file.filename)) {
            console.log('文件已在队列中，不重复添加');
            return false;
          }
          return true;
        }}
        onaddfile={(error, file) => {
          console.log('onaddfile:', file?.filename);
          setProcessedFileIds(prev => new Set(prev));
        }}
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
        /* 关键：添加取消事件处理 */
        onabortprocessing={handleAbortItemLoad}
        /* 确保处理文件移除 */
        onremovefile={handleRemoveFile}
        /* 确保其他事件处理也正常工作 */
        onprocessfileabort={handleAbortItemLoad}
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