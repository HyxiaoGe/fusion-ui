import { getFileStatus } from '@/lib/api/files';
import { AppDispatch } from '@/redux/store';
import { updateFileStatus } from '@/redux/slices/fileUploadSlice';

// 轮询间隔配置（毫秒）
const INITIAL_INTERVAL = 500;   // 初始轮询间隔：0.5秒，改短以更快获取状态
const MAX_INTERVAL = 3000;      // 最大轮询间隔：3秒，改短以确保更频繁的状态更新
const BACKOFF_FACTOR = 1.2;     // 退避因子：每次增加20%，减小以使增长更平缓
const MAX_RETRIES = 60;         // 最大重试次数：60次（约3分钟）

interface PollerConfig {
  fileId: string;
  chatId?: string;
  dispatch: AppDispatch;
  onComplete?: (success: boolean) => void;
}

/**
 * 文件状态轮询器 - 在文件上传后跟踪其处理状态
 */
export class FileStatusPoller {
  private fileId: string;
  private chatId?: string;
  private dispatch: AppDispatch;
  private currentInterval: number = INITIAL_INTERVAL;
  private attempts: number = 0;
  private timerId?: NodeJS.Timeout;
  private isPolling: boolean = false;
  private onComplete?: (success: boolean) => void;

  constructor(config: PollerConfig) {
    this.fileId = config.fileId;
    this.chatId = config.chatId;
    this.dispatch = config.dispatch;
    this.onComplete = config.onComplete;
  }

  /**
   * 开始轮询文件状态
   */
  public start(): void {
    if (this.isPolling) return;
    
    this.isPolling = true;
    console.log(`开始轮询文件 ${this.fileId} 状态`);
    
    // 立即执行一次查询，不等待初始间隔
    this.pollStatus();
  }

  /**
   * 停止轮询
   */
  public stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
    this.isPolling = false;
  }

  /**
   * 轮询文件状态
   */
  private pollStatus = async (): Promise<void> => {
    if (!this.isPolling || this.attempts >= MAX_RETRIES) {
      // 如果已达到最大重试次数，标记为错误
      if (this.attempts >= MAX_RETRIES) {
        console.log(`文件 ${this.fileId} 轮询达到最大次数(${MAX_RETRIES})，标记为错误`);
        this.dispatch(updateFileStatus({
          fileId: this.fileId,
          chatId: this.chatId,
          status: 'error',
          errorMessage: '文件处理超时，请重试'
        }));
        if (this.onComplete) {
          this.onComplete(false);
        }
      }
      this.stop();
      return;
    }

    try {
      console.log(`轮询文件 ${this.fileId} 状态，尝试次数: ${this.attempts}, 间隔: ${this.currentInterval}ms`);
      const statusResponse = await getFileStatus(this.fileId);
      console.log(`文件 ${this.fileId} 状态更新: ${statusResponse.status}`);
      
      // 更新Redux状态
      this.dispatch(updateFileStatus({
        fileId: this.fileId,
        chatId: this.chatId,
        status: statusResponse.status,
        errorMessage: statusResponse.error_message
      }));

      // 根据状态决定是否继续轮询
      if (statusResponse.status === 'processed' || statusResponse.status === 'error') {
        // 处理完成或出错，停止轮询
        this.stop();
        if (this.onComplete) {
          this.onComplete(statusResponse.status === 'processed');
        }
        return;
      }

      // 增加重试计数并计算下一次间隔
      this.attempts++;
      if (this.attempts > 3) { // 前3次使用初始间隔
        this.currentInterval = Math.min(
          this.currentInterval * BACKOFF_FACTOR,
          MAX_INTERVAL
        );
      }

      // 安排下一次轮询
      this.timerId = setTimeout(this.pollStatus, this.currentInterval);
    } catch (error) {
      console.error(`轮询文件 ${this.fileId} 状态失败:`, error);
      
      // 增加失败计数
      this.attempts++;
      
      // 如果失败但未达到最大重试次数，继续重试
      if (this.attempts < MAX_RETRIES) {
        // 使用更长的间隔重试
        this.currentInterval = Math.min(
          this.currentInterval * BACKOFF_FACTOR * 2, // 失败时使用更激进的增长因子
          MAX_INTERVAL
        );
        this.timerId = setTimeout(this.pollStatus, this.currentInterval);
      } else {
        // 已达到最大重试次数，标记为错误
        this.dispatch(updateFileStatus({
          fileId: this.fileId,
          chatId: this.chatId,
          status: 'error',
          errorMessage: '获取文件状态失败，请重试'
        }));
        this.stop();
        if (this.onComplete) {
          this.onComplete(false);
        }
      }
    }
  };
}

// 轮询管理器 - 用于管理多个文件的轮询
const pollers: { [fileId: string]: FileStatusPoller } = {};

/**
 * 开始轮询文件状态
 */
export function startPollingFileStatus(
  fileId: string,
  chatId: string,
  dispatch: AppDispatch,
  onComplete?: (success: boolean) => void
): void {
  // 如果已经在轮询，先停止
  if (pollers[fileId]) {
    pollers[fileId].stop();
  }
  
  // 创建新的轮询器
  const poller = new FileStatusPoller({
    fileId,
    chatId,
    dispatch,
    onComplete
  });
  
  // 保存并启动轮询
  pollers[fileId] = poller;
  poller.start();
}

/**
 * 停止轮询文件状态
 */
export function stopPollingFileStatus(fileId: string): void {
  if (pollers[fileId]) {
    pollers[fileId].stop();
    delete pollers[fileId];
  }
}

/**
 * 停止所有文件的轮询
 */
export function stopAllPolling(): void {
  Object.values(pollers).forEach(poller => poller.stop());
  Object.keys(pollers).forEach(key => delete pollers[key]);
}