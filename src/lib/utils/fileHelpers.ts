export interface FileWithPreview extends File {
    preview: string;
  }

  /**
   * 发送消息时携带的文件附件元数据
   * 替代 FileWithPreview[] + string[] 的分离传参方式
   */
  export interface FileAttachment {
    fileId: string;
    filename: string;
    mimeType: string;
    previewUrl?: string;  // 本地 blob URL，用于发送后立即展示缩略图
  }
  
  export type SupportedFileType = 
    | 'image' 
    | 'document' 
    | 'pdf' 
    | 'code' 
    | 'archive' 
    | 'unknown';
  
  // 获取文件类型
  export function getFileType(file: File): SupportedFileType {
    if (file.type.startsWith('image/')) {
      return 'image';
    } else if (file.type === 'application/pdf') {
      return 'pdf';
    } else if (
      file.type === 'application/msword' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/vnd.ms-excel' ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'text/plain'
    ) {
      return 'document';
    } else if (
      file.type === 'text/javascript' ||
      file.type === 'text/html' ||
      file.type === 'text/css' ||
      file.name.match(/\.(jsx|tsx|py|java|c|cpp|php|rb|go|rs)$/)
    ) {
      return 'code';
    } else if (
      file.type === 'application/zip' ||
      file.type === 'application/x-rar-compressed' ||
      file.type === 'application/x-7z-compressed'
    ) {
      return 'archive';
    }
    return 'unknown';
  }
  
  // 格式化文件大小
  export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  }
  
  // 创建带预览URL的文件对象
  export function createFileWithPreview(file: File): FileWithPreview {
    const fileWithPreview = file as FileWithPreview;
    fileWithPreview.preview = URL.createObjectURL(file);
    return fileWithPreview;
  }
  
  // 释放文件预览URL，避免内存泄漏
  export function revokeFilePreview(file: FileWithPreview): void {
    URL.revokeObjectURL(file.preview);
  }