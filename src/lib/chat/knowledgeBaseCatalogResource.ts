import { getChatCapabilities } from '@/lib/api/chat';
import { listKnowledgeBases } from '@/lib/api/knowledgeBases';
import type { KnowledgeBase } from '@/types/knowledge';

export const KNOWLEDGE_BASE_CATALOG_TTL_MS = 30_000;

const KNOWLEDGE_BASE_PAGE_SIZE = 100;
const MAX_KNOWLEDGE_BASE_PAGES = 20;
const MAX_KNOWLEDGE_BASE_ITEMS = 1_000;
const MAX_KNOWLEDGE_BASE_CATALOG_SCOPES = 8;

export interface KnowledgeBaseCatalogData {
  items: KnowledgeBase[];
  maxSelectedKnowledgeBases: number;
}

export interface KnowledgeBaseCatalogSnapshot {
  data: KnowledgeBaseCatalogData | null;
  error: unknown | null;
  isLoading: boolean;
  updatedAt: number;
}

export type KnowledgeSelectionStatus =
  | 'ready'
  | 'loading'
  | 'failed'
  | 'unavailable'
  | 'limit_exceeded';

interface KnowledgeBaseCatalogRequest {
  controller: AbortController;
  epoch: number;
  generation: number;
  promise: Promise<void>;
}

const emptySnapshot: KnowledgeBaseCatalogSnapshot = {
  data: null,
  error: null,
  isLoading: false,
  updatedAt: 0,
};

const snapshots = new Map<string, KnowledgeBaseCatalogSnapshot>();
const listeners = new Map<string, Set<() => void>>();
const requests = new Map<string, KnowledgeBaseCatalogRequest>();
const generations = new Map<string, number>();
let resourceEpoch = 0;

function isAvailableForQuestionAnswering(base: KnowledgeBase): boolean {
  return base.status === 'active' && base.document_stats.ready > 0;
}

async function loadKnowledgeBaseCatalog(signal: AbortSignal): Promise<KnowledgeBaseCatalogData> {
  const capabilities = await getChatCapabilities(signal);
  if (
    !capabilities.knowledge_grounding_v1
    || !Number.isSafeInteger(capabilities.knowledge_grounding_max_bases)
    || capabilities.knowledge_grounding_max_bases < 1
  ) {
    throw new Error('当前服务端不支持严格知识库问答');
  }

  const items: KnowledgeBase[] = [];
  let page = 1;
  let hasNext = true;
  let scannedItemCount = 0;

  while (
    hasNext
    && page <= MAX_KNOWLEDGE_BASE_PAGES
    && scannedItemCount < MAX_KNOWLEDGE_BASE_ITEMS
  ) {
    const result = await listKnowledgeBases({
      page,
      pageSize: KNOWLEDGE_BASE_PAGE_SIZE,
    }, signal);
    const remainingItemBudget = MAX_KNOWLEDGE_BASE_ITEMS - scannedItemCount;
    const inspectedItems = result.items.slice(0, remainingItemBudget);
    scannedItemCount += inspectedItems.length;
    items.push(...inspectedItems.filter(isAvailableForQuestionAnswering));
    hasNext = result.has_next;
    page += 1;
  }

  return {
    items,
    maxSelectedKnowledgeBases: capabilities.knowledge_grounding_max_bases,
  };
}

function getGeneration(scopeKey: string): number {
  return generations.get(scopeKey) ?? 0;
}

function notify(scopeKey: string): void {
  const scopeListeners = listeners.get(scopeKey);
  if (!scopeListeners) return;
  [...scopeListeners].forEach((listener) => listener());
}

function setSnapshot(scopeKey: string, snapshot: KnowledgeBaseCatalogSnapshot): void {
  snapshots.delete(scopeKey);
  snapshots.set(scopeKey, snapshot);
  while (snapshots.size > MAX_KNOWLEDGE_BASE_CATALOG_SCOPES) {
    const oldestScope = snapshots.keys().next().value as string | undefined;
    if (!oldestScope || listeners.has(oldestScope) || requests.has(oldestScope)) break;
    snapshots.delete(oldestScope);
    generations.delete(oldestScope);
  }
  notify(scopeKey);
}

export function getKnowledgeBaseCatalogSnapshot(
  scopeKey: string | null,
): KnowledgeBaseCatalogSnapshot {
  if (!scopeKey) return emptySnapshot;
  return snapshots.get(scopeKey) ?? emptySnapshot;
}

export function getEmptyKnowledgeBaseCatalogSnapshot(): KnowledgeBaseCatalogSnapshot {
  return emptySnapshot;
}

export function resolveKnowledgeBaseSelectionStatus(
  snapshot: KnowledgeBaseCatalogSnapshot,
  selectedIds: string[],
): KnowledgeSelectionStatus {
  if (selectedIds.length === 0) return 'ready';
  if (snapshot.data) {
    if (selectedIds.length > snapshot.data.maxSelectedKnowledgeBases) {
      return 'limit_exceeded';
    }
    const availableIds = new Set(snapshot.data.items.map((item) => item.id));
    return selectedIds.some((id) => !availableIds.has(id)) ? 'unavailable' : 'ready';
  }
  return snapshot.error ? 'failed' : 'loading';
}

export function subscribeKnowledgeBaseCatalog(
  scopeKey: string | null,
  listener: () => void,
): () => void {
  if (!scopeKey) return () => {};
  const scopeListeners = listeners.get(scopeKey) ?? new Set<() => void>();
  scopeListeners.add(listener);
  listeners.set(scopeKey, scopeListeners);
  return () => {
    scopeListeners.delete(listener);
    if (scopeListeners.size === 0) listeners.delete(scopeKey);
  };
}

export function isKnowledgeBaseCatalogFresh(
  snapshot: KnowledgeBaseCatalogSnapshot,
): boolean {
  return snapshot.data !== null
    && snapshot.updatedAt > 0
    && Date.now() - snapshot.updatedAt < KNOWLEDGE_BASE_CATALOG_TTL_MS;
}

export function ensureKnowledgeBaseCatalog(
  scopeKey: string,
  forceRefresh = false,
): Promise<void> {
  const snapshot = getKnowledgeBaseCatalogSnapshot(scopeKey);
  const currentRequest = requests.get(scopeKey);
  if (currentRequest) return currentRequest.promise;
  if (!forceRefresh && isKnowledgeBaseCatalogFresh(snapshot)) {
    return Promise.resolve();
  }

  const generation = getGeneration(scopeKey);
  const epoch = resourceEpoch;
  const controller = new AbortController();
  setSnapshot(scopeKey, {
    ...snapshot,
    error: null,
    isLoading: snapshot.data === null,
  });

  const promise = loadKnowledgeBaseCatalog(controller.signal)
    .then((data) => {
      if (epoch !== resourceEpoch || generation !== getGeneration(scopeKey)) return;
      setSnapshot(scopeKey, {
        data,
        error: null,
        isLoading: false,
        updatedAt: Date.now(),
      });
    })
    .catch((error) => {
      if (epoch === resourceEpoch && generation === getGeneration(scopeKey)) {
        setSnapshot(scopeKey, {
          ...getKnowledgeBaseCatalogSnapshot(scopeKey),
          error,
          isLoading: false,
        });
      }
      throw error;
    })
    .finally(() => {
      if (requests.get(scopeKey)?.promise === promise) {
        requests.delete(scopeKey);
      }
    });
  requests.set(scopeKey, { controller, epoch, generation, promise });
  return promise;
}

export function invalidateKnowledgeBaseCatalog(scopeKey: string | null): void {
  if (!scopeKey) return;
  const snapshot = snapshots.get(scopeKey);
  generations.set(scopeKey, getGeneration(scopeKey) + 1);
  requests.get(scopeKey)?.controller.abort();
  requests.delete(scopeKey);
  if (snapshot) {
    setSnapshot(scopeKey, {
      ...snapshot,
      error: null,
      isLoading: false,
      updatedAt: 0,
    });
  }
  // mounted consumer 的连续失效必须各自替换在途请求；不能只依赖 updatedAt=0
  // 触发 effect，因为第二次失效时该依赖值不会变化。
  if (listeners.has(scopeKey)) {
    void ensureKnowledgeBaseCatalog(scopeKey, true).catch(() => {});
  }
}

export function resetKnowledgeBaseCatalogResource(): void {
  resourceEpoch += 1;
  const activeListeners = [...listeners.values()].flatMap((scopeListeners) => [
    ...scopeListeners,
  ]);
  requests.forEach((request) => request.controller.abort());
  snapshots.clear();
  requests.clear();
  generations.clear();
  activeListeners.forEach((listener) => listener());
}
