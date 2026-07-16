"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  ServerCog,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createMcpServerAPI,
  fetchMcpServersAPI,
  refreshMcpServerToolsAPI,
  setMcpServerEnabledAPI,
  testMcpServerConnectionAPI,
  updateMcpServerAPI,
} from "@/lib/api/mcpServers";
import type {
  McpAuthType,
  McpHealthStatus,
  McpServer,
  McpServerPayload,
} from "@/types/mcp";

interface ServerFormState {
  name: string;
  provider: string;
  endpointUrl: string;
  authType: McpAuthType;
  authName: string;
  credentialRef: string;
  allowedTools: string;
}

type FormErrors = Partial<Record<keyof ServerFormState, string>>;

const emptyForm: ServerFormState = {
  name: "",
  provider: "",
  endpointUrl: "",
  authType: "none",
  authName: "",
  credentialRef: "",
  allowedTools: "",
};

const healthPresentation: Record<
  McpHealthStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  healthy: {
    label: "连接健康",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  unhealthy: {
    label: "连接异常",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  disabled: {
    label: "服务停用",
    className: "border-muted-foreground/30 bg-muted text-muted-foreground",
    icon: CircleHelp,
  },
  unknown: {
    label: "连接未检测",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: CircleHelp,
  },
};

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatEndpoint(value: string): string {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length <= 2) {
      return `${url.origin}${url.pathname}`;
    }
    return `${url.origin}/${segments[0]}/…/${segments.slice(-2).join("/")}`;
  } catch {
    return "Endpoint 已隐藏";
  }
}

function formatCheckedAt(value: string | null): string {
  if (!value) return "尚未检测";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "检测时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function parseAllowedTools(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formFromServer(server: McpServer): ServerFormState {
  return {
    name: server.name,
    provider: server.provider,
    endpointUrl: server.endpoint_url,
    authType: server.auth_type,
    authName: server.auth_name ?? "",
    credentialRef: server.credential_ref ?? "",
    allowedTools: server.allowed_tools.join("\n"),
  };
}

function validateForm(form: ServerFormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "服务名称不能为空";
  if (!form.provider.trim()) errors.provider = "提供商不能为空";

  if (!form.endpointUrl.trim()) {
    errors.endpointUrl = "Endpoint URL 不能为空";
  } else {
    try {
      const endpoint = new URL(form.endpointUrl);
      if (endpoint.protocol !== "https:") {
        errors.endpointUrl = "MCP Endpoint 必须使用 HTTPS";
      }
    } catch {
      errors.endpointUrl = "请输入有效的 HTTPS URL";
    }
  }

  if (["header", "query"].includes(form.authType) && !form.authName.trim()) {
    errors.authName = "Header / Query 参数名不能为空";
  }

  if (form.authType !== "none") {
    if (!form.credentialRef.trim()) {
      errors.credentialRef = "凭证引用不能为空";
    } else if (!/^[A-Z_][A-Z0-9_]*$/.test(form.credentialRef.trim())) {
      errors.credentialRef = "凭证引用需使用环境变量名称，例如 AMAP_MCP_API_KEY";
    }
  }
  return errors;
}

function buildPayload(form: ServerFormState): McpServerPayload {
  return {
    name: form.name.trim(),
    provider: form.provider.trim(),
    endpoint_url: form.endpointUrl.trim(),
    transport: "streamable_http",
    auth_type: form.authType,
    auth_name: ["header", "query"].includes(form.authType) ? form.authName.trim() : null,
    credential_ref: form.authType === "none" ? null : form.credentialRef.trim(),
    allowed_tools: parseAllowedTools(form.allowedTools),
  };
}

function hasConnectionIdentityChanged(form: ServerFormState, server: McpServer): boolean {
  const authName = ["header", "query"].includes(form.authType) ? form.authName.trim() : null;
  const credentialRef = form.authType === "none" ? null : form.credentialRef.trim();
  return (
    form.provider.trim() !== server.provider ||
    form.endpointUrl.trim() !== server.endpoint_url ||
    form.authType !== server.auth_type ||
    authName !== (server.auth_name ?? null) ||
    credentialRef !== (server.credential_ref ?? null)
  );
}

export default function McpServerManager() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [form, setForm] = useState<ServerFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const loadRequestId = useRef(0);
  const actionInFlight = useRef(false);

  const load = useCallback(async (preserveExisting = false) => {
    const requestId = ++loadRequestId.current;
    if (preserveExisting) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    setActionError(null);
    try {
      const nextServers = await fetchMcpServersAPI();
      if (requestId === loadRequestId.current) {
        setServers(nextServers);
      }
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      const message = toErrorMessage(error, "MCP 服务加载失败");
      if (preserveExisting) {
        setActionError(message);
      } else {
        setLoadError(message);
      }
    } finally {
      if (requestId !== loadRequestId.current) return;
      if (preserveExisting) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const openCreate = () => {
    setEditingServer(null);
    setForm(emptyForm);
    setFormErrors({});
    setActionError(null);
    setEditorOpen(true);
  };

  const openEdit = (server: McpServer) => {
    setEditingServer(server);
    setForm(formFromServer(server));
    setFormErrors({});
    setActionError(null);
    setEditorOpen(true);
  };

  const changeForm = (field: keyof ServerFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  };

  const saveServer = async () => {
    if (actionInFlight.current) return;
    const nextErrors = validateForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    actionInFlight.current = true;
    setBusyAction(editingServer ? `save:${editingServer.id}` : "save:new");
    setActionError(null);
    try {
      const payload = buildPayload(form);
      if (editingServer && hasConnectionIdentityChanged(form, editingServer)) {
        payload.allowed_tools = [];
      }
      if (editingServer) {
        await updateMcpServerAPI(editingServer.id, payload);
      } else {
        await createMcpServerAPI(payload);
      }
      setEditorOpen(false);
      await load(true);
    } catch (error) {
      setActionError(toErrorMessage(error, "MCP 服务保存失败"));
    } finally {
      actionInFlight.current = false;
      setBusyAction(null);
    }
  };

  const runServerAction = async (
    action: string,
    request: () => Promise<McpServer>,
    fallback: string,
  ) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusyAction(action);
    setActionError(null);
    try {
      await request();
      await load(true);
    } catch (error) {
      setActionError(toErrorMessage(error, fallback));
    } finally {
      actionInFlight.current = false;
      setBusyAction(null);
    }
  };

  const hasServers = servers.length > 0;
  const connectionIdentityChanged = useMemo(
    () => Boolean(editingServer && hasConnectionIdentityChanged(form, editingServer)),
    [editingServer, form],
  );
  const selectableTools = useMemo(() => {
    if (!editingServer || connectionIdentityChanged) return [];
    const discoveredNames = editingServer.discovered_tools.map((tool) => tool.name);
    return Array.from(new Set([...discoveredNames, ...parseAllowedTools(form.allowedTools)]));
  }, [connectionIdentityChanged, editingServer, form.allowedTools]);
  const titleDetail = useMemo(
    () => hasServers ? `${servers.length} 个已配置服务` : "管理员专属配置",
    [hasServers, servers.length],
  );

  const toggleAllowedTool = (toolName: string, checked: boolean) => {
    const current = parseAllowedTools(form.allowedTools);
    const next = checked
      ? Array.from(new Set([...current, toolName]))
      : current.filter((item) => item !== toolName);
    changeForm("allowedTools", next.join("\n"));
  };

  return (
    <div className="space-y-4" data-testid="mcp-server-manager">
      <Card className="border-muted shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ServerCog className="h-5 w-5 text-primary" />
                MCP 服务
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{titleDetail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button aria-label="刷新列表" size="sm" variant="outline" onClick={() => void load(true)} disabled={loading || refreshing || busyAction !== null}>
                <RefreshCw className={`mr-1 h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button size="sm" onClick={openCreate} disabled={loading || refreshing || busyAction !== null}>
                <Plus className="mr-1 h-4 w-4" />
                新增 MCP 服务
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-[18rem] p-4">
          {actionError && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {loading ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载 MCP 服务
            </div>
          ) : loadError ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="font-medium">MCP 服务暂时无法加载</p>
                <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void load(false)}>
                <RefreshCw className="mr-1 h-4 w-4" />
                重试
              </Button>
            </div>
          ) : !hasServers ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-muted p-3">
                <ServerCog className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">还没有 MCP 服务</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  添加受控的远程 Streamable HTTP 服务，连接成功后再配置允许工具。
                </p>
              </div>
              <Button size="sm" onClick={openCreate}>添加第一个服务</Button>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {servers.map((server) => {
                const health = healthPresentation[server.health_status];
                const HealthIcon = health.icon;
                const isBusy = refreshing || busyAction !== null;
                return (
                  <article
                    key={server.id}
                    data-testid={`mcp-server-${server.id}`}
                    className="rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{server.name}</h3>
                          <Badge variant="outline">{server.provider}</Badge>
                          <Badge variant="outline" className={health.className}>
                            <HealthIcon className="mr-1 h-3 w-3" />
                            {health.label}
                          </Badge>
                          <Badge variant="outline">{server.is_enabled ? "已启用" : "已停用"}</Badge>
                        </div>
                        <p className="mt-2 break-all font-mono text-xs text-muted-foreground" title="Endpoint 已隐藏查询参数和部分路径">
                          {formatEndpoint(server.endpoint_url)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Streamable HTTP · {server.auth_type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          aria-label={`${server.is_enabled ? "停用" : "启用"}${server.name}`}
                          checked={server.is_enabled}
                          disabled={isBusy}
                          onCheckedChange={(checked) => void runServerAction(
                            `status:${server.id}`,
                            () => setMcpServerEnabledAPI(server.id, checked),
                            `${server.name} 状态更新失败`,
                          )}
                        />
                        <Button aria-label={`编辑${server.name}`} size="icon" variant="ghost" onClick={() => openEdit(server)} disabled={isBusy}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">发现工具</p>
                        <p className="mt-1 font-medium">{server.discovered_tools.length} 个已发现工具</p>
                      </div>
                      <div className="rounded-md border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">工具授权</p>
                        <p className="mt-1 font-medium">已授权 {server.allowed_tools.length} 个工具</p>
                      </div>
                      <div className="rounded-md border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">最近检测</p>
                        <p className="mt-1 text-sm font-medium">{formatCheckedAt(server.last_checked_at)}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-md border p-3">
                      <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5" />允许工具白名单
                      </p>
                      {server.allowed_tools.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {server.allowed_tools.map((tool) => <Badge key={tool} variant="secondary">{tool}</Badge>)}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">尚未设置白名单，不会向模型开放工具</p>
                      )}
                    </div>

                    {server.last_error_message && (
                      <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        <p>{server.last_error_message}</p>
                        {server.last_error_code && <p className="mt-1 font-mono text-xs opacity-80">{server.last_error_code}</p>}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        aria-label={`测试${server.name}连接`}
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void runServerAction(
                          `test:${server.id}`,
                          () => testMcpServerConnectionAPI(server.id),
                          `${server.name} 连接测试失败`,
                        )}
                      >
                        {busyAction === `test:${server.id}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCw className="mr-1 h-4 w-4" />}
                        测试连接
                      </Button>
                      <Button
                        aria-label={`刷新${server.name}工具`}
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void runServerAction(
                          `tools:${server.id}`,
                          () => refreshMcpServerToolsAPI(server.id),
                          `${server.name} 工具刷新失败`,
                        )}
                      >
                        {busyAction === `tools:${server.id}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wrench className="mr-1 h-4 w-4" />}
                        刷新工具
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingServer ? "编辑 MCP 服务" : "新增 MCP 服务"}</DialogTitle>
            <DialogDescription>
              配置受控的远程 MCP Endpoint 和工具白名单，不在此页面保存或执行明文凭证。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              只保存环境变量名称，不会接收或保存明文密钥。
            </div>
            {editingServer && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                修改 Endpoint、提供商或鉴权配置后，旧的工具发现结果和授权会失效；保存后需要重新测试并刷新工具。
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mcp-name">服务名称</Label>
                <Input id="mcp-name" value={form.name} onChange={(event) => changeForm("name", event.target.value)} aria-invalid={Boolean(formErrors.name)} />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-provider">提供商</Label>
                <Input id="mcp-provider" placeholder="例如 amap" value={form.provider} onChange={(event) => changeForm("provider", event.target.value)} aria-invalid={Boolean(formErrors.provider)} />
                {formErrors.provider && <p className="text-xs text-destructive">{formErrors.provider}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mcp-endpoint">Endpoint URL</Label>
              <Input id="mcp-endpoint" type="url" placeholder="https://example.com/mcp" value={form.endpointUrl} onChange={(event) => changeForm("endpointUrl", event.target.value)} aria-invalid={Boolean(formErrors.endpointUrl)} />
              {formErrors.endpointUrl && <p className="text-xs text-destructive">{formErrors.endpointUrl}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mcp-transport">传输方式</Label>
                <Input id="mcp-transport" value="Streamable HTTP" disabled />
                <p className="text-xs text-muted-foreground">MVP 阶段固定使用远程 Streamable HTTP。</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-auth-type">鉴权方式</Label>
                <select
                  id="mcp-auth-type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.authType}
                  onChange={(event) => changeForm("authType", event.target.value)}
                >
                  <option value="none">无鉴权</option>
                  <option value="bearer">Bearer</option>
                  <option value="header">自定义 Header</option>
                  <option value="query">Query 参数</option>
                </select>
              </div>
            </div>

            {["header", "query"].includes(form.authType) && (
              <div className="space-y-2">
                <Label htmlFor="mcp-auth-name">Header / Query 参数名</Label>
                <Input id="mcp-auth-name" placeholder={form.authType === "header" ? "例如 X-API-Key" : "例如 key"} value={form.authName} onChange={(event) => changeForm("authName", event.target.value)} aria-invalid={Boolean(formErrors.authName)} />
                {formErrors.authName && <p className="text-xs text-destructive">{formErrors.authName}</p>}
              </div>
            )}

            {form.authType !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="mcp-credential-ref">凭证引用</Label>
                <Input id="mcp-credential-ref" placeholder="例如 AMAP_MCP_API_KEY" value={form.credentialRef} onChange={(event) => changeForm("credentialRef", event.target.value)} aria-invalid={Boolean(formErrors.credentialRef)} autoComplete="off" />
                {formErrors.credentialRef && <p className="text-xs text-destructive">{formErrors.credentialRef}</p>}
                <p className="text-xs text-muted-foreground">部署环境需要预先配置对应变量。</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={selectableTools.length > 0 ? undefined : "mcp-allowed-tools"}>允许工具</Label>
              {selectableTools.length > 0 ? (
                <div className="space-y-2 rounded-md border p-3" role="group" aria-label="允许工具">
                  {selectableTools.map((toolName) => {
                    const tool = editingServer?.discovered_tools.find((item) => item.name === toolName);
                    const checked = parseAllowedTools(form.allowedTools).includes(toolName);
                    return (
                      <label key={toolName} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/60">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                          checked={checked}
                          onChange={(event) => toggleAllowedTool(toolName, event.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="block break-all font-mono text-sm">{toolName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {tool?.description || (tool ? "已由远端服务发现" : "当前未被远端服务发现")}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div id="mcp-allowed-tools" className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                  {connectionIdentityChanged
                    ? "连接配置已经变化。保存时会清空旧授权；请保存并重新发现工具后再授权。"
                    : editingServer
                    ? "当前尚未发现工具。请先保存配置并测试连接或刷新工具，再回来选择授权。"
                    : "新建服务默认不授权任何工具。保存后请先测试连接或刷新工具，再编辑选择授权。"}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                发现不等于授权；只有白名单中的工具可供后续业务适配层使用，空白名单表示未授权任何工具。
              </p>
            </div>

            {actionError && <p className="text-sm text-destructive" role="alert">{actionError}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={busyAction?.startsWith("save")}>取消</Button>
              <Button onClick={() => void saveServer()} disabled={busyAction?.startsWith("save")}>
                {busyAction?.startsWith("save") && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                保存服务
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
