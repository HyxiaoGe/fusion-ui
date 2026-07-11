import { Activity, Clock, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AdminAgentRunRecord, AdminJsonValue, AdminToolCallRecord } from '@/types/adminAudit';

interface AdminExecutionInspectorProps {
  runs: AdminAgentRunRecord[];
  toolCalls: AdminToolCallRecord[];
}

export default function AdminExecutionInspector({ runs, toolCalls }: AdminExecutionInspectorProps) {
  if (runs.length === 0 && toolCalls.length === 0) return null;

  return (
    <div className="space-y-4">
      {runs.map(run => (
        <section key={run.id} className="rounded-xl border border-border/70 bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-4 w-4" aria-hidden="true" />
            <span className="font-medium">{run.id}</span>
            <Badge variant="outline">{run.status}</Badge>
            {run.model_id ? <span className="text-xs text-muted-foreground">{run.model_id}</span> : null}
            {run.provider ? <span className="text-xs text-muted-foreground">{run.provider}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{run.total_steps} 步</span>
            <span>{run.total_tool_calls} 次工具</span>
            <span>{formatDuration(run.total_duration_ms)}</span>
            {run.limit_reason ? <span>限制：{run.limit_reason}</span> : null}
          </div>
          {run.steps.length > 0 ? (
            <div className="mt-3 space-y-2">
              {run.steps.map(step => (
                <div key={step.id} className="rounded-md border border-border/50 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">步骤 {step.step_number}</span>
                    <span className="text-muted-foreground">{step.status} · {formatDuration(step.duration_ms)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {run.progress ? <SafeJson title="进度安全投影" value={run.progress} /> : null}
          {run.config ? <SafeJson title="安全配置" value={run.config} /> : null}
          {run.error ? <SafeJson title="运行错误" value={run.error} /> : null}
        </section>
      ))}

      {toolCalls.length > 0 ? (
        <section className="rounded-xl border border-border/70 bg-card p-4">
          <h3 className="flex items-center gap-2 font-medium">
            <Wrench className="h-4 w-4" aria-hidden="true" />
            工具调用
          </h3>
          <div className="mt-3 space-y-3">
            {toolCalls.map(call => (
              <div key={call.id} className="rounded-md border border-border/50 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{call.tool_name}</span>
                  <Badge variant="outline">{call.status}</Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {formatDuration(call.duration_ms)}
                  </span>
                </div>
                <SafeJson title="参数安全投影" value={call.arguments} />
                <SafeJson title="结果安全投影" value={call.result_preview} />
                {call.error ? <SafeJson title="工具错误" value={call.error} /> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SafeJson({ title, value }: { title: string; value: AdminJsonValue }) {
  return (
    <details className="mt-2 rounded-md bg-muted/20 px-2 py-1.5">
      <summary className="cursor-pointer text-xs text-muted-foreground">{title}</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function formatDuration(value: number | null): string {
  if (value === null) return '耗时未知';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}
