import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  mobile: string | null;
}

export const fetchUserProfileAPI = async (): Promise<UserProfile> => {
  const response = await fetchWithAuth(`${API_CONFIG.BASE_URL}/api/users/profile`);
  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }
  const data: UserProfile = await response.json();
  return data;
}; 