import { API_CONFIG } from '@/lib/config';
import type {
  KnowledgeBase,
  KnowledgeBaseCreatePayload,
  KnowledgeBasePage,
  KnowledgeBaseUpdatePayload,
  KnowledgeDocument,
  KnowledgeDocumentChunkPage,
  KnowledgeDocumentPage,
  KnowledgeDocumentUploadResult,
  KnowledgePageParams,
  KnowledgeTask,
} from '@/types/knowledge';

import { apiRequest } from './fetchWithAuth';

const knowledgeBasesPath = `${API_CONFIG.BASE_URL}/api/knowledge-bases`;
const jsonHeaders = { 'Content-Type': 'application/json' };
const defaultPage = 1;
const defaultPageSize = 20;

interface KnowledgeBaseEnvelope {
  knowledge_base: KnowledgeBase;
}

interface KnowledgeDocumentEnvelope {
  document: KnowledgeDocument;
}

interface KnowledgeTaskEnvelope {
  task: KnowledgeTask;
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

function withSignal(options: RequestInit, signal?: AbortSignal): RequestInit {
  return signal ? { ...options, signal } : options;
}

function getRequest<T>(url: string, signal?: AbortSignal): Promise<T> {
  return signal ? apiRequest<T>(url, { signal }) : apiRequest<T>(url);
}

function paginationQuery(params: KnowledgePageParams = {}): string {
  const searchParams = new URLSearchParams({
    page: String(params.page ?? defaultPage),
    page_size: String(params.pageSize ?? defaultPageSize),
  });
  return searchParams.toString();
}

export async function createKnowledgeBase(
  payload: KnowledgeBaseCreatePayload,
  signal?: AbortSignal,
): Promise<KnowledgeBase> {
  const data = await apiRequest<KnowledgeBaseEnvelope>(`${knowledgeBasesPath}/`, withSignal({
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  }, signal));
  return data.knowledge_base;
}

export async function listKnowledgeBases(
  params: KnowledgePageParams = {},
  signal?: AbortSignal,
): Promise<KnowledgeBasePage> {
  return getRequest<KnowledgeBasePage>(`${knowledgeBasesPath}/?${paginationQuery(params)}`, signal);
}

export async function getKnowledgeBase(
  knowledgeBaseId: string,
  signal?: AbortSignal,
): Promise<KnowledgeBase> {
  const data = await getRequest<KnowledgeBaseEnvelope>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}`,
    signal,
  );
  return data.knowledge_base;
}

export async function updateKnowledgeBase(
  knowledgeBaseId: string,
  payload: KnowledgeBaseUpdatePayload,
  signal?: AbortSignal,
): Promise<KnowledgeBase> {
  const sanitizedPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined),
  );
  const data = await apiRequest<KnowledgeBaseEnvelope>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}`,
    withSignal({
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(sanitizedPayload),
    }, signal),
  );
  return data.knowledge_base;
}

export async function deleteKnowledgeBase(
  knowledgeBaseId: string,
  signal?: AbortSignal,
): Promise<KnowledgeTask> {
  const data = await apiRequest<KnowledgeTaskEnvelope>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}`,
    withSignal({ method: 'DELETE' }, signal),
  );
  return data.task;
}

export async function listKnowledgeDocuments(
  knowledgeBaseId: string,
  params: KnowledgePageParams = {},
  signal?: AbortSignal,
): Promise<KnowledgeDocumentPage> {
  return getRequest<KnowledgeDocumentPage>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}/documents?${paginationQuery(params)}`,
    signal,
  );
}

export async function getKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<KnowledgeDocument> {
  const data = await getRequest<KnowledgeDocumentEnvelope>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}/documents/${encodeId(documentId)}`,
    signal,
  );
  return data.document;
}

export async function listKnowledgeDocumentChunks(
  knowledgeBaseId: string,
  documentId: string,
  params: KnowledgePageParams = {},
  signal?: AbortSignal,
): Promise<KnowledgeDocumentChunkPage> {
  return getRequest<KnowledgeDocumentChunkPage>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}/documents/${encodeId(documentId)}/chunks?${paginationQuery(params)}`,
    signal,
  );
}

export async function uploadKnowledgeDocument(
  knowledgeBaseId: string,
  file: File,
  signal?: AbortSignal,
): Promise<KnowledgeDocumentUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<KnowledgeDocumentUploadResult>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}/documents`,
    withSignal({
      method: 'POST',
      body: formData,
    }, signal),
  );
}

async function requestDocumentTask(
  knowledgeBaseId: string,
  documentId: string,
  suffix: '' | '/retry' | '/rebuild',
  method: 'DELETE' | 'POST',
  signal?: AbortSignal,
): Promise<KnowledgeTask> {
  const data = await apiRequest<KnowledgeTaskEnvelope>(
    `${knowledgeBasesPath}/${encodeId(knowledgeBaseId)}/documents/${encodeId(documentId)}${suffix}`,
    withSignal({ method }, signal),
  );
  return data.task;
}

export function deleteKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<KnowledgeTask> {
  return requestDocumentTask(knowledgeBaseId, documentId, '', 'DELETE', signal);
}

export function retryKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<KnowledgeTask> {
  return requestDocumentTask(knowledgeBaseId, documentId, '/retry', 'POST', signal);
}

export function rebuildKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<KnowledgeTask> {
  return requestDocumentTask(knowledgeBaseId, documentId, '/rebuild', 'POST', signal);
}

export async function getKnowledgeTask(
  taskId: string,
  signal?: AbortSignal,
): Promise<KnowledgeTask> {
  const data = await getRequest<KnowledgeTaskEnvelope>(
    `${knowledgeBasesPath}/tasks/${encodeId(taskId)}`,
    signal,
  );
  return data.task;
}
