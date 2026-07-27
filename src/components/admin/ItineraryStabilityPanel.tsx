'use client';

import { useCallback, useState } from 'react';
import { Activity, Clock3, Filter, RefreshCw, Route, TriangleAlert, Wrench } from 'lucide-react';
import { getAdminItineraryStability } from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  AdminItineraryStabilityMetrics,
  AdminItineraryStabilityQuery,
  AdminItineraryStabilitySignals,
  AdminItineraryStabilityToolItem,
  AdminLatencyPercentiles,
  AdminProductToolOutcomeCounts,
} from '@/types/adminAudit';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  formatAdminDate,
  formatNumber,
} from './AdminPanelPrimitives';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const WINDOW_OPTIONS = [
  { hours: 1, label: '最近 1 小时' },
  { hours: 24, label: '最近 24 小时' },
  { hours: 7 * 24, label: '最近 7 天' },
] as const;

interface ItineraryStabilityPanelProps {
  onForbidden: () => void;
}

export default function ItineraryStabilityPanel({ onForbidden }: ItineraryStabilityPanelProps) {
  const [windowHours, setWindowHours] = useState<number>(24);
  const [modelDraft, setModelDraft] = useState('');
  const [modelId, setModelId] = useState('');
  const [query, setQuery] = useState<AdminItineraryStabilityQuery>(() => buildWindowQuery(24));
  const loader = useCallback(
    (signal: AbortSignal) => getAdminItineraryStability(query, signal),
    [query],
  );
  const resource = useAdminAuditResource(loader, onForbidden);

  const applyWindow = (hours: number) => {
    setWindowHours(hours);
    setQuery(buildWindowQuery(hours, modelId));
  };
  const applyModel = (event: React.FormEvent) => {
    event.preventDefault();
    const nextModelId = modelDraft.trim();
    setModelId(nextModelId);
    setQuery(buildWindowQuery(windowHours, nextModelId));
  };
  const refresh = () => setQuery(buildWindowQuery(windowHours, modelId));

  return (
    <section aria-label="智能行程稳定性" className="mb-6 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Route className="h-4 w-4 text-primary" aria-hidden="true" />
            智能行程稳定性
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            按终态出行运行聚合行程交付、产品工具状态和安全异常信号；运行中样本不会被误计为失败。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} aria-label="刷新行程稳定性">
          <RefreshCw />刷新
        </Button>
      </header>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="行程统计时间窗口">
          {WINDOW_OPTIONS.map(option => (
            <Button
              key={option.hours}
              type="button"
              size="sm"
              variant={windowHours === option.hours ? 'default' : 'outline'}
              aria-label={option.label}
              aria-pressed={windowHours === option.hours}
              onClick={() => applyWindow(option.hours)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <form className="flex w-full max-w-md gap-2" onSubmit={applyModel}>
          <Input
            aria-label="行程模型 ID"
            placeholder="模型 ID（可选，精确匹配）"
            value={modelDraft}
            onChange={event => setModelDraft(event.target.value)}
          />
          <Button type="submit" variant="outline" className="shrink-0" aria-label="应用行程筛选">
            <Filter />应用
          </Button>
        </form>
      </div>

      {modelId ? (
        <div className="mt-2 text-xs text-muted-foreground">
          当前模型：<span className="break-all font-medium text-foreground">{modelId}</span>
        </div>
      ) : null}

      <div className="mt-4">
        {resource.loading ? <AdminLoading /> : resource.error ? (
          <AdminError
            message={resource.error}
            onRetry={resource.reload}
            retryLabel="重新加载行程稳定性"
          />
        ) : resource.data ? (
          <StabilityContent data={resource.data} />
        ) : null}
      </div>
    </section>
  );
}

function StabilityContent({ data }: {
  data: Awaited<ReturnType<typeof getAdminItineraryStability>>;
}) {
  const hasSamples = data.summary.itinerary.total > 0 || data.summary.product_tools.total > 0;
  if (!hasSamples) {
    return (
      <div className="space-y-3">
        <AdminEmpty>当前时间窗口内暂无可计入的智能行程样本</AdminEmpty>
        <ExcludedSampleSummary scope={data.scope} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{formatAdminDate(data.scope.created_from)} 至 {formatAdminDate(data.scope.created_to)}</span>
        <ExcludedSampleSummary scope={data.scope} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ItinerarySummaryCard metrics={data.summary} />
        <ToolSummaryCard outcomes={data.summary.product_tools} />
        <LatencySummaryCard
          runLatency={data.summary.run_latency_ms}
          toolLatency={data.summary.tool_latency_ms}
        />
        <SignalSummaryCard signals={data.summary.signals} />
      </div>

      {data.by_model.length > 0 ? <ModelMetricsTable items={data.by_model} /> : null}
      {data.by_tool.length > 0 ? <ToolMetricsTable items={data.by_tool} /> : null}
    </div>
  );
}

function ExcludedSampleSummary({
  scope,
}: {
  scope: Awaited<ReturnType<typeof getAdminItineraryStability>>['scope'];
}) {
  const parts = [
    scope.excluded_running_count > 0
      ? `${formatNumber(scope.excluded_running_count)} 个运行中`
      : '',
    scope.excluded_interrupted_count > 0
      ? `${formatNumber(scope.excluded_interrupted_count)} 个已中断`
      : '',
    scope.excluded_unlinked_count > 0
      ? `${formatNumber(scope.excluded_unlinked_count)} 个缺少终态关联`
      : '',
  ].filter(Boolean);
  return parts.length > 0 ? <span>{parts.join('、')}样本未计入交付结果</span> : null;
}

function SummaryCard({ label, icon, children }: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className="rounded-lg border border-border/70 bg-background/50 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}{label}
      </h3>
      <div className="mt-2 space-y-1.5 text-sm">{children}</div>
    </section>
  );
}

function ItinerarySummaryCard({ metrics }: { metrics: AdminItineraryStabilityMetrics }) {
  const { itinerary } = metrics;
  return (
    <SummaryCard label="行程交付总览" icon={<Route className="h-3.5 w-3.5" aria-hidden="true" />}>
      <Metric label="总样本" value={formatNumber(itinerary.total)} />
      <Metric label="Complete" value={formatNumber(itinerary.complete)} tone="success" />
      <Metric label="Partial" value={formatNumber(itinerary.partial)} tone="warn" />
      <Metric label="Failed" value={formatNumber(itinerary.failed)} tone="danger" />
    </SummaryCard>
  );
}

function ToolSummaryCard({ outcomes }: { outcomes: AdminProductToolOutcomeCounts }) {
  return (
    <SummaryCard label="产品工具总览" icon={<Wrench className="h-3.5 w-3.5" aria-hidden="true" />}>
      <Metric label="调用" value={formatNumber(outcomes.total)} />
      <Metric label="成功" value={formatNumber(outcomes.success)} tone="success" />
      <Metric label="降级" value={formatNumber(outcomes.degraded)} tone="warn" />
      <Metric label="失败" value={formatNumber(outcomes.failed)} tone="danger" />
    </SummaryCard>
  );
}

function LatencySummaryCard({ runLatency, toolLatency }: {
  runLatency: AdminLatencyPercentiles;
  toolLatency: AdminLatencyPercentiles;
}) {
  return (
    <SummaryCard label="延迟总览" icon={<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />}>
      <Metric label="行程 P50" value={formatDuration(runLatency.p50_ms)} />
      <Metric label="行程 P95" value={formatDuration(runLatency.p95_ms)} />
      <Metric label="工具 P50" value={formatDuration(toolLatency.p50_ms)} />
      <Metric label="工具 P95" value={formatDuration(toolLatency.p95_ms)} />
    </SummaryCard>
  );
}

function SignalSummaryCard({ signals }: { signals: AdminItineraryStabilitySignals }) {
  const budgetExhausted = signals.travel_budget_exhausted
    + signals.server_budget_exhausted
    + signals.agent_limit_reached;
  return (
    <SummaryCard label="异常信号总览" icon={<TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />}>
      <Metric label="上游错误" value={formatNumber(signals.upstream_error)} tone="danger" />
      <Metric label="修参触发" value={formatNumber(signals.repair_required)} tone="warn" />
      <Metric label="需用户补充" value={formatNumber(signals.repair_requires_user_input)} />
      <Metric label="额度耗尽" value={formatNumber(budgetExhausted)} tone="danger" />
    </SummaryCard>
  );
}

function Metric({ label, value, tone = 'default' }: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warn' | 'danger';
}) {
  const toneClass = tone === 'success'
    ? 'text-success'
    : tone === 'warn'
      ? 'text-warn'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-foreground';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

function ModelMetricsTable({ items }: {
  items: Awaited<ReturnType<typeof getAdminItineraryStability>>['by_model'];
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Activity className="h-4 w-4" aria-hidden="true" />按模型
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[980px] text-left text-xs">
          <caption className="sr-only">按模型统计</caption>
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">模型</th>
              <th scope="col" className="px-3 py-2">行程 C / P / F</th>
              <th scope="col" className="px-3 py-2">Complete 率</th>
              <th scope="col" className="px-3 py-2">工具 S / D / F</th>
              <th scope="col" className="px-3 py-2">运行 P50 / P95</th>
              <th scope="col" className="px-3 py-2">工具 P50 / P95</th>
              <th scope="col" className="px-3 py-2">异常信号</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.model_id} className="border-t border-border/60">
                <td className="max-w-[220px] break-all px-3 py-2 font-medium">{item.model_id}</td>
                <td className="px-3 py-2">
                  {formatNumber(item.itinerary.complete)} / {formatNumber(item.itinerary.partial)} / {formatNumber(item.itinerary.failed)}
                </td>
                <td className="px-3 py-2">{formatPercentage(item.itinerary.complete, item.itinerary.total)}</td>
                <td className="px-3 py-2">
                  {formatNumber(item.product_tools.success)} / {formatNumber(item.product_tools.degraded)} / {formatNumber(item.product_tools.failed)}
                </td>
                <td className="px-3 py-2">{formatDurationPair(item.run_latency_ms)}</td>
                <td className="px-3 py-2">{formatDurationPair(item.tool_latency_ms)}</td>
                <td className="px-3 py-2">
                  上游 {formatNumber(item.signals.upstream_error)} · 修参 {formatNumber(item.signals.repair_required)} · 额度 {formatNumber(totalBudgetSignals(item.signals))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ToolMetricsTable({ items }: { items: AdminItineraryStabilityToolItem[] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Wrench className="h-4 w-4" aria-hidden="true" />按工具
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[760px] text-left text-xs">
          <caption className="sr-only">按工具统计</caption>
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">工具</th>
              <th scope="col" className="px-3 py-2">调用</th>
              <th scope="col" className="px-3 py-2">成功 / 降级 / 失败</th>
              <th scope="col" className="px-3 py-2">P50 / P95</th>
              <th scope="col" className="px-3 py-2">上游错误</th>
              <th scope="col" className="px-3 py-2">额度耗尽</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.tool_name} className="border-t border-border/60">
                <td className="px-3 py-2 font-medium" title={item.tool_name}>{toolLabel(item.tool_name)}</td>
                <td className="px-3 py-2">{formatNumber(item.calls.total)}</td>
                <td className="px-3 py-2">
                  {formatNumber(item.calls.success)} / {formatNumber(item.calls.degraded)} / {formatNumber(item.calls.failed)}
                </td>
                <td className="px-3 py-2">{formatDurationPair(item.latency_ms)}</td>
                <td className="px-3 py-2">{formatNumber(item.upstream_error)}</td>
                <td className="px-3 py-2">{formatNumber(item.budget_exhausted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildWindowQuery(hours: number, modelId = '', now = new Date()): AdminItineraryStabilityQuery {
  const createdTo = now;
  const createdFrom = new Date(createdTo.getTime() - hours * 60 * 60 * 1000);
  return {
    created_from: toShanghaiIso(createdFrom),
    created_to: toShanghaiIso(createdTo),
    ...(modelId ? { model_id: modelId } : {}),
  };
}

function toShanghaiIso(value: Date): string {
  return new Date(value.getTime() + SHANGHAI_OFFSET_MS).toISOString().replace('Z', '+08:00');
}

function formatDuration(value: number | null): string {
  if (value === null) return '未采集';
  if (value < 1000) return `${formatNumber(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatDurationPair(value: AdminLatencyPercentiles): string {
  return `${formatDuration(value.p50_ms)} / ${formatDuration(value.p95_ms)}`;
}

function formatPercentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—';
  const percentage = (numerator / denominator) * 100;
  return `${Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1)}%`;
}

function totalBudgetSignals(signals: AdminItineraryStabilitySignals): number {
  return signals.travel_budget_exhausted
    + signals.server_budget_exhausted
    + signals.agent_limit_reached;
}

function toolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    search_flights: '航班查询',
    search_trains: '高铁查询',
    route_compare: '路线规划',
    weather_forecast: '天气查询',
    local_place_search: '地点搜索',
  };
  return labels[toolName] || '其他产品工具';
}
