/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: string;
  message: string;
  data: T | null;
  request_id: string;
}

/** API 错误，携带 code 和 request_id 用于追踪 */
export class ApiError extends Error {
  code: string;
  requestId: string;

  constructor(code: string, message: string, requestId: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId;
  }
}
