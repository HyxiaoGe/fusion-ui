/**
 * 延迟重试工具函数
 * 专门用于解决服务端保存延迟导致的404错误
 */

export interface RetryOptions {
  /** 最大重试次数，默认3次 */
  maxRetries?: number;
  /** 初始延迟时间（毫秒），默认1000ms */
  initialDelay?: number;
  /** 延迟递增倍数，默认1.5 */
  backoffMultiplier?: number;
  /** 最大延迟时间（毫秒），默认10000ms */
  maxDelay?: number;
}

/**
 * 带有延迟重试的异步函数执行器
 * @param asyncFn 要执行的异步函数
 * @param options 重试选项
 * @returns Promise
 */
export async function retryWithDelay<T>(
  asyncFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffMultiplier = 1.5,
    maxDelay = 10000
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error as Error;
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        console.error(`重试失败，已达到最大重试次数 ${maxRetries}`);
        throw lastError;
      }

      // 计算下次重试的延迟时间
      const currentDelay = Math.min(delay, maxDelay);
      
      console.warn(`第 ${attempt} 次尝试失败，${currentDelay}ms 后重试...`, error);
      
      // 等待指定时间后重试
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      
      // 增加下次的延迟时间
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * 延迟执行函数（不重试）
 * @param asyncFn 要执行的异步函数
 * @param delay 延迟时间（毫秒）
 */
export function delayedExecution<T>(
  asyncFn: () => Promise<T>,
  delay: number = 1000
): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const result = await asyncFn();
        resolve(result);
      } catch (error) {
        console.error('延迟执行失败:', error);
        // 延迟执行失败时不抛出错误，避免影响主流程
      }
    }, delay);
  });
} 