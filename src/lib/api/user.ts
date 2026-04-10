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
}

export const fetchUserProfileAPI = async (): Promise<UserProfile> => {
  return apiRequest<UserProfile>(`${API_CONFIG.BASE_URL}/api/auth/me`);
};
