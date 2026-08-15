export type KnowledgeBaseStatus = 'active' | 'deleting' | 'deleted';

export type KnowledgeDocumentStatus =
  | 'queued'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'writing'
  | 'ready'
  | 'failed'
  | 'deleting'
  | 'deleted';

export interface KnowledgePageParams {
  page?: number;
  pageSize?: number;
}

export interface KnowledgeBaseCreatePayload {
  name: string;
  description?: string;
  business_type?: string;
}

export interface KnowledgeBaseUpdatePayload {
  name?: string;
  description?: string;
  business_type?: string;
}

export interface KnowledgeDocumentStats {
  total: number;
  ready: number;
  processing: number;
  failed: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  business_type: string;
  status: KnowledgeBaseStatus;
  document_stats: KnowledgeDocumentStats;
  embedding_provider: string;
  embedding_model: string;
  embedding_revision: string;
  embedding_dimension: number;
  distance_metric: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface KnowledgeBasePage {
  items: KnowledgeBase[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface KnowledgeDocument {
  id: string;
  knowledge_base_id: string;
  filename: string;
  mimetype: string;
  size: number;
  checksum_sha256: string;
  status: KnowledgeDocumentStatus;
  parser_version: string;
  chunker_version: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_revision: string;
  embedding_dimension: number;
  distance_metric: string;
  desired_index_version: string;
  active_index_version: string | null;
  chunk_count: number;
  error_code: string | null;
  error_summary: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  deleted_at: string | null;
}

export interface KnowledgeDocumentPage {
  items: KnowledgeDocument[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface KnowledgeDocumentChunk {
  chunk_id: string;
  ordinal: number;
  text: string;
  char_start: number;
  char_end: number;
  page: number | null;
  section: string | null;
}

export interface KnowledgeDocumentChunkPage {
  document_id: string;
  active_index_version: string;
  chunker_version: string;
  chunk_size: number;
  chunk_overlap: number;
  items: KnowledgeDocumentChunk[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface KnowledgeTask {
  id: string;
  task_type: string;
  status: string;
  phase: string;
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocumentUploadResult {
  document: KnowledgeDocument;
  task: KnowledgeTask;
}
