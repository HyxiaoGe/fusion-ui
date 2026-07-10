import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import { getConversationFiles, type FileInfo } from '@/lib/api/files';
import {
  getConversationFilesCacheEntry,
  getConversationFilesResourceEpoch,
  getConversationFilesSnapshot,
  getOrStartConversationFilesRequest,
  invalidateConversationFilesCache,
  isConversationFilesCacheFresh,
  resetConversationFilesResource,
  subscribeConversationFiles,
} from '@/lib/chat/conversationFilesResource';

const DEFAULT_LOAD_ERROR = '资料列表加载失败';

export interface UseConversationFilesOptions {
  enabled?: boolean;
  sessionKey?: string | null;
}

export interface UseConversationFilesResult {
  files: FileInfo[];
  isLoading: boolean;
  error: string | null;
  refresh: (targetConversationId?: string | null) => Promise<void>;
  removeFile: (fileId: string, targetConversationId?: string | null) => void;
}

function getReadableError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return DEFAULT_LOAD_ERROR;
}

export function __resetConversationFilesCacheForTest(): void {
  resetConversationFilesResource();
}

export function useConversationFiles(
  conversationId: string | null,
  options: UseConversationFilesOptions = {},
): UseConversationFilesResult {
  const { enabled = true, sessionKey = null } = options;
  const latestConversationIdRef = useRef<string | null>(conversationId);
  const latestEnabledRef = useRef(enabled);
  const latestResourceEpochRef = useRef(getConversationFilesResourceEpoch());
  const resourceEpoch = getConversationFilesResourceEpoch();
  const subscribe = useCallback(
    (listener: () => void) => subscribeConversationFiles(conversationId, listener),
    [conversationId],
  );
  const getSnapshot = useCallback(
    () => getConversationFilesSnapshot(conversationId),
    [conversationId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useLayoutEffect(() => {
    latestConversationIdRef.current = conversationId;
    latestEnabledRef.current = enabled;
    latestResourceEpochRef.current = resourceEpoch;
  }, [conversationId, enabled, resourceEpoch]);

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const cachedEntry = getConversationFilesCacheEntry(conversationId);
    if (cachedEntry && isConversationFilesCacheFresh(cachedEntry)) {
      return;
    }

    void getOrStartConversationFilesRequest(
      conversationId,
      false,
      getConversationFiles,
    ).promise.catch(() => {
      // 错误已进入共享 resource snapshot，由所有订阅 hook 同步展示。
    });
  }, [conversationId, enabled, sessionKey]);

  const refresh = useCallback(async (targetConversationId?: string | null) => {
    if (
      !latestEnabledRef.current ||
      latestResourceEpochRef.current !== getConversationFilesResourceEpoch()
    ) {
      return;
    }

    const resolvedConversationId = targetConversationId === undefined
      ? latestConversationIdRef.current
      : targetConversationId;
    if (!resolvedConversationId) return;

    try {
      await getOrStartConversationFilesRequest(
        resolvedConversationId,
        true,
        getConversationFiles,
      ).promise;
    } catch {
      // 错误已进入目标 conversation 的共享 snapshot。
    }
  }, []);

  const removeFile = useCallback((fileId: string, targetConversationId?: string | null) => {
    const resolvedConversationId = targetConversationId === undefined
      ? latestConversationIdRef.current
      : targetConversationId;
    if (!resolvedConversationId) return;

    invalidateConversationFilesCache(
      resolvedConversationId,
      (cachedFiles) => cachedFiles.filter((file) => file.id !== fileId),
    );
  }, []);

  if (!enabled || !conversationId) {
    return {
      files: [],
      isLoading: false,
      error: null,
      refresh,
      removeFile,
    };
  }

  return {
    files: snapshot.files,
    isLoading: snapshot.isLoading,
    error: snapshot.error == null ? null : getReadableError(snapshot.error),
    refresh,
    removeFile,
  };
}
