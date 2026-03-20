export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  chatId?: string;
  status?: 'pending' | 'failed' | null;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
    previewUrl?: string;
    fileId?: string;
  }[];
  reasoning?: string;
  isReasoningVisible?: boolean;
  reasoningStartTime?: number;
  reasoningEndTime?: number;
  shouldSyncToDb?: boolean;
  turnId?: string;
  messageType?: string;
  duration?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  provider?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type HydrationStatus = 'idle' | 'loading' | 'done' | 'error';
