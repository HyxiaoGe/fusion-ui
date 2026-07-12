'use client';

import { useCallback } from 'react';
import { getAdminPerformanceRun } from '@/lib/api/adminAudit';
import { useAdminAuditResource } from '@/hooks/useAdminAuditResource';
import { Badge } from '@/components/ui/badge';
import type {
  AdminJsonValue,
  AdminPerformanceRunDetail as AdminPerformanceRunDetailData,
  AdminPerformanceResourceMetrics,
  AdminPerformanceStageSummary,
} from '@/types/adminAudit';
import { AdminEmpty, AdminError, AdminLoading, formatAdminDate } from './AdminPanelPrimitives';

type MetricFormat = 'number' | 'ms' | 'seconds' | 'rate' | 'percent' | 'boolean';
type MetricDefinition = readonly [key: string, label: string, format?: MetricFormat];

const STAGE_LEVEL: Record<string, string> = {
  http: 'L1',
  sse: 'L2',
  recovery: 'L3',
  stop: 'L3',
  soak: 'L4',
};

const STAGE_KIND_LABEL: Record<string, string> = {
  http: 'HTTP 基线',
  sse: '流式对话',
  recovery: '断线恢复',
  stop: '停止生成',
  soak: '稳定性压测',
};

const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);

const STAGE_METRIC_LABELS_BY_KIND: Record<string, Record<string, string>> = {
  sse: {
    duration_seconds: '实际墙钟耗时',
  },
  soak: {
    concurrency: '每 Tick flow 数',
    total: 'Tick 样本',
    successful: '成功 Tick',
    failed: '失败 Tick',
    p50_ms: '各窗口 P50 的 P50',
    p95_ms: '各窗口 P95 的 P95',
    timeout_rate: 'Tick 超时率',
  },
};

const STAGE_METRICS: MetricDefinition[] = [
  ['concurrency', '并发数'],
  ['duration_seconds', '计划时长', 'seconds'],
  ['elapsed_seconds', '实际时长', 'seconds'],
  ['cadence_seconds', '执行间隔', 'seconds'],
  ['window_seconds', '统计窗口', 'seconds'],
  ['total', '总次数'],
  ['requests', '请求数'],
  ['flows', '流数量'],
  ['flows_with_output', '有输出流'],
  ['successful', '成功数'],
  ['failed', '失败数'],
  ['success_rate', '成功率', 'rate'],
  ['requests_per_second', '请求吞吐'],
  ['rps', 'RPS'],
  ['p50_ms', '耗时 P50', 'ms'],
  ['p90_ms', '耗时 P90', 'ms'],
  ['p95_ms', '耗时 P95', 'ms'],
  ['p99_ms', '耗时 P99', 'ms'],
  ['max_ms', '最大耗时', 'ms'],
  ['p50_ttft_ms', '首次可见输出 P50', 'ms'],
  ['p95_ttft_ms', '首次可见输出 P95', 'ms'],
  ['p99_ttft_ms', '首次可见输出 P99', 'ms'],
  ['p95_total_ms', '总耗时 P95', 'ms'],
  ['error_rate', '错误率', 'rate'],
  ['timeout_rate', '超时率', 'rate'],
  ['error_frames', '错误帧'],
  ['output_chunks', '输出块'],
  ['reasoning_chunks', '推理块'],
  ['answering_chunks', '回答块'],
  ['visible_chars', '可见字符'],
  ['reasoning_visible_chars', '推理字符'],
  ['answering_visible_chars', '回答字符'],
  ['approx_tokens', '估算 Token'],
  ['first_output_p50_ms', '首次输出 P50', 'ms'],
  ['first_output_p95_ms', '首次输出 P95', 'ms'],
  ['first_output_max_ms', '首次输出最大值', 'ms'],
  ['chunk_interval_count', '块间隔样本'],
  ['chunk_interval_p50_ms', '块间隔 P50', 'ms'],
  ['chunk_interval_p95_ms', '块间隔 P95', 'ms'],
  ['chunk_interval_max_ms', '块间隔最大值', 'ms'],
  ['output_window_p50_ms', '输出窗口 P50', 'ms'],
  ['output_window_p95_ms', '输出窗口 P95', 'ms'],
  ['output_window_max_ms', '输出窗口最大值', 'ms'],
  ['tokens_per_second', '估算 Token/秒'],
  ['tokens_per_second_p50', '估算 Token/秒 P50'],
  ['tokens_per_second_p95', '估算 Token/秒 P95'],
  ['tokens_per_second_max', '估算 Token/秒最大值'],
  ['initial_events', '初始事件'],
  ['recovered_events', '恢复事件'],
  ['lost_events', '未覆盖事件下界'],
  ['ordering_errors', '顺序错误'],
  ['duplicate_events', '重复事件'],
  ['recovery_latency_ms', '断线恢复耗时', 'ms'],
  ['recovery_latency_p50_ms', '断线恢复 P50', 'ms'],
  ['recovery_latency_p95_ms', '断线恢复 P95', 'ms'],
  ['recovery_latency_max_ms', '断线恢复最大值', 'ms'],
  ['stop_attempted', '已尝试停止', 'boolean'],
  ['cancelled', '已取消', 'boolean'],
  ['persistence_verified', '持久化已验证', 'boolean'],
  ['stop_attempts', '停止尝试'],
  ['cancelled_count', '取消成功'],
  ['persistence_verified_count', '持久化验证成功'],
  ['stop_latency_ms', '停止场景耗时', 'ms'],
  ['stop_latency_p50_ms', '停止场景耗时 P50', 'ms'],
  ['stop_latency_p95_ms', '停止场景耗时 P95', 'ms'],
  ['stop_latency_max_ms', '停止场景耗时最大值', 'ms'],
  ['executed_ticks', '已执行 Tick'],
  ['skipped_ticks', '跳过 Tick'],
  ['window_count', '窗口数'],
  ['consecutive_failures', '连续失败'],
];

const SUMMARY_METRICS: MetricDefinition[] = [
  ['rps', '整体 RPS'],
  ['p50_ms', '整体 P50', 'ms'],
  ['p90_ms', '整体 P90', 'ms'],
  ['p95_ms', '整体 P95', 'ms'],
  ['p99_ms', '整体 P99', 'ms'],
  ['max_ms', '整体最大耗时', 'ms'],
  ['ttft_ms', '整体首次可见输出', 'ms'],
  ['error_rate', '整体错误率', 'rate'],
];

const RESOURCE_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['api', 'API'],
  ['postgres', 'PostgreSQL'],
  ['redis', 'Redis'],
  ['host', '宿主机'],
  ['nginx', 'Nginx'],
  ['litellm', 'LiteLLM'],
];

const RESOURCE_METRICS: MetricDefinition[] = [
  ['cpu_percent', 'CPU 窗口峰值', 'percent'],
  ['memory_mib', '内存窗口峰值 MiB'],
  ['memory_percent', '内存占比窗口峰值', 'percent'],
  ['connections', '连接窗口峰值'],
  ['restarts', '重启增量'],
  ['rejected_connections', '拒绝连接增量'],
  ['evicted_keys', '淘汰 Key 增量'],
  ['oom', '窗口发生 OOM', 'boolean'],
];

const HOST_RESOURCE_METRICS: MetricDefinition[] = RESOURCE_METRICS.map((definition): MetricDefinition => (
  definition[0] === 'memory_mib' ? ['memory_mib', '可用内存窗口最低值 MiB'] : definition
));

function formatMetric(value: AdminJsonValue | undefined, format: MetricFormat = 'number'): string | null {
  if (value === null) return '未采集';
  if (value === undefined) return null;
  if (format === 'boolean') return value === true ? '是' : value === false ? '否' : null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return typeof value === 'string' ? value : null;
  const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(
    format === 'rate' ? value * 100 : value,
  );
  if (format === 'ms') return `${number} ms`;
  if (format === 'seconds') return `${number} 秒`;
  if (format === 'rate' || format === 'percent') return `${number}%`;
  return number;
}

function MetricGrid({ source, definitions }: { source: object; definitions: MetricDefinition[] }) {
  const values = source as Record<string, AdminJsonValue | undefined>;
  const items = definitions.flatMap(([key, label, format]) => {
    const value = formatMetric(values[key], format);
    return value === null ? [] : [{ key, label, value }];
  });
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {items.map(item => (
        <div key={item.key} className="min-w-0 rounded-lg bg-muted/30 p-2.5">
          <dt className="break-words text-[11px] text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StageCard({ stage, index }: { stage: AdminPerformanceStageSummary; index: number }) {
  const kind = typeof stage.kind === 'string' ? stage.kind : '';
  const definitions = STAGE_METRICS.map(([key, label, format]): MetricDefinition => [
    key,
    STAGE_METRIC_LABELS_BY_KIND[kind]?.[key] || label,
    format,
  ]);
  return (
    <article className="min-w-0 rounded-xl border border-border/70 bg-card p-3 sm:p-4">
      <header className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="outline">{STAGE_LEVEL[kind] || '阶段'}</Badge>
        <h4 className="font-medium">{STAGE_KIND_LABEL[kind] || kind || `阶段 ${index + 1}`}</h4>
        {typeof stage.scenario === 'string' ? <span className="min-w-0 break-all text-xs text-muted-foreground">{stage.scenario}</span> : null}
      </header>
      <MetricGrid source={stage} definitions={definitions} />
    </article>
  );
}

function Resources({ resources }: { resources: AdminPerformanceRunDetailData['safe_summary']['resources'] }) {
  if (resources === null) return <AdminEmpty>资源未采集</AdminEmpty>;
  if (resources === undefined) return <AdminEmpty>暂无资源汇总</AdminEmpty>;
  const groups = RESOURCE_GROUPS.flatMap(([key, label]) => {
    if (!Object.prototype.hasOwnProperty.call(resources, key)) return [];
    return [{ key, label, value: resources[key as keyof typeof resources] }];
  });
  if (groups.length === 0) return <AdminEmpty>暂无资源汇总</AdminEmpty>;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {groups.map(group => (
        <article key={group.key} className="min-w-0 rounded-xl border border-border/70 p-3">
          <h4 className="mb-2 text-sm font-medium">{group.label}</h4>
          {group.value === null ? <p className="text-sm text-muted-foreground">未采集</p> : (
            <MetricGrid
              source={group.value as AdminPerformanceResourceMetrics}
              definitions={group.key === 'host' ? HOST_RESOURCE_METRICS : RESOURCE_METRICS}
            />
          )}
        </article>
      ))}
    </div>
  );
}

function statusLabel(run: AdminPerformanceRunDetailData): string {
  if (run.safe_summary.stopped || run.status === 'stopped') return '门禁停止';
  if (run.status === 'completed') return '完整执行';
  return run.status;
}

function RunContent({ run }: { run: AdminPerformanceRunDetailData }) {
  const summary = run.safe_summary || {};
  const stages = Array.isArray(summary.stages) ? summary.stages : [];
  const stopReasons = Array.isArray(summary.stop_reasons) ? summary.stop_reasons : [];
  const cleanup = summary.cleanup;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="状态" value={statusLabel(run)} />
        <Meta label="环境" value={run.environment} />
        <Meta label="模型" value={run.model_id ?? '未采集'} />
        <Meta label="Schema" value={`v${run.schema_version}`} />
        <Meta label="开始时间" value={formatAdminDate(run.started_at)} />
        <Meta label="结束时间" value={formatAdminDate(run.finished_at)} />
        <Meta label="导入时间" value={formatAdminDate(run.created_at)} />
      </div>
      <p className="text-xs text-muted-foreground">状态仅表示压测流程结果，不等同于零错误或服务崩溃。</p>

      {!SUPPORTED_SCHEMA_VERSIONS.has(run.schema_version) ? (
        <AdminEmpty>暂不支持 Schema v{run.schema_version}，为避免误读已隐藏当前指标</AdminEmpty>
      ) : (
        <>

          <MetricGrid source={summary} definitions={SUMMARY_METRICS} />

          <section>
            <h3 className="mb-2 text-sm font-semibold">停止原因</h3>
            {stopReasons.length > 0 ? (
              <ul className="flex flex-wrap gap-2">{stopReasons.map(reason => <li key={reason}><Badge variant="outline" className="break-all">{reason}</Badge></li>)}</ul>
            ) : <p className="text-sm text-muted-foreground">未报告停止原因</p>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">L1-L4 阶段</h3>
            {stages.length > 0 ? (
              <div data-testid="performance-stage-grid" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {stages.map((stage, index) => <StageCard key={`${stage.scenario || stage.kind || 'stage'}-${index}`} stage={stage} index={index} />)}
              </div>
            ) : <AdminEmpty>暂无阶段汇总</AdminEmpty>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">资源快照</h3>
            <Resources resources={summary.resources} />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">清理结果</h3>
            {cleanup ? (
              <div className="space-y-2">
                <MetricGrid source={{
                  conversations_deleted: cleanup.conversations_deleted,
                  tokens_revoked: cleanup.tokens_revoked,
                  users_deleted: cleanup.users_deleted,
                  agent_steps_deleted: cleanup.agent_steps_deleted,
                }} definitions={[
                  ['conversations_deleted', '清理对话'],
                  ['tokens_revoked', '撤销令牌'],
                  ['users_deleted', '清理用户'],
                  ['agent_steps_deleted', '清理 Agent 步骤'],
                ]} />
                {cleanup.errors && cleanup.errors.length > 0 ? (
                  <p className="break-words text-xs text-muted-foreground">清理提示：{cleanup.errors.join('、')}</p>
                ) : <p className="text-xs text-muted-foreground">未报告清理错误</p>}
              </div>
            ) : <AdminEmpty>暂无清理汇总</AdminEmpty>}
          </section>
        </>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium">{value}</div>
    </div>
  );
}

export default function AdminPerformanceRunDetail({
  id,
  runId,
  onForbidden,
}: {
  id: string;
  runId: string;
  onForbidden: () => void;
}) {
  const loader = useCallback((signal: AbortSignal) => getAdminPerformanceRun(runId, signal), [runId]);
  const resource = useAdminAuditResource(loader, onForbidden);

  return (
    <section
      id={id}
      aria-label={`压测详情 ${runId}`}
      aria-labelledby={`${id}-title`}
      className="mt-4 min-w-0 border-t border-border/70 pt-4"
    >
      <h2 id={`${id}-title`} className="mb-3 break-all text-sm font-semibold">压测详情 · {runId}</h2>
      {resource.loading ? <AdminLoading /> : resource.error ? (
        <AdminError message={resource.error} onRetry={resource.reload} retryLabel="重新加载详情" />
      ) : resource.data ? <RunContent run={resource.data} /> : null}
    </section>
  );
}
