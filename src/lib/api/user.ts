import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  mobile: string | null;
  loginProvider?: 'github' | 'google' | null;
  system_prompt: string;
}

export const fetchUserProfileAPI = async (): Promise<UserProfile> => {
  return apiRequest<UserProfile>(`${API_CONFIG.BASE_URL}/api/auth/me`);
};

export const updateUserSettingsAPI = async (
  systemPrompt: string,
): Promise<{ system_prompt: string }> => {
  return apiRequest<{ system_prompt: string }>(`${API_CONFIG.BASE_URL}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system_prompt: systemPrompt }),
  });
};
