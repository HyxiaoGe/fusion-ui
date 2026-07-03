"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  activateRuntimeConfigEntryAPI,
  createRuntimeConfigEntryAPI,
  fetchRuntimeConfigSnapshotAPI,
  setRuntimeConfigEntryActiveAPI,
  validateRuntimeConfigAPI,
  type RuntimeConfigEntry,
  type RuntimeConfigPayload,
  type RuntimeConfigSnapshot,
  type RuntimeConfigValidationResult,
} from "@/lib/api/runtimeConfig";

type PendingAction = {
  kind: "activate" | "disable";
  entry: RuntimeConfigEntry;
};

const emptyForm = {
  namespace: "prompt_template",
  key: "generate_title",
  version: "",
  description: "",
  payload: '{\n  "template": ""\n}',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parsePayload(raw: string): RuntimeConfigPayload {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload 必须是 JSON 对象");
  }
  return parsed as RuntimeConfigPayload;
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

export default function RuntimeConfigManager() {
  const [snapshot, setSnapshot] = useState<RuntimeConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] = useState<RuntimeConfigValidationResult | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [form, setForm] = useState(emptyForm);

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

  const updateForm = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };

  const buildValidateRequest = () => ({
    namespace: form.namespace.trim(),
    key: form.key.trim(),
    payload: parsePayload(form.payload),
  });

  const handleValidate = async () => {
    setOperationLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await validateRuntimeConfigAPI(buildValidateRequest());
      setValidation(result);
    } catch (err: unknown) {
      setValidation(null);
      setError(errorMessage(err, "运行时配置校验失败"));
    } finally {
      setOperationLoading(false);
    }
  };

  const handleCreate = async () => {
    setOperationLoading(true);
    setError(null);
    setNotice(null);
    try {
      const request = buildValidateRequest();
      const result = await validateRuntimeConfigAPI(request);
      setValidation(result);
      if (!result.valid) {
        return;
      }
      await createRuntimeConfigEntryAPI({
        ...request,
        version: form.version.trim(),
        description: form.description.trim() || null,
      });
      setNotice("候选版本已创建，尚未生效");
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, "候选版本创建失败"));
    } finally {
      setOperationLoading(false);
    }
  };

  const runPendingAction = async () => {
    if (!pendingAction) return;
    setOperationLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (pendingAction.kind === "activate") {
        await activateRuntimeConfigEntryAPI(pendingAction.entry.id);
        setNotice("版本已激活");
      } else {
        await setRuntimeConfigEntryActiveAPI(pendingAction.entry.id, false);
        setNotice("版本已禁用");
      }
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, pendingAction.kind === "activate" ? "版本激活失败" : "版本禁用失败"));
    } finally {
      setOperationLoading(false);
      setPendingAction(null);
    }
  };

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
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={operationLoading}>
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

      {(error || notice) && (
        <div
          className={`rounded-md border p-3 text-sm ${error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"}`}
        >
          {error || notice}
        </div>
      )}

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="text-base">创建候选版本</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="runtime-config-namespace">命名空间</Label>
              <Input
                id="runtime-config-namespace"
                value={form.namespace}
                onChange={(event) => updateForm("namespace", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runtime-config-key">配置 Key</Label>
              <Input id="runtime-config-key" value={form.key} onChange={(event) => updateForm("key", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runtime-config-version">版本号</Label>
              <Input
                id="runtime-config-version"
                value={form.version}
                onChange={(event) => updateForm("version", event.target.value)}
                placeholder="2026-07-03.title-v2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runtime-config-description">描述</Label>
              <Input
                id="runtime-config-description"
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="runtime-config-payload">JSON Payload</Label>
            <Textarea
              id="runtime-config-payload"
              className="min-h-32 font-mono text-xs"
              value={form.payload}
              onChange={(event) => updateForm("payload", event.target.value)}
            />
          </div>
          {validation && (
            <div className={`rounded-md border p-3 text-sm ${validation.valid ? "text-emerald-700" : "text-destructive"}`}>
              <div className="flex items-center gap-2 font-medium">
                {validation.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {validation.valid ? "校验通过" : "校验未通过"}
              </div>
              {validation.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {validation.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void handleValidate()} disabled={operationLoading}>
              校验
            </Button>
            <Button type="button" onClick={() => void handleCreate()} disabled={operationLoading || !form.version.trim()}>
              创建候选
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="text-base">当前生效配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {(snapshot?.effective ?? []).map((item) => (
            <div key={`${item.namespace}:${item.key}`} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{item.namespace} / {item.key}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.source === "db" ? "数据库" : "代码默认"} · {item.version}
                  </p>
                </div>
                <Badge variant={item.valid ? "outline" : "destructive"}>{item.valid ? "有效" : "异常"}</Badge>
              </div>
              {(item.skipped_versions?.length ?? 0) > 0 && (
                <p className="mt-2 text-xs text-amber-600">跳过 {item.skipped_versions?.length} 个坏版本</p>
              )}
              {item.issues.length > 0 && (
                <p className="mt-2 text-xs text-destructive">{item.issues.join("；")}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            版本列表
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {(snapshot?.entries ?? []).map((entry) => (
            <div
              key={entry.id}
              data-testid={`runtime-config-entry-${entry.id}`}
              className="rounded-md border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{entry.namespace} / {entry.key}</p>
                    {statusBadge(entry)}
                  </div>
                  <p className="mt-1 text-sm">{entry.version}</p>
                  {entry.description && <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">更新于 {formatDateTime(entry.updated_at || entry.created_at)}</p>
                  {entry.issues.length > 0 && (
                    <p className="mt-2 text-xs text-destructive">{entry.issues.join("；")}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!entry.is_active && entry.valid && (
                    <Button size="sm" variant="outline" onClick={() => setPendingAction({ kind: "activate", entry })}>
                      激活
                    </Button>
                  )}
                  {entry.is_active && (
                    <Button size="sm" variant="destructive" onClick={() => setPendingAction({ kind: "disable", entry })}>
                      禁用
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={Boolean(pendingAction)}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void runPendingAction()}
        title={pendingAction?.kind === "activate" ? "激活配置版本" : "禁用配置版本"}
        description={
          pendingAction
            ? `${pendingAction.entry.namespace}/${pendingAction.entry.key}@${pendingAction.entry.version}`
            : ""
        }
        confirmLabel={pendingAction?.kind === "activate" ? "确认激活" : "确认禁用"}
        variant={pendingAction?.kind === "disable" ? "destructive" : "default"}
      />
    </div>
  );
}
