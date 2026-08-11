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
  Search,
  X,
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
import ProviderIcon from "@/components/models/ProviderIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
  ModelManagementGovernanceStatus,
  ModelManagementRegisteredModel,
  ModelManagementSnapshot,
} from "@/types/modelManagement";

const OPERATION_POLL_INTERVAL_MS = 1500;
const ALL_PROVIDERS_VALUE = "__all_providers__";
const UNKNOWN_PROVIDER_VALUE = "__unknown_provider__";
export const MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY = "fusion.model-management.owned-operations.v1";

function readOwnedOperationIds(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function persistOwnedOperationIds(ids: Set<string>): void {
  try {
    if (ids.size === 0) {
      window.sessionStorage.removeItem(MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // sessionStorage 不可用时仍保留当前组件生命周期内的任务跟踪。
  }
}

interface ProviderCategory {
  id: string;
  label: string;
  registeredCount: number;
  candidateCount: number;
}

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

function providerId(value?: string | null): string {
  return value?.trim().toLowerCase() || UNKNOWN_PROVIDER_VALUE;
}

function providerLabel(value?: string | null, fallback?: string | null): string {
  return value?.trim() || fallback?.trim() || "未记录提供商";
}

function matchesModelSearch(query: string, values: Array<string | null | undefined>): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = values.filter(Boolean).join(" ").toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

type GovernanceState = "available" | "degraded" | "unavailable";

function governanceState(governance: ModelManagementGovernanceStatus): GovernanceState {
  if (!governance.available || governance.status === "unavailable") return "unavailable";
  return governance.status === "degraded" ? "degraded" : "available";
}

function unavailableGovernanceMessage(message?: string | null): string {
  const normalized = message?.trim();
  if (!normalized || normalized === "治理候选暂时不可用" || normalized === "治理候选当前不可用") {
    return "已注册模型仍可管理。";
  }
  return `${normalized.replace(/[。；;]$/, "")}。已注册模型仍可管理。`;
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

function candidateAdmissionActionLabel(candidate: ModelManagementCandidate): string {
  return candidate.state === "preflight_required" ? "验证并上线" : "上线";
}

function candidateCanRequestAdmission(candidate: ModelManagementCandidate): boolean {
  return candidate.state === "admission_ready" || candidate.state === "preflight_required";
}

function registeredStateLabel(model: ModelManagementRegisteredModel): string {
  if (!model.selectable) return "已隐藏";
  if (!model.routable) return "不可路由";
  return model.state === "active" || model.state === "selectable" ? "可选择" : model.state;
}

function healthLabel(health: ModelManagementRegisteredModel["health"]): string {
  const status = modelHealthStatus(health);
  const labels: Record<string, string> = {
    healthy: "健康",
    unhealthy: "异常",
    unknown: "待探测",
  };
  return status ? (labels[status] ?? status) : "未知";
}

function modelHealthStatus(health: ModelManagementRegisteredModel["health"]): string | undefined {
  return typeof health === "string" ? health : health?.status;
}

function registeredModelIsUnhealthy(model: ModelManagementRegisteredModel): boolean {
  return modelHealthStatus(model.health) === "unhealthy";
}

function registeredModelIsSelectable(model: ModelManagementRegisteredModel): boolean {
  return model.selectable && model.routable && !registeredModelIsUnhealthy(model);
}

function safeOperationError(operation: ModelAdmissionOperation): string {
  if (operation.compensation?.manual_cleanup_required) {
    const codes = operation.compensation.errors.filter(Boolean).join("、");
    return codes
      ? `模型上线失败且需要人工清理，请联系运维处理（错误码：${codes}）`
      : "模型上线失败且需要人工清理，请联系运维处理";
  }
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
  const [pendingTerminalSyncCount, setPendingTerminalSyncCount] = useState(0);
  const [action, setAction] = useState<ManagementAction | null>(null);
  const [reason, setReason] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(ALL_PROVIDERS_VALUE);
  const [searchQuery, setSearchQuery] = useState("");
  const [localOperations, setLocalOperations] = useState<ModelAdmissionOperation[]>([]);
  const ownedOperationIdsRef = useRef<Set<string> | null>(null);
  if (ownedOperationIdsRef.current === null) {
    ownedOperationIdsRef.current = readOwnedOperationIds();
  }
  const handledOperationIdsRef = useRef(new Set<string>());
  const terminalSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const snapshotRequestIdRef = useRef(0);
  const activeSnapshotRequestRef = useRef<{
    id: number;
    promise: Promise<ModelManagementSnapshot | null>;
  } | null>(null);

  const denyAccess = useCallback(() => {
    setAccessDenied(true);
    setSnapshot(null);
    setError(null);
    setNotice(null);
  }, []);

  const loadSnapshot = useCallback((
    showLoading = false,
    supersedeActiveRequest = false,
    clearVisibleError = true,
  ): Promise<ModelManagementSnapshot | null> => {
    if (!supersedeActiveRequest && activeSnapshotRequestRef.current) {
      return activeSnapshotRequestRef.current.promise;
    }

    const requestId = snapshotRequestIdRef.current + 1;
    snapshotRequestIdRef.current = requestId;
    if (showLoading) setLoading(true);
    if (clearVisibleError) setError(null);
    const request = (async (): Promise<ModelManagementSnapshot | null> => {
      try {
        const nextSnapshot = await fetchModelManagementSnapshotAPI();
        if (requestId !== snapshotRequestIdRef.current) return null;
        setSnapshot(nextSnapshot);
        setAccessDenied(false);
        return nextSnapshot;
      } catch (caught: unknown) {
        if (requestId !== snapshotRequestIdRef.current) return null;
        if (isAdminAccessError(caught)) {
          denyAccess();
          return null;
        }
        if (clearVisibleError) {
          setError(errorMessage(caught, "模型管理数据加载失败"));
        }
        return null;
      } finally {
        if (activeSnapshotRequestRef.current?.id === requestId) {
          activeSnapshotRequestRef.current = null;
        }
        if (requestId === snapshotRequestIdRef.current) {
          setLoading(false);
        }
      }
    })();
    activeSnapshotRequestRef.current = { id: requestId, promise: request };
    return request;
  }, [denyAccess]);

  useEffect(() => {
    void loadSnapshot(true);
  }, [loadSnapshot]);

  const providerCategories = useMemo<ProviderCategory[]>(() => {
    const categories = new Map<string, ProviderCategory>();
    const ensureCategory = (id: string, label: string): ProviderCategory => {
      const current = categories.get(id);
      if (current) {
        if (current.label === id && label !== id) current.label = label;
        return current;
      }
      const next = { id, label, registeredCount: 0, candidateCount: 0 };
      categories.set(id, next);
      return next;
    };

    snapshot?.models.forEach((model) => {
      const id = providerId(model.provider);
      ensureCategory(id, providerLabel(model.provider_display, model.provider)).registeredCount += 1;
    });
    snapshot?.candidates.forEach((candidate) => {
      const id = providerId(candidate.provider_key);
      ensureCategory(
        id,
        providerLabel(candidate.provider_display, candidate.provider_key),
      ).candidateCount += 1;
    });
    return [...categories.values()].sort((left, right) => (
      left.label.localeCompare(right.label, "zh-CN") || left.id.localeCompare(right.id)
    ));
  }, [snapshot]);

  useEffect(() => {
    if (
      selectedProvider !== ALL_PROVIDERS_VALUE
      && !providerCategories.some((category) => category.id === selectedProvider)
    ) {
      setSelectedProvider(ALL_PROVIDERS_VALUE);
    }
  }, [providerCategories, selectedProvider]);

  const selectedProviderCategory = providerCategories.find((category) => category.id === selectedProvider);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const visibleModels = useMemo(() => (
    (snapshot?.models ?? []).filter((model) => (
      (selectedProvider === ALL_PROVIDERS_VALUE || providerId(model.provider) === selectedProvider)
      && matchesModelSearch(searchQuery, [
        model.name,
        model.model_id,
        model.provider,
        model.provider_display,
      ])
    ))
  ), [searchQuery, selectedProvider, snapshot?.models]);
  const visibleCandidates = useMemo(() => (
    (snapshot?.candidates ?? []).filter((candidate) => (
      (selectedProvider === ALL_PROVIDERS_VALUE || providerId(candidate.provider_key) === selectedProvider)
      && matchesModelSearch(searchQuery, [
        candidate.model_id,
        candidate.provider_key,
        candidate.provider_display,
      ])
    ))
  ), [searchQuery, selectedProvider, snapshot?.candidates]);

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
    let cancelled = false;
    let timer: number | null = null;
    const scheduleNextPoll = () => {
      timer = window.setTimeout(() => {
        void loadSnapshot(false, false, false).finally(() => {
          if (!cancelled) scheduleNextPoll();
        });
      }, OPERATION_POLL_INTERVAL_MS);
    };
    scheduleNextPoll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [accessDenied, hasActiveOperation, loadSnapshot]);

  const syncGlobalModelCatalog = useCallback(async () => {
    const catalog = await refreshModels();
    dispatch(updateProviders(catalog.providers));
    dispatch(updateModels(catalog.models));
  }, [dispatch]);

  useEffect(() => {
    const terminalOperations = operations.filter((operation) => (
      (operation.status === "failed" || operation.status === "succeeded")
      && ownedOperationIdsRef.current?.has(operation.operation_id)
      && !handledOperationIdsRef.current.has(operation.operation_id)
    ));
    if (terminalOperations.length === 0) return;

    terminalOperations.forEach((operation) => {
      handledOperationIdsRef.current.add(operation.operation_id);
    });

    const failedOperations = terminalOperations.filter((operation) => operation.status === "failed");
    const succeededOperations = terminalOperations.filter((operation) => operation.status === "succeeded");
    if (failedOperations.length > 0) {
      failedOperations.forEach((operation) => {
        ownedOperationIdsRef.current?.delete(operation.operation_id);
      });
      persistOwnedOperationIds(ownedOperationIdsRef.current ?? new Set());
      setError(failedOperations.map(safeOperationError).join("；"));
      setNotice(null);
    }
    if (succeededOperations.length === 0) return;
    const terminalOperation = succeededOperations[succeededOperations.length - 1];

    setPendingTerminalSyncCount((current) => current + 1);
    terminalSyncQueueRef.current = terminalSyncQueueRef.current
      .then(() => syncGlobalModelCatalog())
      .then(() => {
        succeededOperations.forEach((operation) => {
          ownedOperationIdsRef.current?.delete(operation.operation_id);
        });
        persistOwnedOperationIds(ownedOperationIdsRef.current ?? new Set());
        return loadSnapshot(false, true);
      })
      .then((nextSnapshot) => {
        if (!nextSnapshot) {
          throw new Error("管理快照刷新失败");
        }
        setNotice(`${terminalOperation.model_id} 已上线，模型选择器已同步刷新`);
        if (failedOperations.length === 0) setError(null);
      })
      .catch((caught: unknown) => {
        succeededOperations.forEach((operation) => {
          handledOperationIdsRef.current.delete(operation.operation_id);
        });
        if (isAdminAccessError(caught)) {
          denyAccess();
          return;
        }
        setError(`模型已上线，但目录刷新失败：${errorMessage(caught, "请稍后手动刷新")}`);
      })
      .finally(() => {
        setPendingTerminalSyncCount((current) => Math.max(0, current - 1));
      });
  }, [denyAccess, loadSnapshot, operations, syncGlobalModelCatalog]);

  const managementBusy = Boolean(pendingAction) || pendingTerminalSyncCount > 0;

  const stats = useMemo(() => ({
    registered: snapshot?.models.length ?? 0,
    selectable: snapshot?.models.filter(registeredModelIsSelectable).length ?? 0,
    candidates: snapshot?.candidates.length ?? 0,
  }), [snapshot]);

  const closeActionDialog = useCallback(() => {
    if (managementBusy) return;
    setAction(null);
    setReason("");
  }, [managementBusy]);

  const refreshAfterVisibility = useCallback(async () => {
    const snapshotPromise = loadSnapshot(false, true);
    const catalog = await refreshModels();
    dispatch(updateProviders(catalog.providers));
    dispatch(updateModels(catalog.models));
    const nextSnapshot = await snapshotPromise;
    if (!nextSnapshot) {
      throw new Error("管理快照刷新失败");
    }
  }, [dispatch, loadSnapshot]);

  const refreshManagementData = useCallback(async () => {
    if (managementBusy) return;
    setPendingAction("refresh");
    setError(null);
    setNotice(null);
    try {
      await refreshAfterVisibility();
      setNotice("模型管理数据和模型选择器已刷新");
    } catch (caught: unknown) {
      if (isAdminAccessError(caught)) {
        denyAccess();
        return;
      }
      setError(`刷新失败：${errorMessage(caught, "请稍后重试")}`);
    } finally {
      setPendingAction(null);
    }
  }, [denyAccess, managementBusy, refreshAfterVisibility]);

  const submitAction = useCallback(async () => {
    if (!action || !reason.trim() || managementBusy) return;
    const normalizedReason = reason.trim();
    const actionKey = action.kind === "visibility"
      ? `visibility:${action.model.model_id}`
      : `admission:${action.fingerprint}`;
    setPendingAction(actionKey);
    setError(null);
    setNotice(null);
    let visibilityUpdated = false;
    let admissionSubmitted = false;

    try {
      if (action.kind === "visibility") {
        await updateModelVisibilityAPI(action.model.model_id, {
          selectable: action.nextSelectable,
          reason: normalizedReason,
          expected_revision: action.model.revision,
        });
        visibilityUpdated = true;
        await refreshAfterVisibility();
        setNotice(action.nextSelectable
          ? registeredModelIsUnhealthy(action.model)
            ? `${action.model.name} 已恢复显示，健康恢复后才可用于新对话`
            : `${action.model.name} 已恢复到新对话模型选择器`
          : `${action.model.name} 已从新选择中隐藏，已有对话仍可用`);
      } else {
        const operation = await admitModelCandidateAPI(action.fingerprint, {
          model_id: action.candidate.model_id,
          expected_run_id: action.runId,
          reason: normalizedReason,
        });
        ownedOperationIdsRef.current?.add(operation.operation_id);
        persistOwnedOperationIds(ownedOperationIdsRef.current ?? new Set());
        setLocalOperations((current) => [
          ...current.filter((item) => item.operation_id !== operation.operation_id),
          operation,
        ]);
        admissionSubmitted = true;
        setNotice(action.candidate.state === "preflight_required"
          ? `${action.candidate.model_id} 验证与上线任务已排队，全部通过前不会加入模型选择器`
          : `${action.candidate.model_id} 上线任务已排队，完成前不会加入模型选择器`);
        setAction(null);
        setReason("");
        const nextSnapshot = await loadSnapshot(false, true);
        if (!nextSnapshot) {
          setError("上线任务已创建并在后台运行，但管理快照刷新失败，请手动刷新");
        }
      }
      setAction(null);
      setReason("");
    } catch (caught: unknown) {
      if (isAdminAccessError(caught)) {
        denyAccess();
        return;
      }
      if (action.kind === "visibility" && visibilityUpdated) {
        setAction(null);
        setReason("");
        setNotice(`${action.model.name} 的可见性已更新，请手动刷新确认最新状态`);
        setError(`可见性已更新，但后续页面或模型目录刷新未完成：${errorMessage(caught, "请手动刷新")}`);
      } else if (action.kind === "admission" && admissionSubmitted) {
        setAction(null);
        setReason("");
        setError("上线任务已创建并在后台运行，但管理快照刷新失败，请手动刷新");
      } else {
        setError(errorMessage(caught, action.kind === "visibility" ? "模型可见性更新失败" : "模型上线任务提交失败"));
      }
    } finally {
      setPendingAction(null);
    }
  }, [action, denyAccess, loadSnapshot, managementBusy, reason, refreshAfterVisibility]);

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
    ? (action.nextSelectable
        ? registeredModelIsUnhealthy(action.model)
          ? `确认恢复显示 ${action.model.name}`
          : `确认恢复 ${action.model.name}`
        : `确认隐藏 ${action.model.name}`)
    : action?.kind === "admission"
      ? `确认${candidateAdmissionActionLabel(action.candidate)} ${action.candidate.model_id}`
      : "确认模型管理操作";
  const confirmLabel = action?.kind === "visibility"
    ? (action.nextSelectable ? "确认恢复" : "确认隐藏")
    : action?.kind === "admission"
      ? `确认${candidateAdmissionActionLabel(action.candidate)}`
      : "确认上线";
  const governance = governanceState(snapshot.governance);

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
              disabled={managementBusy}
              onClick={() => void refreshManagementData()}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-3">
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
          </div>
          <div className="grid gap-3 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end">
            <div className="space-y-2">
              <label htmlFor="model-management-search" className="text-sm font-medium">搜索模型</label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="model-management-search"
                  type="text"
                  role="searchbox"
                  aria-label="搜索模型"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索模型名称、ID 或提供商"
                  className="pl-9 pr-9"
                />
                {hasSearchQuery && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="清除模型搜索"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">提供商分类</p>
                <span className="text-xs text-muted-foreground">{providerCategories.length} 个</span>
              </div>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger aria-label="按提供商筛选模型" className="w-full">
                  {selectedProviderCategory ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <ProviderIcon providerId={selectedProviderCategory.id} size={18} />
                      <span className="truncate">{selectedProviderCategory.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {selectedProviderCategory.registeredCount + selectedProviderCategory.candidateCount}
                      </span>
                    </span>
                  ) : (
                    <span>全部提供商（{stats.registered + stats.candidates}）</span>
                  )}
                </SelectTrigger>
                <SelectContent className="w-[max(304px,var(--radix-select-trigger-width))] max-w-[calc(100vw-2rem)]">
                  <SelectItem value={ALL_PROVIDERS_VALUE} textValue="全部提供商" className="min-h-10 py-2">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">全</span>
                      <span className="min-w-0 flex-1">全部提供商</span>
                      <span className="text-xs text-muted-foreground">
                        {stats.registered} 已注册 · {stats.candidates} 候选
                      </span>
                    </span>
                  </SelectItem>
                  {providerCategories.map((category) => (
                    <SelectItem
                      key={category.id}
                      value={category.id}
                      textValue={category.label}
                      className="min-h-10 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <ProviderIcon providerId={category.id} size={20} />
                        <span className="min-w-0 flex-1 truncate" title={category.label}>{category.label}</span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {category.registeredCount} 已注册 · {category.candidateCount} 候选
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {governance === "degraded" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300" role="alert">
          <p className="font-medium">最新治理扫描部分失败</p>
          <p className="mt-1">
            {snapshot.governance.message || "当前展示最近一次成功的治理候选快照；模型准入已暂停。"}
          </p>
        </div>
      )}

      {governance === "unavailable" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300" role="alert">
          <p className="font-medium">治理候选当前不可用</p>
          <p className="mt-1">{unavailableGovernanceMessage(snapshot.governance.message)}</p>
        </div>
      )}

      {governance === "available" && !snapshot.capabilities.admission_enabled && (
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
          <CardTitle className="flex items-center gap-2 text-base">
            已注册模型
            <Badge variant="outline" data-testid="visible-registered-model-count">
              {visibleModels.length} / {snapshot.models.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {snapshot.models.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无已注册模型</p>
          )}
          {snapshot.models.length > 0 && visibleModels.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {hasSearchQuery
                ? (selectedProvider === ALL_PROVIDERS_VALUE
                    ? "没有匹配的已注册模型"
                    : "当前提供商没有匹配的已注册模型")
                : "当前提供商没有已注册模型"}
            </p>
          )}
          {visibleModels.map((model) => (
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
                      {model.routable
                        ? registeredModelIsUnhealthy(model)
                          ? "当前健康异常；可恢复显示，健康恢复后才可用于新对话。"
                          : "仅从新选择中隐藏，已有对话仍可用。"
                        : "当前模型不可路由，无法恢复到新对话选择器。"}
                    </p>
                  )}
                  {model.reason && <p className="mt-1 text-xs text-muted-foreground">最近原因：{model.reason}</p>}
                </div>
                <Button
                  size="sm"
                  variant={model.selectable ? "outline" : "default"}
                  disabled={managementBusy || (!model.selectable && !model.routable)}
                  aria-label={`${model.selectable ? "隐藏" : model.routable ? registeredModelIsUnhealthy(model) ? "恢复显示" : "恢复" : "不可恢复"} ${model.name}`}
                  onClick={() => {
                    if (!model.selectable && !model.routable) return;
                    setAction({ kind: "visibility", model, nextSelectable: !model.selectable });
                    setReason("");
                  }}
                >
                  {model.selectable ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {model.selectable ? "隐藏" : model.routable ? registeredModelIsUnhealthy(model) ? "恢复显示" : "恢复" : "不可恢复"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            治理候选
            <Badge variant="outline" data-testid="visible-candidate-count">
              {visibleCandidates.length} / {snapshot.candidates.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {snapshot.candidates.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">当前没有治理候选</p>
          )}
          {snapshot.candidates.length > 0 && visibleCandidates.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {hasSearchQuery
                ? (selectedProvider === ALL_PROVIDERS_VALUE
                    ? "没有匹配的治理候选"
                    : "当前提供商没有匹配的治理候选")
                : "当前提供商没有治理候选"}
            </p>
          )}
          {visibleCandidates.map((candidate) => {
            const fingerprint = candidateFingerprint(candidate);
            const admissionActionLabel = candidateAdmissionActionLabel(candidate);
            const operation = fingerprint ? operationByFingerprint.get(fingerprint) : undefined;
            const operationActive = operation?.status === "pending" || operation?.status === "running";
            const manualCleanupRequired = operation?.compensation?.manual_cleanup_required === true;
            const canAdmit = Boolean(
              snapshot.capabilities.admission_enabled
              && governance === "available"
              && snapshot.governance.run_id
              && candidateCanRequestAdmission(candidate)
              && fingerprint
              && !operationActive
              && !manualCleanupRequired
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      提供商：{providerLabel(candidate.provider_display, candidate.provider_key)}
                    </p>
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
                      disabled={managementBusy}
                      aria-label={`${admissionActionLabel} ${candidate.model_id}`}
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
                      {admissionActionLabel}
                    </Button>
                  )}
                  {governance === "degraded"
                    && candidateCanRequestAdmission(candidate)
                    && fingerprint
                    && !manualCleanupRequired
                    && (!operation || operation.status === "failed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      title={snapshot.governance.message || "最新治理扫描部分失败，模型准入已暂停"}
                      aria-label={`${admissionActionLabel}已暂停 ${candidate.model_id}`}
                    >
                      <Rocket className="h-4 w-4" />
                      {admissionActionLabel}已暂停
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
                : action?.kind === "visibility" && registeredModelIsUnhealthy(action.model)
                  ? "仅恢复模型选择器中的可见性；当前健康异常，健康恢复后才可用于新对话。请填写原因后确认。"
                  : action?.kind === "visibility"
                  ? "恢复后，新对话可以再次选择这个模型。请填写原因后确认。"
                  : action?.kind === "admission" && action.candidate.state === "preflight_required"
                    ? "将先执行真实兼容性预检，可能产生少量模型调用费用；只有全部通过后才会上线并进入模型选择器。请填写原因后确认。"
                    : "上线会创建后台操作；只有任务成功后模型才会进入选择器。请填写原因后确认。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="model-management-reason" className="text-sm font-medium">操作原因</label>
            <Input
              id="model-management-reason"
              value={reason}
              maxLength={300}
              disabled={managementBusy}
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
            <Button variant="outline" disabled={managementBusy} onClick={closeActionDialog}>取消</Button>
            <Button
              variant={action?.kind === "visibility" && !action.nextSelectable ? "destructive" : "default"}
              disabled={!reason.trim() || managementBusy}
              onClick={() => void submitAction()}
            >
              {managementBusy ? "处理中" : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
