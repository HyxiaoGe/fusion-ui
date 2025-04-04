import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL;

export interface HotTopic {
  id: string;
  title: string;
  description?: string;
  source: string;
  url: string;
  published_at: string;
  created_at: string;
  view_count: number;
}

export interface RefreshResponse {
  status: string;
  message: string;
  new_count: number;
  timestamp: string;
}

export const fetchHotTopics = async (limit: number = 50): Promise<HotTopic[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/topics/hot?limit=${limit}`);
    if (!response.ok) {
      throw new Error('获取热点话题失败');
    }
    return await response.json();
  } catch (error) {
    console.error('获取热点话题失败:', error);
    return [];
  }
};

export const refreshHotTopics = async (force: boolean = true): Promise<RefreshResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/topics/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      throw new Error('刷新热点话题失败');
    }
    return await response.json();
  } catch (error) {
    console.error('刷新热点话题失败:', error);
    throw error;
  }
}; 