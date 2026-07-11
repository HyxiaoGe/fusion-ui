import { ApiError } from '@/types/api';

const ACCESS_ERROR_CODES = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'ADMIN_UNAUTHORIZED',
  'ADMIN_FORBIDDEN',
]);

export function isAdminAccessError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return ACCESS_ERROR_CODES.has(error.code);
  }
  return error instanceof Error && /\b40[13]\b|unauthorized|forbidden/i.test(error.message);
}
