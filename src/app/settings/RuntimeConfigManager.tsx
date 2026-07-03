"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchRuntimeConfigSnapshotAPI,
  type RuntimeConfigEntry,
  type RuntimeConfigPayload,
  type RuntimeConfigSnapshot,
} from "@/lib/api/runtimeConfig";
import {
  getRuntimeConfigPresentation,
  summarizeRuntimeConfigPayload,
} from "./runtimeConfigPresentation";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function statusBadge(entry: RuntimeConfigEntry) {
  if (!entry.valid) {
    return <Badge variant="destructive">校验失败</Badge>;
  }
  if (entry.is_active) {
    return <Badge>生效中</Badge>;
  }
  return <Badge variant="outline">候选版本</Badge>;
}

function sourceLabel(source: string): string {
  return source === "db" ? "数据库" : "代码默认";
}

function PayloadSummary({ payload }: { payload: RuntimeConfigPayload }) {
  return (
    <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
      {summarizeRuntimeConfigPayload(payload).map((item) => (
        <li key={item} className="rounded-sm bg-muted/30 px-2 py-1">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function RuntimeConfigManager() {
  const [snapshot, setSnapshot] = useState<RuntimeConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRuntimeConfigSnapshotAPI();
      setSnapshot(data);
    } catch (err: unknown) {
      setError(errorMessage(err, "运行时配置加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const effectiveCount = snapshot?.effective.length ?? 0;
    const entryCount = snapshot?.entries.length ?? 0;
    const issueCount = [
      ...(snapshot?.effective ?? []).filter((item) => !item.valid || (item.skipped_versions?.length ?? 0) > 0),
      ...(snapshot?.entries ?? []).filter((entry) => !entry.valid),
    ].length;
    return { effectiveCount, entryCount, issueCount };
  }, [snapshot]);

  if (loading) {
    return (
      <Card className="border-muted shadow-sm">
        <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载运行时配置
        </CardContent>
      </Card>
    );
  }

  if (error && !snapshot) {
    return (
      <Card className="border-muted shadow-sm">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              运行时配置
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">当前配置</p>
            <p className="mt-1 text-2xl font-semibold">{stats.effectiveCount}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">版本记录</p>
            <p className="mt-1 text-2xl font-semibold">{stats.entryCount}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">需关注</p>
            <p className="mt-1 text-2xl font-semibold">{stats.issueCount}</p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="text-base">当前生效配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {(snapshot?.effective ?? []).map((item) => {
            const presentation = getRuntimeConfigPresentation(item.namespace, item.key);
            return (
              <div key={`${item.namespace}:${item.key}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{presentation.title}</p>
                      <Badge variant="outline">{presentation.category}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{presentation.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{presentation.impact}</p>
                    <p className="mt-1 text-xs text-muted-foreground">内部标识：{item.namespace} / {item.key}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      当前来源：{sourceLabel(item.source)} · {item.version}
                    </p>
                  </div>
                  <Badge variant={item.valid ? "outline" : "destructive"}>{item.valid ? "有效" : "异常"}</Badge>
                </div>
                <PayloadSummary payload={item.payload} />
                {(item.skipped_versions?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-amber-600">跳过 {item.skipped_versions?.length} 个坏版本</p>
                )}
                {item.issues.length > 0 && (
                  <p className="mt-2 text-xs text-destructive">{item.issues.join("；")}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              配置版本记录
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              这里只展示运行时配置的当前状态和历史记录；配置变更仍通过代码、Agent 和 CI/CD 流程完成。
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {(snapshot?.entries ?? []).map((entry) => {
            const presentation = getRuntimeConfigPresentation(entry.namespace, entry.key);
            return (
              <div
                key={entry.id}
                data-testid={`runtime-config-entry-${entry.id}`}
                className="rounded-md border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{presentation.title}</p>
                      {statusBadge(entry)}
                      <Badge variant="outline">{presentation.category}</Badge>
                    </div>
                    <p className="mt-1 text-sm">{entry.version}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{entry.description || presentation.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">内部标识：{entry.namespace} / {entry.key}</p>
                    <p className="mt-1 text-xs text-muted-foreground">更新于 {formatDateTime(entry.updated_at || entry.created_at)}</p>
                    <PayloadSummary payload={entry.payload} />
                    {entry.issues.length > 0 && (
                      <p className="mt-2 text-xs text-destructive">{entry.issues.join("；")}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
