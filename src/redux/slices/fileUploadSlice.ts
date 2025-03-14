import { FileWithPreview, revokeFilePreview } from '@/lib/utils/fileHelpers';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface FileUploadState {
  files: { [chatId: string]: FileWithPreview[] };
  isUploading: boolean;
  error: string | null;
}

const initialState: FileUploadState = {
  files: {},
  isUploading: false,
  error: null,
};

const fileUploadSlice = createSlice({
  name: 'fileUpload',
  initialState,
  reducers: {
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
      state.files[chatId] = [...state.files[chatId], ...files];
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
} = fileUploadSlice.actions;

export default fileUploadSlice.reducer;