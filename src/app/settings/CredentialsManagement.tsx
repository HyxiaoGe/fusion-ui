"use client";

import { useEffect, useState } from "react";
import { Key, Save, Trash2, RotateCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import {
  fetchCredentials,
  upsertCredential,
  deleteCredentialThunk,
} from "@/redux/slices/credentialsSlice";
import { fetchModels } from "@/redux/slices/modelsSlice";
import { recoverProvider, testCredential } from "@/lib/api/credentials";

export default function CredentialsManagement() {
  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.models.providers);
  const credentials = useAppSelector((s) => s.credentials.items);
  const isAdmin = useAppSelector((s) => s.auth.user?.is_superuser ?? false);

  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; message: string }>>({});

  useEffect(() => {
    dispatch(fetchCredentials());
    if (providers.length === 0) dispatch(fetchModels());
  }, [dispatch, providers.length]);

  const setEditingFor = (pid: string, value: string) => setEditing((s) => ({ ...s, [pid]: value }));
  const clearEditing = (pid: string) =>
    setEditing((s) => {
      const rest = { ...s };
      delete rest[pid];
      return rest;
    });
  const setFeedbackFor = (pid: string, fb: { ok: boolean; message: string }) => {
    setFeedback((s) => ({ ...s, [pid]: fb }));
    window.setTimeout(() => {
      setFeedback((s) => {
        const rest = { ...s };
        delete rest[pid];
        return rest;
      });
    }, 4000);
  };

  const handleSave = async (pid: string) => {
    const apiKey = editing[pid];
    if (!apiKey) return;
    setSaving((s) => ({ ...s, [pid]: true }));
    try {
      await dispatch(upsertCredential({ providerId: pid, apiKey })).unwrap();
      clearEditing(pid);
      setFeedbackFor(pid, { ok: true, message: "已保存" });
    } catch (e: unknown) {
      setFeedbackFor(pid, { ok: false, message: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving((s) => ({ ...s, [pid]: false }));
    }
  };

  const handleDelete = async (pid: string) => {
    if (!confirm("确定删除该 provider 的 key？删除后将使用系统默认 key。")) return;
    try {
      await dispatch(deleteCredentialThunk(pid)).unwrap();
      setFeedbackFor(pid, { ok: true, message: "已删除" });
    } catch (e: unknown) {
      setFeedbackFor(pid, { ok: false, message: e instanceof Error ? e.message : "删除失败" });
    }
  };

  const handleTest = async (pid: string) => {
    setTesting((t) => ({ ...t, [pid]: true }));
    try {
      const result = await testCredential(pid, editing[pid] || undefined);
      setFeedbackFor(pid, {
        ok: result.valid,
        message: result.valid ? "✓ key 有效" : `✗ ${result.message ?? result.reason ?? "未知错误"}`,
      });
    } catch (e: unknown) {
      setFeedbackFor(pid, {
        ok: false,
        message: e instanceof Error ? e.message : "测试失败",
      });
    } finally {
      setTesting((t) => ({ ...t, [pid]: false }));
    }
  };

  const handleRecover = async (pid: string) => {
    try {
      await recoverProvider(pid);
      await dispatch(fetchModels());
      setFeedbackFor(pid, { ok: true, message: "已重新启用" });
    } catch (e: unknown) {
      setFeedbackFor(pid, {
        ok: false,
        message: e instanceof Error ? e.message : "恢复失败",
      });
    }
  };

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const cred = credentials.find((c) => c.provider_id === provider.id);
        const isOffline = provider.status === "offline";
        const isEditingThis = provider.id in editing;
        const fb = feedback[provider.id];

        return (
          <Card key={provider.id} className={isOffline ? "border-destructive/50" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  {provider.name}
                </span>
                <span className={`text-xs ${isOffline ? "text-destructive" : "text-emerald-600"}`}>
                  {isOffline ? "⊘ 离线" : "● 在线"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={cred ? cred.api_key_masked : "未设置（使用系统默认 key）"}
                  value={editing[provider.id] ?? ""}
                  onChange={(e) => setEditingFor(provider.id, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-md border border-input bg-transparent text-sm font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing[provider.id]}
                  onClick={() => handleTest(provider.id)}
                >
                  {testing[provider.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : "验证"}
                </Button>
                {isEditingThis && (
                  <Button
                    size="sm"
                    disabled={saving[provider.id]}
                    onClick={() => handleSave(provider.id)}
                  >
                    {saving[provider.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {cred && !isEditingThis && (
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(provider.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {fb && (
                <p className={`text-xs ${fb.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {fb.message}
                </p>
              )}
              {isOffline && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    原因：{provider.offline_reason ?? "未知"}
                    {provider.offline_message ? ` · ${provider.offline_message}` : null}
                  </p>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRecover(provider.id)}
                    >
                      <RotateCw className="h-3 w-3 mr-1" /> 重新启用
                    </Button>
                  )}
                </div>
              )}
              {!cred && !isEditingThis && (
                <p className="text-xs text-muted-foreground">未设置则使用系统默认 key</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
