'use client';

import { Check, Copy, Edit2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageActionsProps {
  timestamp?: number;
  copied?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  onEdit?: () => void;
  retryLabel: string;
  className?: string;
}

const defaultClassName = 'flex items-center gap-1 h-8 mt-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150 lg:pointer-events-none lg:group-hover:pointer-events-auto';
const actionButtonClassName = 'h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast';

function formatTime(timestamp?: number) {
  if (!timestamp || isNaN(timestamp)) return '';
  try {
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function MessageActions({
  timestamp,
  copied = false,
  onCopy,
  onRetry,
  onEdit,
  retryLabel,
  className,
}: MessageActionsProps) {
  const formattedTime = formatTime(timestamp);
  const copyLabel = copied ? '已复制' : '复制';

  return (
    <div className={cn(defaultClassName, className)}>
      {formattedTime ? (
        <span className="text-xs text-muted-foreground/70 mr-1">
          {formattedTime}
        </span>
      ) : null}
      {onCopy ? (
        <Button
          aria-label={copyLabel}
          title={copyLabel}
          variant="ghost"
          size="icon"
          className={actionButtonClassName}
          onClick={onCopy}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      ) : null}
      {onEdit ? (
        <Button
          aria-label="编辑"
          title="编辑"
          variant="ghost"
          size="icon"
          className={actionButtonClassName}
          onClick={onEdit}
        >
          <Edit2 className="h-4 w-4" />
        </Button>
      ) : null}
      {onRetry ? (
        <Button
          aria-label={retryLabel}
          title={retryLabel}
          variant="ghost"
          size="icon"
          className={actionButtonClassName}
          onClick={onRetry}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

export default MessageActions;
