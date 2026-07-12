'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Filter, RefreshCw } from 'lucide-react';
import {
  getAdminConversation,
  getAdminConversationAgentRuns,
  getAdminConversationFiles,
  getAdminConversationMessages,
  getAdminConversations,
  getAdminConversationToolCalls,
} from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminConversationsQuery } from '@/types/adminAudit';
import AdminExecutionInspector from './AdminExecutionInspector';
import AdminMessageCard from './AdminMessageCard';
import AdminUserIdentity from './AdminUserIdentity';
import {
  AdminEmpty, AdminError, AdminLoading, AdminPagination, AdminPanelHeader, formatAdminDate, formatNumber,
} from './AdminPanelPrimitives';
import { normalizeAdminAuditRouteId } from '@/lib/admin/adminAuditRoute';

interface ConversationFilterDraft {
  q: string;
  user_id: string;
  model_id: string;
  has_tools: '' | 'true' | 'false';
  has_files: '' | 'true' | 'false';
  created_from: string;
  created_to: string;
}

const EMPTY_FILTER: ConversationFilterDraft = { q: '', user_id: '', model_id: '', has_tools: '', has_files: '', created_from: '', created_to: '' };

interface AdminConversationsPanelProps {
  onForbidden: () => void;
  userIdFilter?: string;
  modelIdFilter?: string;
  selectedConversationId: string | null;
  onUserFilterChange: (userId?: string) => void;
  onFiltersChange?: (filters: { userId?: string; modelId?: string }) => void;
  onOpen: (conversationId: string) => void;
  onBack: () => void;
}

export default function AdminConversationsPanel({
  onForbidden, userIdFilter, modelIdFilter, selectedConversationId, onUserFilterChange, onFiltersChange, onOpen, onBack,
}: AdminConversationsPanelProps) {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<ConversationFilterDraft>(() => ({ ...EMPTY_FILTER, user_id: userIdFilter ?? '', model_id: modelIdFilter ?? '' }));
  const [filters, setFilters] = useState<AdminConversationsQuery>(() => ({ ...(userIdFilter ? { user_id: userIdFilter } : {}), ...(modelIdFilter ? { model_id: modelIdFilter } : {}) }));
  const previousUserIdFilterRef = useRef(userIdFilter);
  const previousModelIdFilterRef = useRef(modelIdFilter);
  const loader = useCallback(
    (signal: AbortSignal) => getAdminConversations({ page, page_size: 25, ...filters }, signal),
    [filters, page],
  );
  const resource = useAdminAuditResource(loader, onForbidden);

  useEffect(() => {
    if (previousUserIdFilterRef.current === userIdFilter) return;
    previousUserIdFilterRef.current = userIdFilter;
    const nextUserId = userIdFilter ?? '';
    setPage(1);
    setDraft(current => current.user_id === nextUserId ? current : { ...current, user_id: nextUserId });
    setFilters(current => current.user_id === (nextUserId || undefined)
      ? current
      : { ...current, user_id: nextUserId || undefined });
  }, [userIdFilter]);

  useEffect(() => {
    if (previousModelIdFilterRef.current === modelIdFilter) return;
    previousModelIdFilterRef.current = modelIdFilter;
    const nextModelId = modelIdFilter ?? '';
    setPage(1);
    setDraft(current => current.model_id === nextModelId ? current : { ...current, model_id: nextModelId });
    setFilters(current => current.model_id === (nextModelId || undefined) ? current : { ...current, model_id: nextModelId || undefined });
  }, [modelIdFilter]);

  if (selectedConversationId) {
    return (
      <AdminConversationDetailView
        key={selectedConversationId}
        conversationId={selectedConversationId}
        onBack={onBack}
        onForbidden={onForbidden}
      />
    );
  }

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const nextUserId = normalizeAdminAuditRouteId(draft.user_id);
    const nextModelId = normalizeAdminAuditRouteId(draft.model_id);
    setPage(1);
    setFilters({
      q: draft.q,
      user_id: nextUserId,
      model_id: nextModelId,
      has_tools: parseBoolean(draft.has_tools),
      has_files: parseBoolean(draft.has_files),
      created_from: draft.created_from,
      created_to: draft.created_to,
    });
    if (onFiltersChange) onFiltersChange({ userId: nextUserId, modelId: nextModelId });
    else onUserFilterChange(nextUserId);
  };

  return (
    <section>
      <AdminPanelHeader title="全局对话" description="跨用户检索已持久化对话；管理页不会续写、停止或修改内容。" action={<Button variant="outline" size="sm" onClick={resource.reload} aria-label="刷新对话列表"><RefreshCw />刷新</Button>} />
      <form onSubmit={applyFilters} className="mb-4 grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-2 xl:grid-cols-8">
        <Input aria-label="搜索对话" value={draft.q} onChange={event => setDraft(current => ({ ...current, q: event.target.value }))} placeholder="标题或用户关键词" />
        <Input aria-label="用户 ID" value={draft.user_id} onChange={event => setDraft(current => ({ ...current, user_id: event.target.value }))} placeholder="用户 ID" />
        <Input aria-label="模型 ID" value={draft.model_id} onChange={event => setDraft(current => ({ ...current, model_id: event.target.value }))} placeholder="模型 ID" />
        <select aria-label="是否有工具调用" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={draft.has_tools} onChange={event => setDraft(current => ({ ...current, has_tools: event.target.value as ConversationFilterDraft['has_tools'] }))}><option value="">工具不限</option><option value="true">有工具</option><option value="false">无工具</option></select>
        <select aria-label="是否有文件" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={draft.has_files} onChange={event => setDraft(current => ({ ...current, has_files: event.target.value as ConversationFilterDraft['has_files'] }))}><option value="">文件不限</option><option value="true">有文件</option><option value="false">无文件</option></select>
        <Input aria-label="创建开始日期" type="date" value={draft.created_from} onChange={event => setDraft(current => ({ ...current, created_from: event.target.value }))} />
        <Input aria-label="创建结束日期" type="date" value={draft.created_to} onChange={event => setDraft(current => ({ ...current, created_to: event.target.value }))} />
        <Button type="submit"><Filter />应用筛选</Button>
      </form>

      {resource.loading ? <AdminLoading /> : resource.error ? <AdminError message={resource.error} onRetry={resource.reload} /> : null}
      {resource.data && resource.data.items.length === 0 ? <AdminEmpty>没有匹配的对话</AdminEmpty> : null}
      {resource.data && resource.data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="p-3">对话 / 时间</th><th>用户</th><th>模型</th><th>消息</th><th>工具</th><th>文件</th><th>Agent</th><th>Token</th><th className="pr-3 text-right">操作</th></tr></thead>
              <tbody>{resource.data.items.map(conversation => (
                <tr key={conversation.id} className="border-t border-border/60">
                  <td className="p-3">
                    <div className="max-w-xs truncate font-medium" title={conversation.title}>{conversation.title || '未命名对话'}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{conversation.id}</div>
                    <div className="mt-1 text-xs text-muted-foreground" aria-label={`对话时间 ${conversation.id}`}>
                      {conversation.created_at || conversation.updated_at ? (
                        <><span>更新：{formatAdminDate(conversation.updated_at)}</span><span className="ml-2">创建：{formatAdminDate(conversation.created_at)}</span></>
                      ) : '时间未记录'}
                    </div>
                  </td>
                  <td><AdminUserIdentity user={conversation.user} /></td>
                  <td>{conversation.model_id || '—'}</td>
                  <td>{conversation.message_count}</td><td>{conversation.tool_call_count}</td><td>{conversation.file_count}</td>
                  <td>{conversation.latest_agent_status ? <Badge variant="outline">{conversation.latest_agent_status}</Badge> : '—'}</td>
                  <td>{formatNumber(conversation.input_tokens + conversation.output_tokens)}</td>
                  <td className="pr-3 text-right"><Button variant="ghost" size="sm" aria-label={`查看对话详情 ${conversation.id}`} onClick={() => onOpen(conversation.id)}>查看详情</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <AdminPagination page={resource.data} onPageChange={setPage} />
        </>
      ) : null}
    </section>
  );
}

function AdminConversationDetailView({ conversationId, onBack, onForbidden }: { conversationId: string; onBack: () => void; onForbidden: () => void }) {
  const [messagePage, setMessagePage] = useState(1);
  const [runPage, setRunPage] = useState(1);
  const [toolPage, setToolPage] = useState(1);
  const [filePage, setFilePage] = useState(1);
  const detailLoader = useCallback((signal: AbortSignal) => getAdminConversation(conversationId, signal), [conversationId]);
  const messageLoader = useCallback((signal: AbortSignal) => getAdminConversationMessages(conversationId, { page: messagePage, page_size: 25 }, signal), [conversationId, messagePage]);
  const toolLoader = useCallback((signal: AbortSignal) => getAdminConversationToolCalls(conversationId, { page: toolPage, page_size: 25 }, signal), [conversationId, toolPage]);
  const runLoader = useCallback((signal: AbortSignal) => getAdminConversationAgentRuns(conversationId, { page: runPage, page_size: 25 }, signal), [conversationId, runPage]);
  const fileLoader = useCallback((signal: AbortSignal) => getAdminConversationFiles(conversationId, { page: filePage, page_size: 25 }, signal), [conversationId, filePage]);
  const detail = useAdminAuditResource(detailLoader, onForbidden);
  const messages = useAdminAuditResource(messageLoader, onForbidden);
  const tools = useAdminAuditResource(toolLoader, onForbidden);
  const runs = useAdminAuditResource(runLoader, onForbidden);
  const files = useAdminAuditResource(fileLoader, onForbidden);

  return (
    <section aria-label={`对话详情 ${conversationId}`}>
      <Button variant="ghost" size="sm" className="mb-3" onClick={onBack}><ArrowLeft />返回对话列表</Button>
      {detail.loading ? <AdminLoading /> : detail.error ? <AdminError message={detail.error} onRetry={detail.reload} /> : detail.data ? (
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <h1 className="text-lg font-semibold">{detail.data.title || '未命名对话'}</h1>
          <div className="mt-2 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2"><div><span>对话 ID：{detail.data.id}</span><div className="mt-1">模型：{detail.data.model_id || '—'}</div><div>更新时间：{formatAdminDate(detail.data.updated_at)}</div></div><AdminUserIdentity user={detail.data.user} /></div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div>
          <h2 className="mb-3 font-semibold">消息</h2>
          {messages.loading ? <AdminLoading /> : messages.error ? <AdminError message={messages.error} onRetry={messages.reload} /> : messages.data?.items.length ? (
            <><div className="space-y-3">{messages.data.items.map(message => <AdminMessageCard key={message.id} message={message} />)}</div><AdminPagination page={messages.data} onPageChange={setMessagePage} /></>
          ) : <AdminEmpty>没有已持久化消息</AdminEmpty>}
        </div>

        <div className="space-y-6">
          <section aria-label="Agent 运行记录"><h2 className="mb-3 font-semibold">Agent 运行</h2>
            {runs.loading ? <AdminLoading /> : runs.error ? <AdminError message={runs.error} onRetry={runs.reload} /> : runs.data?.items.length ? (
              <><AdminExecutionInspector runs={runs.data.items} toolCalls={[]} /><AdminPagination page={runs.data} onPageChange={setRunPage} /></>
            ) : <AdminEmpty>没有 Agent 运行记录</AdminEmpty>}
          </section>

          <section aria-label="工具调用记录"><h2 className="mb-3 font-semibold">工具调用</h2>
            {tools.loading ? <AdminLoading /> : tools.error ? <AdminError message={tools.error} onRetry={tools.reload} /> : tools.data?.items.length ? (
              <><AdminExecutionInspector runs={[]} toolCalls={tools.data.items} /><AdminPagination page={tools.data} onPageChange={setToolPage} /></>
            ) : <AdminEmpty>没有工具调用记录</AdminEmpty>}
          </section>

          <div><h2 className="mb-3 font-semibold">文件元数据</h2>
            {files.loading ? <AdminLoading /> : files.error ? <AdminError message={files.error} onRetry={files.reload} /> : files.data?.items.length ? (
              <><div className="space-y-2">{files.data.items.map(file => <div key={file.id} className="rounded-lg border border-border bg-card p-3 text-sm"><div className="font-medium">{file.original_filename}</div><div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{file.mimetype || '未知类型'}</span><span>{formatFileSize(file.size)}</span><span>{file.status || '状态未知'}</span>{file.width && file.height ? <span>{file.width}×{file.height}</span> : null}</div></div>)}</div><AdminPagination page={files.data} onPageChange={setFilePage} /></>
            ) : <AdminEmpty>没有关联文件元数据</AdminEmpty>}
          </div>
        </div>
      </div>
    </section>
  );
}

function parseBoolean(value: '' | 'true' | 'false'): boolean | undefined {
  return value === '' ? undefined : value === 'true';
}

function formatFileSize(value: number | null): string {
  if (value === null) return '大小未知';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
