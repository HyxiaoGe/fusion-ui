import type { FileInfo } from '@/lib/api/files';

export const CONVERSATION_FILES_CACHE_TTL_MS = 30_000;
const MAX_CONVERSATION_FILES_CACHE_ENTRIES = 100;

export interface ConversationFilesCacheEntry {
  files: FileInfo[];
  generation: number;
  updatedAt: number;
}

export interface ConversationFilesResourceSnapshot {
  error: unknown | null;
  files: FileInfo[];
  generation: number;
  hasData: boolean;
  isLoading: boolean;
  updatedAt: number;
}

export interface ConversationFilesRequestResult {
  accepted: boolean;
  files: FileInfo[];
  generation: number;
}

export interface ConversationFilesInFlightRequest {
  epoch: number;
  generation: number;
  kind: 'load' | 'refresh';
  promise: Promise<ConversationFilesRequestResult>;
}

export type ConversationFilesLoader = (conversationId: string) => Promise<FileInfo[]>;

const conversationFilesCache = new Map<string, ConversationFilesCacheEntry>();
const conversationFilesGenerations = new Map<string, number>();
const conversationFilesInFlight = new Map<string, ConversationFilesInFlightRequest>();
const conversationFilesSnapshots = new Map<string, ConversationFilesResourceSnapshot>();
const conversationFilesListeners = new Map<string, Set<() => void>>();
let conversationFilesCacheEpoch = 0;
let emptyConversationFilesSnapshot = createEmptySnapshot();

function createEmptySnapshot(): ConversationFilesResourceSnapshot {
  return {
    error: null,
    files: [],
    generation: 0,
    hasData: false,
    isLoading: false,
    updatedAt: 0,
  };
}

function getConversationFilesGeneration(conversationId: string): number {
  return conversationFilesGenerations.get(conversationId) ?? 0;
}

function notifyConversationFilesListeners(conversationId: string): void {
  const listeners = conversationFilesListeners.get(conversationId);
  if (!listeners) return;
  [...listeners].forEach((listener) => listener());
}

function setConversationFilesSnapshot(
  conversationId: string,
  snapshot: ConversationFilesResourceSnapshot,
  notify = true,
): void {
  conversationFilesSnapshots.set(conversationId, snapshot);
  if (notify) {
    notifyConversationFilesListeners(conversationId);
  }
}

function cleanupUnusedConversationFilesState(conversationId: string): void {
  if (
    !conversationFilesCache.has(conversationId) &&
    !conversationFilesInFlight.has(conversationId) &&
    !conversationFilesListeners.has(conversationId)
  ) {
    conversationFilesSnapshots.delete(conversationId);
    conversationFilesGenerations.delete(conversationId);
  }
}

function enforceConversationFilesCacheCapacity(): void {
  while (conversationFilesCache.size > MAX_CONVERSATION_FILES_CACHE_ENTRIES) {
    const oldestConversationId = conversationFilesCache.keys().next().value as string | undefined;
    if (!oldestConversationId) break;

    conversationFilesCache.delete(oldestConversationId);
    cleanupUnusedConversationFilesState(oldestConversationId);
  }
}

function setConversationFilesCacheEntry(
  conversationId: string,
  entry: ConversationFilesCacheEntry,
): void {
  // Map 的写入顺序作为近似 LRU；活跃订阅者仍保留当前快照，卸载后再清理。
  conversationFilesCache.delete(conversationId);
  conversationFilesCache.set(conversationId, entry);
  enforceConversationFilesCacheCapacity();
}

export function getConversationFilesCacheEntry(
  conversationId: string | null,
): ConversationFilesCacheEntry | null {
  if (!conversationId) return null;

  const entry = conversationFilesCache.get(conversationId);
  if (!entry || entry.generation !== getConversationFilesGeneration(conversationId)) {
    return null;
  }
  return entry;
}

export function getConversationFilesSnapshot(
  conversationId: string | null,
): ConversationFilesResourceSnapshot {
  if (!conversationId) return emptyConversationFilesSnapshot;
  return conversationFilesSnapshots.get(conversationId) ?? emptyConversationFilesSnapshot;
}

export function subscribeConversationFiles(
  conversationId: string | null,
  listener: () => void,
): () => void {
  if (!conversationId) return () => {};

  const listeners = conversationFilesListeners.get(conversationId) ?? new Set<() => void>();
  listeners.add(listener);
  conversationFilesListeners.set(conversationId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      conversationFilesListeners.delete(conversationId);
      cleanupUnusedConversationFilesState(conversationId);
    }
  };
}

export function isConversationFilesCacheFresh(entry: ConversationFilesCacheEntry): boolean {
  return entry.updatedAt > 0 && Date.now() - entry.updatedAt < CONVERSATION_FILES_CACHE_TTL_MS;
}

export function invalidateConversationFilesCache(
  conversationId: string,
  updateFiles?: (files: FileInfo[]) => FileInfo[],
): number {
  const generation = getConversationFilesGeneration(conversationId) + 1;
  conversationFilesGenerations.set(conversationId, generation);

  const cachedEntry = conversationFilesCache.get(conversationId);
  const currentSnapshot = getConversationFilesSnapshot(conversationId);
  const hasData = Boolean(cachedEntry || currentSnapshot.hasData);
  const files = updateFiles
    ? updateFiles(cachedEntry?.files ?? currentSnapshot.files)
    : cachedEntry?.files ?? currentSnapshot.files;

  if (hasData) {
    setConversationFilesCacheEntry(conversationId, {
      files,
      generation,
      updatedAt: 0,
    });
  }
  setConversationFilesSnapshot(conversationId, {
    error: null,
    files: hasData ? files : [],
    generation,
    hasData,
    isLoading: false,
    updatedAt: 0,
  });

  return generation;
}

function startConversationFilesRequest(
  conversationId: string,
  generation: number,
  kind: ConversationFilesInFlightRequest['kind'],
  loadConversationFiles: ConversationFilesLoader,
): ConversationFilesInFlightRequest {
  const epoch = conversationFilesCacheEpoch;
  const cachedEntry = getConversationFilesCacheEntry(conversationId);
  const currentSnapshot = getConversationFilesSnapshot(conversationId);
  const hasData = Boolean(cachedEntry || currentSnapshot.hasData);
  const files = cachedEntry?.files ?? currentSnapshot.files;

  setConversationFilesSnapshot(conversationId, {
    error: null,
    files: hasData ? files : [],
    generation,
    hasData,
    isLoading: !hasData,
    updatedAt: cachedEntry?.updatedAt ?? currentSnapshot.updatedAt,
  });

  const promise = loadConversationFiles(conversationId)
    .then((nextFiles): ConversationFilesRequestResult => {
      const accepted =
        epoch === conversationFilesCacheEpoch &&
        generation === getConversationFilesGeneration(conversationId);
      if (accepted) {
        const cacheEntry = {
          files: nextFiles,
          generation,
          updatedAt: Date.now(),
        };
        setConversationFilesCacheEntry(conversationId, cacheEntry);
        setConversationFilesSnapshot(conversationId, {
          error: null,
          files: nextFiles,
          generation,
          hasData: true,
          isLoading: false,
          updatedAt: cacheEntry.updatedAt,
        });
      }
      return { accepted, files: nextFiles, generation };
    })
    .catch((error) => {
      const isCurrentRequest =
        epoch === conversationFilesCacheEpoch &&
        generation === getConversationFilesGeneration(conversationId);
      if (isCurrentRequest) {
        const latestSnapshot = getConversationFilesSnapshot(conversationId);
        setConversationFilesSnapshot(conversationId, {
          ...latestSnapshot,
          error,
          generation,
          isLoading: false,
        });
      }
      throw error;
    })
    .finally(() => {
      if (conversationFilesInFlight.get(conversationId)?.promise === promise) {
        conversationFilesInFlight.delete(conversationId);
        cleanupUnusedConversationFilesState(conversationId);
      }
    });

  const request = { epoch, generation, kind, promise };
  conversationFilesInFlight.set(conversationId, request);
  return request;
}

export function getOrStartConversationFilesRequest(
  conversationId: string,
  forceRefresh: boolean,
  loadConversationFiles: ConversationFilesLoader,
): ConversationFilesInFlightRequest {
  const generation = getConversationFilesGeneration(conversationId);
  const currentRequest = conversationFilesInFlight.get(conversationId);

  if (forceRefresh) {
    if (
      currentRequest?.kind === 'refresh' &&
      currentRequest.epoch === conversationFilesCacheEpoch &&
      currentRequest.generation === generation
    ) {
      return currentRequest;
    }

    const refreshGeneration = invalidateConversationFilesCache(conversationId);
    return startConversationFilesRequest(
      conversationId,
      refreshGeneration,
      'refresh',
      loadConversationFiles,
    );
  }

  if (
    currentRequest?.epoch === conversationFilesCacheEpoch &&
    currentRequest.generation === generation
  ) {
    return currentRequest;
  }

  return startConversationFilesRequest(conversationId, generation, 'load', loadConversationFiles);
}

export function isCurrentConversationFilesRequest(
  conversationId: string,
  request: ConversationFilesInFlightRequest,
): boolean {
  return (
    request.epoch === conversationFilesCacheEpoch &&
    request.generation === getConversationFilesGeneration(conversationId)
  );
}

export function getConversationFilesResourceEpoch(): number {
  return conversationFilesCacheEpoch;
}

export function invalidateAllConversationFiles(): void {
  conversationFilesCacheEpoch += 1;
  conversationFilesCache.clear();
  conversationFilesGenerations.clear();
  conversationFilesInFlight.clear();
  conversationFilesSnapshots.clear();
  emptyConversationFilesSnapshot = createEmptySnapshot();
  [...conversationFilesListeners.values()].forEach((listeners) => {
    [...listeners].forEach((listener) => listener());
  });
}

export function resetConversationFilesResource(): void {
  invalidateAllConversationFiles();
}
