"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, Loader2, MailCheck } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchEmailUsageAPI, type EmailUsageOverview } from "@/lib/api/emailUsage";
import { useServiceUsageRefreshHandler } from "./serviceUsageRefresh";

const EMAIL_USAGE_CACHE_TTL_MS = 60_000;

let cachedEmailUsage: { scope: string; data: EmailUsageOverview; cachedAt: number } | null = null;

function hashCachePart(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function currentCacheScope(): string {
  if (typeof window === "undefined") return "server";
  try {
    const rawProfile = window.localStorage.getItem("user_profile");
    if (rawProfile) {
      const profile = JSON.parse(rawProfile);
      if (typeof profile?.id === "string" && profile.id.trim()) {
        return `user:${profile.id}`;
      }
    }
    const token = window.localStorage.getItem("auth_token");
    if (token) return `token:${hashCachePart(token)}`;
  } catch {
    return "unavailable";
  }
  return "anonymous";
}

function getCachedEmailUsage(scope: string): EmailUsageOverview | null {
  if (!cachedEmailUsage || cachedEmailUsage.scope !== scope) return null;
  if (Date.now() - cachedEmailUsage.cachedAt >= EMAIL_USAGE_CACHE_TTL_MS) return null;
  return cachedEmailUsage.data;
}

function setCachedEmailUsage(scope: string, data: EmailUsageOverview) {
  cachedEmailUsage = { scope, data, cachedAt: Date.now() };
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "--";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function formatShanghaiDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "--";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function StatusCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="h-full border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  );
}

export default function EmailUsageMonitor() {
  const initialScope = currentCacheScope();
  const initialData = getCachedEmailUsage(initialScope);
  const [data, setData] = useState<EmailUsageOverview | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    const scope = currentCacheScope();
    const cachedData = forceRefresh ? null : getCachedEmailUsage(scope);
    if (cachedData) {
      setData(cachedData);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchEmailUsageAPI();
      setCachedEmailUsage(scope, nextData);
      setData(nextData);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "邮件用量查询失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const forceRefresh = useCallback(() => load(true), [load]);
  useServiceUsageRefreshHandler("email", forceRefresh);

  const usagePercent = useMemo(() => {
    if (data?.usage_ratio !== null && data?.usage_ratio !== undefined) {
      return Math.max(0, Math.min(100, data.usage_ratio * 100));
    }
    if (data?.used_emails !== null && data?.used_emails !== undefined && data.monthly_quota) {
      return Math.max(0, Math.min(100, (data.used_emails / data.monthly_quota) * 100));
    }
    return null;
  }, [data]);

  if (loading) {
    return (
      <Card className="h-full border-border shadow-sm">
        <CardContent className="flex min-h-32 flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载 Resend 用量
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full border-border shadow-sm">
        <CardContent className="flex items-center gap-2 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.configured) {
    return (
      <StatusCard
        title="Resend API 用量采集尚未配置"
        description="auth-service 尚未启用 Resend Email API 用量采集；现有 SMTP 发送不受影响。"
      />
    );
  }

  if (!data.available) {
    return (
      <StatusCard
        title="Resend 用量尚未同步"
        description="Resend Email API 已配置，等待首次成功投递后同步官方用量快照。"
      />
    );
  }

  const hasDailyUsage = data.daily_used_emails !== null && data.daily_used_emails !== undefined;

  return (
    <Card
      data-testid="email-usage-card"
      className="h-full gap-0 overflow-hidden border-border py-0 shadow-sm"
    >
      <CardHeader className="px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <MailCheck className="h-4 w-4 text-primary" />
          </span>
          Resend 邮件用量
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 px-5 pb-5">
        <div>
          <p className="text-xs text-muted-foreground">本月已用 / 月度额度</p>
          <p data-testid="email-monthly-usage" className="mt-1 text-3xl font-semibold tracking-tight">
            {formatNumber(data.used_emails)} / {formatNumber(data.monthly_quota)}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">封</span>
          </p>

          {usagePercent !== null && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>额度进度</span>
                <span>已使用 {usagePercent.toFixed(1)}%</span>
              </div>
              <Progress aria-label="Resend 月度用量" value={usagePercent} />
            </div>
          )}
        </div>

        <div className={`grid gap-2 ${hasDailyUsage ? "grid-cols-2" : "grid-cols-1"}`}>
          <div data-testid="email-remaining-usage" className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">剩余 </span>
            <span className="font-medium">{formatNumber(data.remaining_emails)} 封</span>
          </div>
          {hasDailyUsage && (
            <div data-testid="email-daily-usage" className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">今日 </span>
              <span className="font-medium">
                {formatNumber(data.daily_used_emails)}
                {data.daily_quota !== null && data.daily_quota !== undefined
                  ? ` / ${formatNumber(data.daily_quota)}`
                  : ""} 封
              </span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="mt-auto flex-wrap gap-x-4 gap-y-1.5 border-t bg-muted/10 px-5 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          账期 {formatDate(data.period_start)} - {formatDate(data.period_end)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          最后同步 {formatShanghaiDateTime(data.synced_at)}
        </span>
      </CardFooter>
    </Card>
  );
}
