import { FileWithPreview, revokeFilePreview } from '@/lib/utils/fileHelpers';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface FileWithId extends FileWithPreview {
  fileId?: string; // 服务器返回的文件ID
}

interface FileUploadState {
  files: { [chatId: string]: FileWithId[] };
  fileIds: { [chatId: string]: string[] }; // 存储每个对话的文件ID列表
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
}

const initialState: FileUploadState = {
  files: {},
  fileIds: {},
  isUploading: false,
  uploadProgress: 0,
  error: null,
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
      }
    },
    
    // 删除文件ID
    removeFileId: (
      state,
      action: PayloadAction<{ chatId: string; fileId: string }>
    ) => {
      const { chatId, fileId } = action.payload;
      if (state.fileIds[chatId]) {
        state.fileIds[chatId] = state.fileIds[chatId].filter(id => id !== fileId);
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
      state.files[chatId] = files;
    },
    addFiles: (
      state,
      action: PayloadAction<{ chatId: string; files: FileWithPreview[] }>
    ) => {
      const { chatId, files } = action.payload;
      if (!state.files[chatId]) {
        state.files[chatId] = [];
      }
      state.files[chatId] = files;
    },
    removeFile: (
      state,
      action: PayloadAction<{ chatId: string; fileIndex: number }>
    ) => {
      const { chatId, fileIndex } = action.payload;
      if (state.files[chatId] && state.files[chatId][fileIndex]) {
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
        state.files[chatId].forEach(file => revokeFilePreview(file));
        delete state.files[chatId];
      }
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.isUploading = action.payload;
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
} = fileUploadSlice.actions;

export default fileUploadSlice.reducer;