import { FileWithPreview, revokeFilePreview } from '@/lib/utils/fileHelpers';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// 文件处理状态
export type FileProcessingStatus = 'pending' | 'uploading' | 'parsing' | 'processed' | 'error';

interface FileWithId extends FileWithPreview {
  fileId?: string; // 服务器返回的文件ID
  status?: FileProcessingStatus; // 文件处理状态
  errorMessage?: string; // 错误信息
}

interface FileUploadState {
  files: { [chatId: string]: FileWithId[] };
  fileIds: { [chatId: string]: string[] }; // 存储每个对话的文件ID列表
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  processingFiles: { [fileId: string]: FileProcessingStatus };
}

const initialState: FileUploadState = {
  files: {},
  fileIds: {},
  isUploading: false,
  uploadProgress: 0,
  error: null,
  processingFiles: {},
};

const fileUploadSlice = createSlice({
  name: 'fileUpload',
  initialState,
  reducers: {
    setFileIds: (
      state,
      action: PayloadAction<{ chatId: string; fileIds: string[] }>
    ) => {
      const { chatId, fileIds } = action.payload;
      state.fileIds[chatId] = fileIds;
    },
    addFileId: (
      state,
      action: PayloadAction<{ chatId: string; fileId: string; fileIndex: number }>
    ) => {
      const { chatId, fileId, fileIndex } = action.payload;
      if (!state.fileIds[chatId]) {
        state.fileIds[chatId] = [];
      }
      state.fileIds[chatId].push(fileId);
      
      // 同时更新对应文件对象中的fileId属性
      if (state.files[chatId] && state.files[chatId][fileIndex]) {
        state.files[chatId][fileIndex].fileId = fileId;
        // 上传成功后，将状态设置为parsing
        state.files[chatId][fileIndex].status = 'parsing';
        // 添加到正在处理的文件列表
        state.processingFiles[fileId] = 'parsing';
      }
    },
    updateFileStatus: (
      state,
      action: PayloadAction<{ 
        fileId: string; 
        status: FileProcessingStatus;
        errorMessage?: string;
        chatId?: string; 
      }>
    ) => {
      const { fileId, status, errorMessage, chatId } = action.payload;
      
      // 更新全局处理状态跟踪
      state.processingFiles[fileId] = status;
      
      // 如果提供了chatId，则更新相应聊天中的文件状态
      if (chatId && state.files[chatId]) {
        const fileIndex = state.files[chatId].findIndex(file => file.fileId === fileId);
        if (fileIndex !== -1) {
          state.files[chatId][fileIndex].status = status;
          if (errorMessage) {
            state.files[chatId][fileIndex].errorMessage = errorMessage;
          }
        }
      } else {
        // 如果没有提供chatId，尝试在所有聊天中查找该文件
        Object.keys(state.files).forEach(chatKey => {
          const fileIndex = state.files[chatKey].findIndex(file => file.fileId === fileId);
          if (fileIndex !== -1) {
            state.files[chatKey][fileIndex].status = status;
            if (errorMessage) {
              state.files[chatKey][fileIndex].errorMessage = errorMessage;
            }
          }
        });
      }
    },
    removeFileId: (
      state,
      action: PayloadAction<{ chatId: string; fileId: string }>
    ) => {
      const { chatId, fileId } = action.payload;
      if (state.fileIds[chatId]) {
        state.fileIds[chatId] = state.fileIds[chatId].filter(id => id !== fileId);
      }

      // 同时从处理状态跟踪中移除
      if (state.processingFiles[fileId]) {
        delete state.processingFiles[fileId];
      }
    },
    setUploadProgress: (state, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    setFiles: (
      state,
      action: PayloadAction<{ chatId: string; files: FileWithPreview[] }>
    ) => {
      const { chatId, files } = action.payload;
      // 释放之前的预览URL，避免内存泄漏
      if (state.files[chatId]) {
        state.files[chatId].forEach(file => revokeFilePreview(file));
      }
      // 设置初始状态为pending
      const filesWithStatus = files.map(file => ({
        ...file,
        status: 'pending' as FileProcessingStatus
      }));
      state.files[chatId] = filesWithStatus;
    },
    addFiles: (
      state,
      action: PayloadAction<{ chatId: string; files: FileWithPreview[] }>
    ) => {
      const { chatId, files } = action.payload;
      if (!state.files[chatId]) {
        state.files[chatId] = [];
      }
      // 设置初始状态为pending
      const filesWithStatus = files.map(file => ({
        ...file,
        status: 'pending' as FileProcessingStatus
      }));
      state.files[chatId] = filesWithStatus;
    },
    removeFile: (
      state,
      action: PayloadAction<{ chatId: string; fileIndex: number }>
    ) => {
      const { chatId, fileIndex } = action.payload;
      if (state.files[chatId] && state.files[chatId][fileIndex]) {
        // 获取文件ID，也从处理状态跟踪中删除
        const fileId = state.files[chatId][fileIndex].fileId;
        if (fileId && state.processingFiles[fileId]) {
          delete state.processingFiles[fileId];
        }
        
        // 释放预览URL
        revokeFilePreview(state.files[chatId][fileIndex]);
        // 从数组中移除
        state.files[chatId] = state.files[chatId].filter((_, i) => i !== fileIndex);
      }
    },
    clearFiles: (state, action: PayloadAction<string>) => {
      const chatId = action.payload;
      if (state.files[chatId]) {
        // 释放所有预览URL
        state.files[chatId].forEach(file => {
          revokeFilePreview(file);
          // 如果有fileId，从处理状态跟踪中移除
          if (file.fileId) {
            delete state.processingFiles[file.fileId];
          }
        });
        delete state.files[chatId];
      }
      // 清除该聊天的文件ID列表
      if (state.fileIds[chatId]) {
        delete state.fileIds[chatId];
      }
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.isUploading = action.payload;
      // 如果开始上传，设置所有pending状态的文件为uploading
      if (action.payload) {
        Object.keys(state.files).forEach(chatId => {
          state.files[chatId].forEach(file => {
            if (file.status === 'pending') {
              file.status = 'uploading';
            }
          });
        });
      }
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setFiles,
  addFiles,
  removeFile,
  clearFiles,
  setUploading,
  setError,
  setFileIds,
  addFileId,
  removeFileId,
  setUploadProgress,
  updateFileStatus,
} = fileUploadSlice.actions;

export default fileUploadSlice.reducer;