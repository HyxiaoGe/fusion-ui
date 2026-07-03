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
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const clearState = useCallback(() => {
    requestIdRef.current += 1;
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
    setIsLoading(true);

    try {
      const nextFiles = await getConversationFiles(targetConversationId);
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setFiles(nextFiles);
      setError(null);
    } catch (loadError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
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
      clearState();
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
    await loadFiles(conversationId);
  }, [conversationId, loadFiles]);

  const removeFile = useCallback((fileId: string) => {
    setFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId));
  }, []);

  return {
    files,
    isLoading,
    error,
    refresh,
    removeFile,
  };
}
