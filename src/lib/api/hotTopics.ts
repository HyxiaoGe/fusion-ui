import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL;

export interface HotTopic {
  id: string;
  title: string;
  category: string;
  description?: string;
  source: string;
  url: string;
  published_at: string;
  created_at: string;
  view_count: number;
}

// 本地缓存
let topicsCache: HotTopic[] = [];
let lastFetchTime: number = 0;
const CACHE_EXPIRY_TIME = 10 * 60 * 1000; // 缓存过期时间，10分钟
let pollingInitialized = false; // 标记是否已初始化轮询
let ongoingRequest: Promise<HotTopic[]> | null = null; // 跟踪进行中的请求

// 获取缓存的热点话题，不直接请求API
export const getCachedHotTopics = async (limit: number = 50): Promise<HotTopic[]> => {
  // 如果缓存不为空，直接返回缓存数据
  if (topicsCache.length > 0) {
    return topicsCache.slice(0, limit);
  }
  
  // 确保初始化了轮询
  initHotTopicsPolling();
  
  // 如果已经有请求在进行中，等待该请求完成
  if (ongoingRequest) {
    console.log('已有请求进行中，等待结果...');
    try {
      const data = await ongoingRequest;
      return data.slice(0, limit);
    } catch (error) {
      console.error('等待已有请求失败:', error);
      // 如果进行中的请求失败，继续执行后续逻辑
    }
  }
  
  // 如果缓存为空且没有进行中的请求，发起新请求
  try {
    console.log('缓存为空，请求热点话题数据');
    // 调用fetchHotTopics获取数据
    return await fetchHotTopics(limit, true);
  } catch (error) {
    console.error('获取热点话题失败:', error);
    return []; // 出错时返回空数组
  }
};

export const fetchHotTopics = async (limit: number = 30, forceRefresh: boolean = false): Promise<HotTopic[]> => {
  // 如果有缓存且未过期且不强制刷新，则返回缓存数据
  const now = Date.now();
  if (!forceRefresh && topicsCache.length > 0 && (now - lastFetchTime) < CACHE_EXPIRY_TIME) {
    return topicsCache;
  }

  // 如果已经有请求在进行中，等待该请求完成
  if (ongoingRequest) {
    console.log('已有fetchHotTopics请求进行中，等待结果...');
    try {
      return await ongoingRequest;
    } catch (error) {
      console.error('等待已有请求失败:', error);
      // 如果进行中的请求失败，继续创建新请求
    }
  }
  
  // 创建新的请求
  try {
    console.log(`请求热点话题API: limit=${limit}, forceRefresh=${forceRefresh}`);
    ongoingRequest = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/topics/hot?limit=${limit}`);
        if (!response.ok) {
          throw new Error('获取热点话题失败');
        }
        const data = await response.json();
        
        // 更新缓存
        topicsCache = data;
        lastFetchTime = now;
        
        return data;
      } finally {
        // 确保无论成功还是失败，都清空进行中的请求引用
        ongoingRequest = null;
      }
    })();
    
    return await ongoingRequest;
  } catch (error) {
    console.error('获取热点话题失败:', error);
    // 如果请求失败但缓存中有数据，则返回缓存数据
    if (topicsCache.length > 0) {
      return topicsCache;
    }
    ongoingRequest = null; // 确保清除引用
    return [];
  }
};

// 初始化数据加载函数
export const initHotTopicsPolling = (intervalMinutes: number = 10) => {
  // 如果已经初始化过，直接返回
  if (pollingInitialized) return;
  
  // 标记为已初始化
  pollingInitialized = true;
  
  console.log('初始化热点话题轮询...');
  
  // 应用启动时立即获取一次数据
  fetchHotTopics();
  
  // 设置定时获取
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(() => {
    console.log('定时刷新热点话题...');
    fetchHotTopics();
  }, intervalMs);
}; 