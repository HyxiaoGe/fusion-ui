'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast';

interface UseMessageCopyParams {
  text: string;
}

interface UseMessageCopyResult {
  copied: boolean;
  copy: () => Promise<void>;
}

export function useMessageCopy({ text }: UseMessageCopyParams): UseMessageCopyResult {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  const copy = useCallback(async () => {
    if (!text) return;

    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
          const copiedWithFallback = document.execCommand('copy');
          if (!copiedWithFallback) {
            throw new Error('copy command failed');
          }
        } finally {
          document.body.removeChild(textarea);
        }
      }

      setCopied(true);
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current);
      }
      copiedResetTimerRef.current = setTimeout(() => {
        setCopied(false);
        copiedResetTimerRef.current = null;
      }, 2000);
    } catch {
      toast({
        message: '复制失败，请重试',
        type: 'error',
      });
    }
  }, [text, toast]);

  return { copied, copy };
}
