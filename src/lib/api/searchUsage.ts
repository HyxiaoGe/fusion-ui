import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';

export interface ProviderUsage {
  provider: string;
  available: boolean;
  remaining_credits?: number | null;
  plan_credits?: number | null;
  used_credits?: number | null;
  usage_ratio?: number | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  recorded_usage?: ProviderRecordedUsage | null;
}

export interface ProviderRecordedUsage {
  provider: string;
  available?: boolean;
  credits_used: number;
  request_count: number;
  period_start?: string | null;
  period_end?: string | null;
  source?: string | null;
}

export interface ProviderUsagePeriod {
  start_date: string;
  end_date: string;
  api_key?: string | null;
  total_credits: number;
}

export interface ProviderHistoricalUsage {
  provider: string;
  available: boolean;
  by_api_key: boolean;
  periods: ProviderUsagePeriod[];
}

export interface SearchUsageProviderCapability {
  provider: string;
  official_usage: boolean;
}

export interface SearchUsageOverview {
  generated_at: string;
  providers: SearchUsageProviderCapability[];
  firecrawl: ProviderUsage;
  historical: ProviderHistoricalUsage;
}

export const fetchSearchUsageAPI = async (): Promise<SearchUsageOverview> => {
  return apiRequest<SearchUsageOverview>(`${API_CONFIG.BASE_URL}/api/admin/search-usage`);
};
