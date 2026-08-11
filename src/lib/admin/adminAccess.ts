import { ApiError } from '@/types/api';

const ACCESS_ERROR_CODES = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'ADMIN_UNAUTHORIZED',
  'ADMIN_FORBIDDEN',
]);

export function isAdminAccessError(error: unknown): boolean {
  return error instanceof ApiError && ACCESS_ERROR_CODES.has(error.code);
}
