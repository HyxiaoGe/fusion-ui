import { AUTH_SERVICE_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

export interface EmailUsageOverview {
  provider: string;
  configured: boolean;
  available: boolean;
  used_emails: number | null;
  monthly_quota: number | null;
  remaining_emails: number | null;
  usage_ratio: number | null;
  daily_used_emails: number | null;
  daily_quota: number | null;
  period_start: string | null;
  period_end: string | null;
  synced_at: string | null;
  source: string | null;
}

const EMAIL_USAGE_SOURCES = new Set([
  'not_configured',
  'not_synced',
  'resend_response_headers',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableCount(body: Record<string, unknown>, field: string, positive = false): number | null {
  const value = body[field];
  if (value === null) return null;
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || !Number.isInteger(value)
    || (positive ? value <= 0 : value < 0)
  ) {
    throw new Error('邮件用量接口返回了无效数据');
  }
  return value;
}

function nullableRatio(body: Record<string, unknown>, field: string): number | null {
  const value = body[field];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('邮件用量接口返回了无效数据');
  }
  return value;
}

function nullableDate(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === null) return null;
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw new Error('邮件用量接口返回了无效数据');
  }
  return value;
}

function parseEmailUsage(body: unknown): EmailUsageOverview {
  if (!isRecord(body) || body.provider !== 'resend') {
    throw new Error('邮件用量接口返回了无效数据');
  }
  if (typeof body.configured !== 'boolean' || typeof body.available !== 'boolean') {
    throw new Error('邮件用量接口返回了无效数据');
  }
  if (typeof body.source !== 'string' || !EMAIL_USAGE_SOURCES.has(body.source)) {
    throw new Error('邮件用量接口返回了无效数据');
  }

  const parsed: EmailUsageOverview = {
    provider: body.provider,
    configured: body.configured,
    available: body.available,
    used_emails: nullableCount(body, 'used_emails'),
    monthly_quota: nullableCount(body, 'monthly_quota', true),
    remaining_emails: nullableCount(body, 'remaining_emails'),
    usage_ratio: nullableRatio(body, 'usage_ratio'),
    daily_used_emails: nullableCount(body, 'daily_used_emails'),
    daily_quota: nullableCount(body, 'daily_quota', true),
    period_start: nullableDate(body, 'period_start'),
    period_end: nullableDate(body, 'period_end'),
    synced_at: nullableDate(body, 'synced_at'),
    source: body.source,
  };

  const commonShapeValid = parsed.monthly_quota !== null
    && parsed.period_start !== null
    && parsed.period_end !== null;
  const availableShapeValid = parsed.available && (
    parsed.configured
    && parsed.used_emails !== null
    && parsed.remaining_emails !== null
    && parsed.usage_ratio !== null
    && parsed.synced_at !== null
    && parsed.source === 'resend_response_headers'
  );
  const unavailableFieldsEmpty = parsed.used_emails === null
    && parsed.remaining_emails === null
    && parsed.usage_ratio === null
    && parsed.daily_used_emails === null
    && parsed.synced_at === null;
  const notConfiguredShapeValid = !parsed.configured
    && !parsed.available
    && parsed.source === 'not_configured'
    && unavailableFieldsEmpty;
  const notSyncedShapeValid = parsed.configured
    && !parsed.available
    && parsed.source === 'not_synced'
    && unavailableFieldsEmpty;
  const stateValid = commonShapeValid
    && (availableShapeValid || notConfiguredShapeValid || notSyncedShapeValid);
  if (!stateValid) {
    throw new Error('邮件用量接口返回了无效数据');
  }
  return parsed;
}

function errorMessage(body: unknown, status: number): string {
  const detail = typeof body === 'object' && body !== null && 'detail' in body
    ? body.detail
    : null;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  return `邮件用量查询失败（HTTP ${status}）`;
}

export async function fetchEmailUsageAPI(): Promise<EmailUsageOverview> {
  const baseUrl = AUTH_SERVICE_CONFIG.ADMIN_BASE_URL.replace(/\/+$/, '');
  const response = await fetchWithAuth(`${baseUrl}/admin/email-usage`, { method: 'GET' });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('邮件用量接口返回了无效 JSON');
  }

  if (!response.ok) {
    throw new Error(errorMessage(body, response.status));
  }

  return parseEmailUsage(body);
}
