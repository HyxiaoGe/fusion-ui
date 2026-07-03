import { useCallback, useEffect, useRef, useState } from 'react';

import { getConversationFiles, type FileInfo } from '@/lib/api/files';

const DEFAULT_LOAD_ERROR = '资料列表加载失败';

export interface UseConversationFilesResult {
  files: FileInfo[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  removeFile: (fileId: string) => void;
}

function getReadableError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return DEFAULT_LOAD_ERROR;
}

export function useConversationFiles(conversationId: string | null): UseConversationFilesResult {
  const [stateConversationId, setStateConversationId] = useState<string | null>(conversationId);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const latestConversationIdRef = useRef<string | null>(conversationId);
  latestConversationIdRef.current = conversationId;

  const clearState = useCallback((targetConversationId: string | null = latestConversationIdRef.current) => {
    requestIdRef.current += 1;
    setStateConversationId(targetConversationId);
    setFiles([]);
    setError(null);
    setIsLoading(false);
  }, []);

  const loadFiles = useCallback(async (targetConversationId: string | null) => {
    if (!targetConversationId) {
      clearState();
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStateConversationId(targetConversationId);
    setFiles([]);
    setError(null);
    setIsLoading(true);

    try {
      const nextFiles = await getConversationFiles(targetConversationId);
      if (
        !mountedRef.current ||
        requestId !== requestIdRef.current ||
        targetConversationId !== latestConversationIdRef.current
      ) {
        return;
      }
      setStateConversationId(targetConversationId);
      setFiles(nextFiles);
      setError(null);
    } catch (loadError) {
      if (
        !mountedRef.current ||
        requestId !== requestIdRef.current ||
        targetConversationId !== latestConversationIdRef.current
      ) {
        return;
      }
      setStateConversationId(targetConversationId);
      setFiles([]);
      setError(getReadableError(loadError));
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [clearState]);

  useEffect(() => {
    mountedRef.current = true;

    if (!conversationId) {
      clearState(null);
      return;
    }

    void loadFiles(conversationId);
  }, [clearState, conversationId, loadFiles]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    await loadFiles(latestConversationIdRef.current);
  }, [loadFiles]);

  const removeFile = useCallback((fileId: string) => {
    setFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId));
  }, []);

  const isCurrentConversationState = stateConversationId === conversationId;

  return {
    files: isCurrentConversationState ? files : [],
    isLoading: conversationId ? (isCurrentConversationState ? isLoading : true) : false,
    error: isCurrentConversationState ? error : null,
    refresh,
    removeFile,
  };
}
