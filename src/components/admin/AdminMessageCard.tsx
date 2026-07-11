'use client';

import { useMemo, useState } from 'react';
import { Bot, CheckCircle, ChevronDown, FileText, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AdminJsonValue, AdminKnownContentBlock, AdminMessageRecord } from '@/types/adminAudit';
import AdminSafeMarkdown from './AdminSafeMarkdown';

const KNOWN_BLOCK_TYPES = new Set(['text', 'thinking', 'file', 'search', 'url_read']);

export default function AdminMessageCard({ message }: { message: AdminMessageRecord }) {
  const [reasoningVisible, setReasoningVisible] = useState(false);
  const text = useMemo(
    () => message.content.filter(block => block.type === 'text').map(block => block.text ?? '').join(''),
    [message.content],
  );
  const thinking = useMemo(
    () => message.content.filter(block => block.type === 'thinking').map(block => block.thinking ?? '').join('\n'),
    [message.content],
  );
  const metadataBlocks = message.content.filter(block => block.type !== 'text' && block.type !== 'thinking');
  const isUser = message.role === 'user';

  return (
    <article className="rounded-xl border border-border/70 bg-card p-4 shadow-sm" data-testid={`admin-message-${message.id}`}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {isUser ? <User className="h-4 w-4" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}
          <span>{isUser ? '用户' : '助手'}</span>
          {message.model_id ? <Badge variant="outline">{message.model_id}</Badge> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDateTime(message.created_at)}
        </div>
      </header>

      {thinking ? (
        <div className="mb-3 overflow-hidden rounded-lg border border-border/50">
          <button
            type="button"
            onClick={() => setReasoningVisible(current => !current)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground"
            aria-expanded={reasoningVisible}
          >
            <span className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5" />已深度思考</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${reasoningVisible ? 'rotate-180' : ''}`} />
          </button>
          {reasoningVisible ? (
            <div className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
              <AdminSafeMarkdown content={thinking} />
            </div>
          ) : null}
        </div>
      ) : null}

      {text ? <AdminSafeMarkdown content={text} /> : null}

      {metadataBlocks.length > 0 ? (
        <div className="mt-3 space-y-2">
          {metadataBlocks.map((block, index) => (
            <MetadataBlock key={block.id ?? `${block.type}-${index}`} block={block} />
          ))}
        </div>
      ) : null}

      {message.usage ? (
        <footer className="mt-3 text-xs text-muted-foreground">
          输入 {message.usage.input_tokens} · 输出 {message.usage.output_tokens} tokens
        </footer>
      ) : null}
    </article>
  );
}

function MetadataBlock({ block }: { block: AdminKnownContentBlock }) {
  if (block.type === 'file') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">{block.filename || '未命名文件'}</span>
        <span className="text-xs text-muted-foreground">{block.mime_type || '未知类型'}</span>
      </div>
    );
  }

  if (block.type === 'search') {
    return <SafeProjection title="联网搜索" value={block.query || toSafeJsonValue(block)} />;
  }

  if (block.type === 'url_read') {
    return <SafeProjection title="网页读取" value={block.title || block.url || toSafeJsonValue(block)} />;
  }

  if (!KNOWN_BLOCK_TYPES.has(block.type)) {
    return <SafeProjection title={`未知内容块：${block.type}`} value={toSafeJsonValue(block)} />;
  }

  return null;
}

function SafeProjection({ title, value }: { title: string; value: AdminJsonValue | undefined }) {
  return (
    <details className="rounded-md border border-border/60 bg-muted/10 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium">{title}</summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
        {formatSafeJson(value)}
      </pre>
    </details>
  );
}

function formatSafeJson(value: AdminJsonValue | undefined): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? null, null, 2);
}

function toSafeJsonValue(block: AdminKnownContentBlock): AdminJsonValue {
  return Object.fromEntries(
    Object.entries(block).filter((entry): entry is [string, AdminJsonValue] => entry[1] !== undefined),
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '时间未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}
