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
  setError,
  setUploadProgress,
  setUploading,
  FileProcessingStatus
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
import { startPollingFileStatus, stopAllPolling, stopPollingFileStatus } from "@/lib/api/FileStatusPoller";

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

      // 停止所有轮询
      stopAllPolling();
      // 重置上传状态
      dispatch(setUploading(false));
      dispatch(setUploadProgress(0));

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
      // 停止所有轮询
      stopAllPolling();
    }
  }, []);

  // 当外部files变化时更新本地状态
  useEffect(() => {

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
        // 获取文件状态
        const status = (file as any).status || 'pending';

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
                fileId: (file as any).fileId,
                // 文件状态
                status: status
              },
              // 标记为已处理状态，避免再次处理
              metadata: {
                processed: status === 'processed',
                status: status
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
              type: file.type,
              status: status
            },
            metadata: {
              status: status
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
  }, [conversationId]);

  const [processedFileIds, setProcessedFileIds] = useState<Set<string>>(new Set());

  // 自定义server配置来控制上传行为
  const serverConfig = {
    process: (fieldName: string, file: File, metadata: any, load: Function, error: Function, progress: Function, abort: Function) => {
      // 为文件创建唯一ID（可以使用名称+大小的组合）
      const fileId = `${file.name}-${file.size}`;

      // 如果文件已经上传过，直接标记为完成
      if (processedFileIds.has(fileId)) {
        // 直接调用load完成上传过程，但不实际发送请求
        setTimeout(() => load(fileId), 100);
        return;
      }

      // 重要: 清理任何之前的控制器
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // 创建新的中止控制器
      abortControllerRef.current = new AbortController();

      // 清理之前的进度条定时器
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // 正常上传流程
      dispatch(setUploading(true));
      dispatch(setUploadProgress(0));

      // 进度条模拟
      let progressValue = 0;
      progressIntervalRef.current = setInterval(() => {
        progressValue += 10;
        if (progressValue >= 90) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
        }
        progress(progressValue);
        dispatch(setUploadProgress(progressValue));
      }, 300);

      let isAborted = false;

      // 定义明确的中止处理函数
      const abortUpload = () => {
        isAborted = true;

        // 清理进度定时器
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        // 中止网络请求
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }

        // 重置上传状态
        dispatch(setUploading(false));
        dispatch(setUploadProgress(0));

        // 通知FilePond上传已中止
        abort();
      };

      // 执行实际上传，但增加中止控制
      try {
        // 修改uploadFiles调用，确保传递abort controller
        uploadFiles(provider, model, conversationId, [file], abortControllerRef.current)
          .then(fileIds => {
            // 如果用户已取消，不处理结果
            if (isAborted) return;

            // 正常上传完成流程
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }

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
              (fileWithPreview as any).status = 'parsing' as FileProcessingStatus;

              // 更新父组件的文件列表 - 只替换而不是追加
              onFilesChange([fileWithPreview]);

              dispatch(addFileId({
                chatId: conversationId,
                fileId: uploadedFileId,
                fileIndex: 0,
              }));

              // 上传完成后，开始轮询文件状态
              startPollingFileStatus(
                uploadedFileId,
                conversationId,
                dispatch,
                (success) => {
                  // 轮询完成回调
                  if (success) {
                    // 可以在这里触发其他操作
                  } else {
                    // 显示错误状态
                    setLocalError('文件处理失败，请重试');
                  }
                  // 处理完成后，完成上传流程
                  if (onUploadComplete) {
                    onUploadComplete(fileIds);
                  }
                }
              );
            }

            setTimeout(() => {
              dispatch(setUploading(false));
              dispatch(setUploadProgress(0));
            }, 500);

            // 完成上传处理
            load(fileId);
          })
          .catch(err => {
            // 只处理非中止的错误
            if (!isAborted && err.name !== 'AbortError') {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
              }

              console.error("文件上传失败:", err);
              setLocalError("文件上传失败，请重试");
              dispatch(setError("文件上传失败"));
              dispatch(setUploading(false));
              error('上传失败');
            }
          });
      } catch (err) {
        // 处理同步错误
        if (!isAborted) {
          console.error("文件上传处理错误:", err);
          setLocalError("文件处理失败");
          dispatch(setError("文件处理失败"));
          dispatch(setUploading(false));
          error('处理失败');
        }
      }

      // 返回中止函数，这是关键部分
      return {
        abort: abortUpload
      };
    },
    // 不需要实现revert，因为我们在关闭时保留文件
    revert: null
  };

  // 处理文件上传完成后的移除
  const handleRemoveFile = (error: any, file: FilePondFile, index: number) => {

    // 获取文件ID
    const fileId = (file.file as any)?.fileId;

    // 如果文件已上传并正在轮询，停止轮询
    if (fileId) {
      stopPollingFileStatus(fileId);
    }

    // 通知父组件清除文件
    onFilesChange([]);

    // 重置上传状态
    dispatch(setUploading(false));
    dispatch(setUploadProgress(0));
  };

  // 添加对上传取消的处理
  const handleAbortItemLoad = (file: FilePondFile) => {

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

  const getStatusLabel = (file: any): string => {
    const status = file.status || 'pending';
    switch (status) {
      case 'pending': return '等待上传';
      case 'uploading': return '正在上传...';
      case 'parsing': return '正在处理文件...';
      case 'processed': return '文件已就绪';
      case 'error': return file.errorMessage || '处理失败';
      default: return '未知状态';
    }
  };

  return (
    <div className="w-full">
      <FilePond
        ref={pondRef}
        files={localFiles}
        onupdatefiles={(files) => {
          setLocalFiles(files);

          // 如果FilePond中没有文件，通知父组件
          if (files.length === 0) {
            onFilesChange([]);
          }
        }}
        allowMultiple={false}
        maxFiles={maxFiles}
        server={serverConfig}
        maxFileSize={`${maxSizeMB}MB`}
        name="files"
        beforeAddFile={(file) => {
          // 如果文件已经有fileId，说明已上传
          if (file.file && (file.file as any).fileId) {
            // 返回true允许添加，但后续会跳过上传处理
            return true;
          }
          return true; // 允许添加新文件
        }}
        onaddfile={(error, file) => {
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

      {/* 显示当前处理状态 */}
      {files.length > 0 && (files[0] as any).status && (files[0] as any).status !== 'processed' && (
        <div className={`flex items-center p-2 mt-2 rounded-md
          ${(files[0] as any).status === 'error'
            ? 'bg-destructive/10 text-destructive'
            : (files[0] as any).status === 'parsing'
              ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
              : 'bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200'
          }`}>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {getStatusLabel(files[0])}
            </p>
            {(files[0] as any).status === 'parsing' && (
              <div className="w-full bg-amber-200 dark:bg-amber-800 h-1 mt-1 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full animate-pulse rounded-full" style={{ width: '100%' }}></div>
              </div>
            )}
          </div>
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