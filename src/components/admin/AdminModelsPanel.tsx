'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Filter, RefreshCw } from 'lucide-react';
import { getAdminModel, getAdminModels } from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import ProviderIcon from '@/components/models/ProviderIcon';
import { cn } from '@/lib/utils';
import type { AdminModelDetail, AdminModelSummary } from '@/types/adminAudit';
import {
  AdminEmpty, AdminError, AdminLoading, AdminPagination, AdminPanelHeader, formatAdminDate, formatNumber,
} from './AdminPanelPrimitives';

interface AdminModelsPanelProps {
  onForbidden: () => void;
  selectedModelId: string | null;
  onOpen: (modelId: string) => void;
  onBack: () => void;
  onViewConversations: (modelId: string) => void;
}

const CATALOG_DEGRADED_MESSAGE = '模型目录暂时不可用，当前信息可能来自缓存或仅包含历史数据。';
const ALL_PROVIDERS_VALUE = '__all_providers__';

export default function AdminModelsPanel({
  onForbidden, selectedModelId, onOpen, onBack, onViewConversations,
}: AdminModelsPanelProps) {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: '', provider: '', catalog_status: '' });
  const [filters, setFilters] = useState({ q: '', provider: '', catalog_status: '' });
  const [providerOptions, setProviderOptions] = useState<Array<{ value: string; label: string }>>([]);
  const loader = useCallback((signal: AbortSignal) => getAdminModels({
    page, page_size: 25, ...filters,
  }, signal), [filters, page]);
  const resource = useAdminAuditResource(loader, onForbidden);

  useEffect(() => {
    if (resource.data) setProviderOptions(resource.data.provider_options ?? []);
  }, [resource.data]);

  const selectedProvider = draft.provider
    ? providerOptions.find(option => option.value === draft.provider) || { value: draft.provider, label: draft.provider }
    : undefined;
  const renderedProviderOptions = selectedProvider && !providerOptions.some(option => option.value === selectedProvider.value)
    ? [selectedProvider, ...providerOptions]
    : providerOptions;

  if (selectedModelId) {
    return <AdminModelDetailView key={selectedModelId} modelId={selectedModelId} onBack={onBack} onForbidden={onForbidden} onViewConversations={onViewConversations} />;
  }

  return (
    <section>
      <AdminPanelHeader
        title="模型运营中心"
        description="会话统计当前选择该模型。Token 仅为当前已持久化助手消息用量，不等同平台全部调用或计费账单。"
        action={<Button variant="outline" size="sm" onClick={resource.reload} aria-label="刷新模型列表"><RefreshCw />刷新</Button>}
      />
      <form className="mb-4 grid max-w-3xl gap-2 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={event => {
        event.preventDefault();
        setPage(1);
        setFilters({ q: draft.q.trim(), provider: draft.provider.trim(), catalog_status: draft.catalog_status });
      }}>
        <Input aria-label="搜索模型" placeholder="模型名称或 ID" value={draft.q} onChange={event => setDraft(current => ({ ...current, q: event.target.value }))} />
        <Select value={draft.provider || ALL_PROVIDERS_VALUE} onValueChange={value => setDraft(current => ({ ...current, provider: value === ALL_PROVIDERS_VALUE ? '' : value }))}><SelectTrigger aria-label="模型提供商">{selectedProvider ? <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true"><ProviderIcon providerId={selectedProvider.value} size={18} /></span><span className="truncate">{selectedProvider.label}</span></span> : <span>不限</span>}</SelectTrigger><SelectContent><SelectItem value={ALL_PROVIDERS_VALUE}>不限</SelectItem>{renderedProviderOptions.map(option => <SelectItem key={option.value} value={option.value} textValue={option.label}><span aria-hidden="true"><ProviderIcon providerId={option.value} size={18} /></span><span>{option.label}</span></SelectItem>)}</SelectContent></Select>
        <select aria-label="模型目录状态" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={draft.catalog_status} onChange={event => setDraft(current => ({ ...current, catalog_status: event.target.value }))}><option value="">目录状态不限</option><option value="active">当前模型</option><option value="historical">历史模型</option><option value="unknown">状态未知</option></select>
        <Button type="submit"><Filter />筛选</Button>
      </form>
      {resource.loading ? <AdminLoading /> : resource.error ? <AdminError message={resource.error} onRetry={resource.reload} /> : null}
      {resource.data?.catalog_availability === 'degraded' || (resource.data?.excluded_invalid_model_count ?? 0) > 0 ? <div className="mb-3 space-y-1 text-xs text-muted-foreground">{resource.data?.catalog_availability === 'degraded' ? <p>{CATALOG_DEGRADED_MESSAGE}</p> : null}{(resource.data?.excluded_invalid_model_count ?? 0) > 0 ? <p>有 {resource.data?.excluded_invalid_model_count} 条异常模型记录未展示，请检查历史数据</p> : null}</div> : null}
      {resource.data?.items.length === 0 ? <AdminEmpty>没有匹配的模型</AdminEmpty> : null}
      {resource.data?.items.length ? (
        <><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[960px] table-fixed text-left text-sm"><caption className="sr-only">模型运营列表</caption><colgroup><col className="w-[20%]" /><col className="w-[13%]" /><col className="w-[16%]" /><col className="w-[28%]" /><col className="w-[13%]" /><col className="w-[10%]" /></colgroup><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th scope="col" className="px-3 py-3">模型</th><th scope="col" className="px-3 py-3">状态</th><th scope="col" className="px-3 py-3">能力</th><th scope="col" className="px-3 py-3">运营统计</th><th scope="col" className="px-3 py-3">时间（北京时间）</th><th scope="col" className="px-3 py-3 text-right">操作</th></tr></thead><tbody>{resource.data.items.map(model => <ModelRow key={model.model_id} model={model} onOpen={onOpen} />)}</tbody></table></div><AdminPagination page={resource.data} onPageChange={setPage} /></>
      ) : null}
    </section>
  );
}

function ModelRow({ model, onOpen }: { model: AdminModelSummary; onOpen: (modelId: string) => void }) {
  const checkedAt = formatModelHealthCheckedAt(model.health?.checked_at);
  const checkedAtCompact = formatCompactAdminDate(model.health?.checked_at);
  const recentActivity = formatCompactAdminDate(model.last_used_at);
  const recentActivityFull = formatAdminDate(model.last_used_at);
  const providerLabel = model.provider_display?.trim() || model.provider?.trim() || '未记录';
  const providerId = model.provider?.trim() || '';
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="px-3 py-3"><div className="truncate font-medium" title={model.name || model.model_id}>{model.name || model.model_id}</div><div className="mt-1 break-all text-xs text-muted-foreground">{model.model_id}</div><div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{providerId ? <span aria-hidden="true"><ProviderIcon providerId={providerId} size={16} /></span> : null}<span className="truncate" title={providerLabel}>{providerLabel}</span></div></td>
      <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><Badge variant="outline">{catalogStatusLabel(model.catalog_status, 'badge')}</Badge><Badge variant="outline">{healthLabel(model.health?.status)}</Badge></div></td>
      <td className="px-3 py-3"><CapabilityBadges capabilities={model.capabilities} maxVisible={2} /></td>
      <td className="px-3 py-3"><dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs"><Statistic label="对话" value={formatNumber(model.conversation_count)} /><Statistic label="用户" value={formatNumber(model.user_count)} /><Statistic label="回复" value={formatNumber(model.assistant_message_count)} /><Statistic label="持久化 Token" value={formatNumber(model.input_tokens + model.output_tokens)} /><Statistic label="Agent 运行" value={formatNumber(model.agent_run_count)} /><Statistic label="错误" value={formatNumber(model.agent_error_count)} /></dl></td>
      <td className="px-3 py-3 text-xs"><div className="text-muted-foreground">最近活动</div>{recentActivity.dateTime ? <time className="mt-0.5 block whitespace-nowrap" dateTime={recentActivity.dateTime} title={recentActivityFull} aria-label={`最近活动 ${recentActivityFull}`}>{recentActivity.text}</time> : <div className="mt-0.5 whitespace-nowrap" aria-label={`最近活动 ${recentActivityFull}`}>{recentActivity.text}</div>}<div className="mt-2 text-muted-foreground">健康检测</div>{checkedAt === '尚未检测' ? <div className="mt-0.5 whitespace-nowrap">尚未检测</div> : <time className="mt-0.5 block whitespace-nowrap" dateTime={checkedAtCompact.dateTime} title={checkedAt} aria-label={`检测时间 ${checkedAt}`}>{checkedAtCompact.text}</time>}</td>
      <td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" className="whitespace-nowrap" aria-label={`查看模型详情 ${model.model_id}`} onClick={() => onOpen(model.model_id)}>查看详情</Button></td>
    </tr>
  );
}

function AdminModelDetailView({ modelId, onBack, onForbidden, onViewConversations }: {
  modelId: string;
  onBack: () => void;
  onForbidden: () => void;
  onViewConversations: (modelId: string) => void;
}) {
  const loader = useCallback((signal: AbortSignal) => getAdminModel(modelId, signal), [modelId]);
  const resource = useAdminAuditResource(loader, onForbidden);
  return (
    <section aria-label={`模型详情 ${modelId}`}>
      <Button variant="ghost" size="sm" className="mb-3" onClick={onBack}><ArrowLeft />返回模型列表</Button>
      {resource.loading ? <AdminLoading /> : resource.error ? <AdminError message={resource.error} onRetry={resource.reload} /> : resource.data ? <ModelDetail model={resource.data} onViewConversations={onViewConversations} /> : null}
    </section>
  );
}

function ModelDetail({ model, onViewConversations }: { model: AdminModelDetail; onViewConversations: (modelId: string) => void }) {
  const providerLabel = model.provider_display?.trim() || model.provider?.trim() || '未记录';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">{model.name || model.model_id}</h1><div className="mt-1 text-xs text-muted-foreground">{model.model_id} · {providerLabel}</div></div><Button onClick={() => onViewConversations(model.model_id)}>查看该模型的对话</Button></div>{model.description ? <p className="mt-3 text-sm text-muted-foreground">{model.description}</p> : null}</div>
      {model.catalog_availability === 'degraded' ? <p className="text-xs text-muted-foreground">{CATALOG_DEGRADED_MESSAGE}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title="模型规格"><Metric label="目录状态" value={catalogStatusLabel(model.catalog_status, 'detail')} /><Metric label="健康状态" value={healthLabel(model.health?.status)} /><Metric label="检测时间" value={formatModelHealthCheckedAt(model.health?.checked_at)} />{model.health?.status === 'unhealthy' && model.health.error?.trim() ? <Metric label="异常说明" value={model.health.error.trim().slice(0, 300)} /> : null}<Metric label="上下文窗口" value={tokenLimit(model.context_window_tokens)} /><Metric label="单次输出上限" value={tokenLimit(model.max_output_tokens)} /><Metric label="知识截止" value={model.knowledge_cutoff || '未记录'} /><Metric label="成本层级" value={costTierLabel(model.cost_tier)} /></DetailCard>
        <DetailCard title="能力"><CapabilityBadges capabilities={model.capabilities} />{model.recommended_for.length ? <div className="mt-3 text-sm"><div className="text-xs text-muted-foreground">推荐场景</div><div className="mt-1">{model.recommended_for.map(recommendedForLabel).join('、')}</div></div> : null}</DetailCard>
        <DetailCard title="使用摘要"><p className="mb-3 text-xs text-muted-foreground">Token 仅为当前已持久化助手消息用量，不等同平台全部调用或计费账单。</p><Metric label="会话" value={`${formatNumber(model.conversation_count)} 个对话`} /><Metric label="用户" value={`${formatNumber(model.user_count)} 位用户`} /><Metric label="回复" value={`${formatNumber(model.assistant_message_count)} 条回复`} /><Metric label="输入 Token" value={formatNumber(model.input_tokens)} /><Metric label="输出 Token" value={formatNumber(model.output_tokens)} /><Metric label="最近活动" value={formatAdminDate(model.last_used_at)} /></DetailCard>
        <DetailCard title="Agent 运行"><Metric label="运行次数" value={`${formatNumber(model.agent_run_count)} 次 Agent 运行`} /><Metric label="错误次数" value={`${formatNumber(model.agent_error_count)} 次错误`} /></DetailCard>
        <DetailCard title="最近压测">{model.latest_performance_run ? <><Metric label="运行 ID" value={model.latest_performance_run.run_id} /><Metric label="状态" value={performanceStatusLabel(model.latest_performance_run.status)} /><Metric label="环境" value={performanceEnvironmentLabel(model.latest_performance_run.environment)} /><Metric label="开始时间" value={formatAdminDate(model.latest_performance_run.started_at)} /></> : <div className="text-sm text-muted-foreground">暂无关联压测</div>}</DetailCard>
      </div>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-4"><h2 className="mb-3 font-semibold">{title}</h2><div className="space-y-2">{children}</div></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right">{value}</span></div>;
}

function Statistic({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0" aria-label={`${label} ${value}`}><dt className="truncate text-muted-foreground">{label}</dt><dd className="mt-0.5 truncate text-sm font-medium" title={`${label} ${value}`}>{value}</dd></div>;
}

const CAPABILITY_LABELS: Record<string, string> = { imageGen: '图像生成', deepThinking: '深度思考', fileSupport: '文件处理', functionCalling: '工具调用', searchCapable: '联网搜索', agentTools: 'Agent 工具', vision: '图片理解', image_gen: '图像生成', deep_thinking: '深度思考', file_support: '文件处理', function_calling: '工具调用' };

const COST_TIER_LABELS: Record<string, string> = { low: '低', mid: '中', medium: '中', high: '高' };
const RECOMMENDED_FOR_LABELS: Record<string, string> = { agent: 'Agent', coding: '编程', long_context: '长上下文', fast_response: '快速响应', general: '通用' };
const PERFORMANCE_STATUS_LABELS: Record<string, string> = { completed: '已完成', failed: '失败', running: '运行中', stopped: '已停止' };
const PERFORMANCE_ENVIRONMENT_LABELS: Record<string, string> = { production: '生产环境', prod: '生产环境', staging: '预发布环境', development: '开发环境', dev: '开发环境' };

function CapabilityBadges({ capabilities, maxVisible }: { capabilities: Record<string, boolean>; maxVisible?: number }) {
  const labels = Object.entries(CAPABILITY_LABELS).filter(([key]) => capabilities[key]).map(([, label]) => label).filter((label, index, all) => all.indexOf(label) === index);
  const visibleLabels = maxVisible === undefined ? labels : labels.slice(0, maxVisible);
  const hiddenLabels = labels.slice(visibleLabels.length);
  return labels.length ? <div className="flex max-w-sm flex-wrap gap-1" role="group" aria-label={`模型能力：${labels.join('、')}`}>{visibleLabels.map(label => <Badge key={label} variant="outline">{label}</Badge>)}{hiddenLabels.length ? <Popover><PopoverTrigger asChild><button type="button" className={cn(badgeVariants({ variant: 'outline' }), 'cursor-pointer')} aria-label={`显示另外 ${hiddenLabels.length} 项能力：${hiddenLabels.join('、')}`}>+{hiddenLabels.length}项</button></PopoverTrigger><PopoverContent align="start" className="w-auto max-w-xs p-3" aria-label="其余模型能力"><div className="flex flex-wrap gap-1">{hiddenLabels.map(label => <Badge key={label} variant="outline">{label}</Badge>)}</div></PopoverContent></Popover> : null}</div> : <span className="text-xs text-muted-foreground">未标注能力</span>;
}

function healthLabel(status: string | null | undefined): string {
  if (status === 'healthy') return '健康';
  if (status === 'unhealthy') return '异常';
  return '未知';
}

function catalogStatusLabel(status: string, context: 'badge' | 'detail'): string {
  if (status === 'active') return context === 'badge' ? '当前' : '当前模型';
  if (status === 'historical') return context === 'badge' ? '历史' : '历史模型';
  return '状态未知';
}

export function formatModelHealthCheckedAt(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '尚未检测';
  const date = new Date(typeof value === 'number' && value < 1_000_000_000_000 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return '尚未检测';
  return formatAdminDate(date.toISOString());
}

function formatCompactAdminDate(value: string | number | null | undefined): { text: string; dateTime?: string } {
  if (value === null || value === undefined || value === '') return { text: '未采集' };
  const date = new Date(typeof value === 'number' && value < 1_000_000_000_000 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return { text: '未采集' };
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return { text: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`, dateTime: date.toISOString() };
}

function costTierLabel(value: string | null): string {
  if (!value?.trim()) return '未记录';
  return COST_TIER_LABELS[value.trim().toLowerCase()] || value.trim();
}

function recommendedForLabel(value: string): string {
  const normalized = value.trim();
  return RECOMMENDED_FOR_LABELS[normalized.toLowerCase()] || normalized;
}

function performanceStatusLabel(value: string): string {
  const normalized = value.trim();
  return PERFORMANCE_STATUS_LABELS[normalized.toLowerCase()] || normalized || '未记录';
}

function performanceEnvironmentLabel(value: string): string {
  const normalized = value.trim();
  return PERFORMANCE_ENVIRONMENT_LABELS[normalized.toLowerCase()] || normalized || '未记录';
}

function tokenLimit(value: number | null): string {
  return value === null ? '未记录' : `${formatNumber(value)} Token`;
}
