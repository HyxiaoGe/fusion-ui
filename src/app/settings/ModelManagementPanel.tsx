"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Rocket,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  admitModelCandidateAPI,
  fetchModelManagementSnapshotAPI,
  updateModelVisibilityAPI,
} from "@/lib/api/modelManagement";
import { isAdminAccessError } from "@/lib/admin/adminAccess";
import { refreshModels } from "@/lib/config/modelConfig";
import { useAppDispatch } from "@/redux/hooks";
import { updateModels, updateProviders } from "@/redux/slices/modelsSlice";
import type {
  ModelAdmissionOperation,
  ModelManagementCandidate,
  ModelManagementRegisteredModel,
  ModelManagementSnapshot,
} from "@/types/modelManagement";

const OPERATION_POLL_INTERVAL_MS = 1500;

type ManagementAction =
  | {
      kind: "visibility";
      model: ModelManagementRegisteredModel;
      nextSelectable: boolean;
    }
  | {
      kind: "admission";
      candidate: ModelManagementCandidate;
      fingerprint: string;
      runId: string;
    };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function candidateFingerprint(candidate: ModelManagementCandidate): string | null {
  return candidate.candidate_fingerprint || null;
}

function candidateStateLabel(state: string): string {
  const labels: Record<string, string> = {
    admission_ready: "可以上线",
    preflight_required: "等待预检",
    quarantined: "暂未通过治理",
    blocked: "已阻止",
    rejected: "未通过门禁",
    admitted: "已上线",
  };
  return labels[state] ?? "等待治理";
}

function registeredStateLabel(model: ModelManagementRegisteredModel): string {
  if (!model.selectable) return "已隐藏";
  if (!model.routable) return "不可路由";
  return model.state === "active" || model.state === "selectable" ? "可选择" : model.state;
}

function healthLabel(health: ModelManagementRegisteredModel["health"]): string {
  const status = typeof health === "string" ? health : health?.status;
  const labels: Record<string, string> = {
    healthy: "健康",
    unhealthy: "异常",
    unknown: "待探测",
  };
  return status ? (labels[status] ?? status) : "未知";
}

function safeOperationError(operation: ModelAdmissionOperation): string {
  if (typeof operation.safe_error === "string" && operation.safe_error.trim()) {
    return operation.safe_error.trim();
  }
  if (
    operation.safe_error
    && typeof operation.safe_error === "object"
    && typeof operation.safe_error.message === "string"
    && operation.safe_error.message.trim()
  ) {
    return operation.safe_error.message.trim();
  }
  const errorLabels: Record<string, string> = {
    authorization_failed: "供应商授权校验失败，请确认服务配置后重试",
    cas_conflict: "治理状态已经变化，请刷新后重新确认",
    candidate_not_admission_ready: "候选模型尚未满足上线条件",
    operation_timeout: "模型上线任务超时，请稍后重试",
    worker_unavailable: "模型上线服务暂时不可用，请稍后重试",
  };
  if (operation.error_code && errorLabels[operation.error_code]) {
    return errorLabels[operation.error_code];
  }
  return "模型上线失败，请检查治理状态后重试";
}

function operationStatusLabel(status: ModelAdmissionOperation["status"]): string {
  if (status === "pending") return "上线任务已排队";
  if (status === "running") return "正在上线";
  if (status === "succeeded") return "上线成功";
  return "上线失败";
}

export default function ModelManagementPanel() {
  const dispatch = useAppDispatch();
  const [snapshot, setSnapshot] = useState<ModelManagementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [action, setAction] = useState<ManagementAction | null>(null);
  const [reason, setReason] = useState("");
  const [localOperations, setLocalOperations] = useState<ModelAdmissionOperation[]>([]);
  const ownedOperationIdsRef = useRef(new Set<string>());
  const handledOperationIdsRef = useRef(new Set<string>());

  const denyAccess = useCallback(() => {
    setAccessDenied(true);
    setSnapshot(null);
    setError(null);
    setNotice(null);
  }, []);

  const loadSnapshot = useCallback(async (showLoading = false): Promise<ModelManagementSnapshot | null> => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const nextSnapshot = await fetchModelManagementSnapshotAPI();
      setSnapshot(nextSnapshot);
      setAccessDenied(false);
      return nextSnapshot;
    } catch (caught: unknown) {
      if (isAdminAccessError(caught)) {
        denyAccess();
        return null;
      }
      setError(errorMessage(caught, "模型管理数据加载失败"));
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [denyAccess]);

  useEffect(() => {
    void loadSnapshot(true);
  }, [loadSnapshot]);

  const operations = useMemo(() => {
    const merged = new Map<string, ModelAdmissionOperation>();
    localOperations.forEach((operation) => merged.set(operation.operation_id, operation));
    snapshot?.operations.forEach((operation) => merged.set(operation.operation_id, operation));
    return [...merged.values()];
  }, [localOperations, snapshot?.operations]);

  const operationByFingerprint = useMemo(() => {
    const result = new Map<string, ModelAdmissionOperation>();
    operations.forEach((operation) => {
      const existing = result.get(operation.candidate_fingerprint);
      if (!existing || (operation.updated_at ?? "") >= (existing.updated_at ?? "")) {
        result.set(operation.candidate_fingerprint, operation);
      }
    });
    return result;
  }, [operations]);

  const hasActiveOperation = operations.some(
    (operation) => operation.status === "pending" || operation.status === "running",
  );

  useEffect(() => {
    if (!hasActiveOperation || accessDenied) return;
    const timer = window.setTimeout(() => {
      void loadSnapshot(false);
    }, OPERATION_POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [accessDenied, hasActiveOperation, loadSnapshot, snapshot]);

  const syncGlobalModelCatalog = useCallback(async () => {
    const catalog = await refreshModels();
    dispatch(updateProviders(catalog.providers));
    dispatch(updateModels(catalog.models));
  }, [dispatch]);

  useEffect(() => {
    const ownedFailedOperation = operations.find((operation) => (
      operation.status === "failed"
      && ownedOperationIdsRef.current.has(operation.operation_id)
      && !handledOperationIdsRef.current.has(operation.operation_id)
    ));
    if (ownedFailedOperation) {
      handledOperationIdsRef.current.add(ownedFailedOperation.operation_id);
      ownedOperationIdsRef.current.delete(ownedFailedOperation.operation_id);
      setError(safeOperationError(ownedFailedOperation));
      setNotice(null);
      return;
    }

    const succeededOperations = operations.filter((operation) => (
      operation.status === "succeeded"
      && !handledOperationIdsRef.current.has(operation.operation_id)
    ));
    if (succeededOperations.length === 0) return;

    succeededOperations.forEach((operation) => {
      handledOperationIdsRef.current.add(operation.operation_id);
      ownedOperationIdsRef.current.delete(operation.operation_id);
    });
    const terminalOperation = succeededOperations[succeededOperations.length - 1];

    setPendingAction(`operation:${terminalOperation.operation_id}`);
    void syncGlobalModelCatalog()
      .then(() => loadSnapshot(false))
      .then(() => {
        setNotice(`${terminalOperation.model_id} 已上线，模型选择器已同步刷新`);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (isAdminAccessError(caught)) {
          denyAccess();
          return;
        }
        setError(`模型已上线，但目录刷新失败：${errorMessage(caught, "请稍后手动刷新")}`);
      })
      .finally(() => {
        setPendingAction(null);
      });
  }, [denyAccess, loadSnapshot, operations, syncGlobalModelCatalog]);

  const stats = useMemo(() => ({
    registered: snapshot?.models.length ?? 0,
    selectable: snapshot?.models.filter((model) => model.selectable).length ?? 0,
    candidates: snapshot?.candidates.length ?? 0,
  }), [snapshot]);

  const closeActionDialog = useCallback(() => {
    if (pendingAction) return;
    setAction(null);
    setReason("");
  }, [pendingAction]);

  const refreshAfterVisibility = useCallback(async () => {
    const [nextSnapshot, catalog] = await Promise.all([
      fetchModelManagementSnapshotAPI(),
      refreshModels(),
    ]);
    setSnapshot(nextSnapshot);
    dispatch(updateProviders(catalog.providers));
    dispatch(updateModels(catalog.models));
  }, [dispatch]);

  const submitAction = useCallback(async () => {
    if (!action || !reason.trim() || pendingAction) return;
    const normalizedReason = reason.trim();
    const actionKey = action.kind === "visibility"
      ? `visibility:${action.model.model_id}`
      : `admission:${action.fingerprint}`;
    setPendingAction(actionKey);
    setError(null);
    setNotice(null);

    try {
      if (action.kind === "visibility") {
        await updateModelVisibilityAPI(action.model.model_id, {
          selectable: action.nextSelectable,
          reason: normalizedReason,
          expected_revision: action.model.revision,
        });
        await refreshAfterVisibility();
        setNotice(action.nextSelectable
          ? `${action.model.name} 已恢复到新对话模型选择器`
          : `${action.model.name} 已从新选择中隐藏，已有对话仍可用`);
      } else {
        const operation = await admitModelCandidateAPI(action.fingerprint, {
          model_id: action.candidate.model_id,
          expected_run_id: action.runId,
          reason: normalizedReason,
        });
        ownedOperationIdsRef.current.add(operation.operation_id);
        setLocalOperations((current) => [
          ...current.filter((item) => item.operation_id !== operation.operation_id),
          operation,
        ]);
        setNotice(`${action.candidate.model_id} 上线任务已排队，完成前不会加入模型选择器`);
        await loadSnapshot(false);
      }
      setAction(null);
      setReason("");
    } catch (caught: unknown) {
      if (isAdminAccessError(caught)) {
        denyAccess();
        return;
      }
      setError(errorMessage(caught, action.kind === "visibility" ? "模型可见性更新失败" : "模型上线任务提交失败"));
    } finally {
      setPendingAction(null);
    }
  }, [action, denyAccess, loadSnapshot, pendingAction, reason, refreshAfterVisibility]);

  if (loading) {
    return (
      <Card className="border-muted shadow-sm">
        <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground" role="status">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载模型管理数据
        </CardContent>
      </Card>
    );
  }

  if (accessDenied) {
    return (
      <Card className="border-muted shadow-sm">
        <CardContent className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <AlertTriangle className="h-4 w-4" />
          当前账号无权访问模型管理
        </CardContent>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card className="border-muted shadow-sm">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
            <AlertTriangle className="h-4 w-4" />
            {error || "模型管理数据加载失败"}
          </div>
          <Button size="sm" variant="outline" onClick={() => void loadSnapshot(true)}>
            <RefreshCw className="h-4 w-4" />
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  const actionTitle = action?.kind === "visibility"
    ? (action.nextSelectable ? `确认恢复 ${action.model.name}` : `确认隐藏 ${action.model.name}`)
    : action?.kind === "admission"
      ? `确认上线 ${action.candidate.model_id}`
      : "确认模型管理操作";
  const confirmLabel = action?.kind === "visibility"
    ? (action.nextSelectable ? "确认恢复" : "确认隐藏")
    : "确认上线";

  return (
    <div className="space-y-4">
      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-5 w-5 text-primary" />
                模型管理
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                控制新对话可选择的模型，并从治理候选中安全发起上线任务。
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(pendingAction)}
              onClick={() => void loadSnapshot(false)}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">已注册模型</p>
            <p data-testid="registered-model-count" className="mt-1 text-2xl font-semibold">{stats.registered}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">新对话可选择</p>
            <p data-testid="selectable-model-count" className="mt-1 text-2xl font-semibold">{stats.selectable}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">治理候选</p>
            <p data-testid="candidate-count" className="mt-1 text-2xl font-semibold">{stats.candidates}</p>
          </div>
        </CardContent>
      </Card>

      {!snapshot.governance.available && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300" role="alert">
          <p className="font-medium">治理候选当前不可用</p>
          <p className="mt-1">{snapshot.governance.message || "治理快照暂时无法读取，已注册模型仍可管理。"}</p>
        </div>
      )}

      {!snapshot.capabilities.admission_enabled && (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          模型上线能力当前未启用；候选状态仍可查看，但不会提供上线操作。
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm" role="status">
          {notice}
        </div>
      )}

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="text-base">已注册模型</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {snapshot.models.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无已注册模型</p>
          )}
          {snapshot.models.map((model) => (
            <div key={model.model_id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{model.name}</p>
                    <Badge variant={model.selectable ? "default" : "outline"}>{registeredStateLabel(model)}</Badge>
                    <Badge variant="outline">{healthLabel(model.health)}</Badge>
                  </div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{model.provider_display} · {model.model_id}</p>
                  {!model.selectable && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      仅从新选择中隐藏，已有对话仍可用。
                    </p>
                  )}
                  {model.reason && <p className="mt-1 text-xs text-muted-foreground">最近原因：{model.reason}</p>}
                </div>
                <Button
                  size="sm"
                  variant={model.selectable ? "outline" : "default"}
                  disabled={Boolean(pendingAction)}
                  aria-label={`${model.selectable ? "隐藏" : "恢复"} ${model.name}`}
                  onClick={() => {
                    setAction({ kind: "visibility", model, nextSelectable: !model.selectable });
                    setReason("");
                  }}
                >
                  {model.selectable ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {model.selectable ? "隐藏" : "恢复"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="text-base">治理候选</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {snapshot.candidates.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">当前没有治理候选</p>
          )}
          {snapshot.candidates.map((candidate) => {
            const fingerprint = candidateFingerprint(candidate);
            const operation = fingerprint ? operationByFingerprint.get(fingerprint) : undefined;
            const operationActive = operation?.status === "pending" || operation?.status === "running";
            const canAdmit = Boolean(
              snapshot.capabilities.admission_enabled
              && snapshot.governance.available
              && snapshot.governance.run_id
              && candidate.state === "admission_ready"
              && fingerprint
              && !operationActive
              && (!operation || operation.status === "failed"),
            );
            return (
              <div key={`${candidate.provider_key}:${candidate.model_id}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{candidate.model_id}</p>
                      <Badge variant={candidate.state === "admission_ready" ? "default" : "outline"}>
                        {candidateStateLabel(candidate.state)}
                      </Badge>
                      {operation && (
                        <Badge variant={operation.status === "failed" ? "destructive" : "outline"}>
                          {operationStatusLabel(operation.status)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">提供商：{candidate.provider_key}</p>
                    {candidate.reasons.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {candidate.reasons.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}
                      </ul>
                    )}
                    {operation?.status === "failed" && (
                      <p className="mt-2 text-sm text-destructive">{safeOperationError(operation)}</p>
                    )}
                  </div>
                  {canAdmit && fingerprint && snapshot.governance.run_id && (
                    <Button
                      size="sm"
                      disabled={Boolean(pendingAction)}
                      aria-label={`上线 ${candidate.model_id}`}
                      onClick={() => {
                        setAction({
                          kind: "admission",
                          candidate,
                          fingerprint,
                          runId: snapshot.governance.run_id as string,
                        });
                        setReason("");
                      }}
                    >
                      <Rocket className="h-4 w-4" />
                      上线
                    </Button>
                  )}
                  {operationActive && (
                    <Button size="sm" variant="outline" disabled aria-label={`${operationStatusLabel(operation.status)} ${candidate.model_id}`}>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {operationStatusLabel(operation.status)}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && closeActionDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {action?.kind === "visibility" && !action.nextSelectable
                ? "仅从新选择中隐藏，已有对话仍可用。请填写原因后确认。"
                : action?.kind === "visibility"
                  ? "恢复后，新对话可以再次选择这个模型。请填写原因后确认。"
                  : "上线会创建后台操作；只有任务成功后模型才会进入选择器。请填写原因后确认。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="model-management-reason" className="text-sm font-medium">操作原因</label>
            <Input
              id="model-management-reason"
              value={reason}
              maxLength={300}
              disabled={Boolean(pendingAction)}
              placeholder="说明本次变更依据"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={Boolean(pendingAction)} onClick={closeActionDialog}>取消</Button>
            <Button
              variant={action?.kind === "visibility" && !action.nextSelectable ? "destructive" : "default"}
              disabled={!reason.trim() || Boolean(pendingAction)}
              onClick={() => void submitAction()}
            >
              {pendingAction ? "处理中" : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
