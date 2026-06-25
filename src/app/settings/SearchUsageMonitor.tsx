"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, CalendarDays, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchSearchUsageAPI, type ProviderRecordedUsageDaily, type SearchUsageOverview } from "@/lib/api/searchUsage";

const SEARCH_USAGE_CACHE_TTL_MS = 60_000;

let cachedSearchUsage: { scope: string; data: SearchUsageOverview } | null = null;
let cachedSearchUsageAt = 0;

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

function getCachedSearchUsage(scope: string): SearchUsageOverview | null {
  if (!cachedSearchUsage) return null;
  if (cachedSearchUsage.scope !== scope) return null;
  if (Date.now() - cachedSearchUsageAt > SEARCH_USAGE_CACHE_TTL_MS) return null;
  return cachedSearchUsage.data;
}

function setCachedSearchUsage(scope: string, data: SearchUsageOverview) {
  cachedSearchUsage = { scope, data };
  cachedSearchUsageAt = Date.now();
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

function formatMonth(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}`;
}

function timestamp(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function recentDailyUsage(daily: ProviderRecordedUsageDaily[] | undefined): ProviderRecordedUsageDaily[] {
  return [...(daily ?? [])].sort((a, b) => timestamp(b.date) - timestamp(a.date)).slice(0, 5);
}

export default function SearchUsageMonitor() {
  const initialScope = currentCacheScope();
  const initialData = getCachedSearchUsage(initialScope);
  const [data, setData] = useState<SearchUsageOverview | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    const scope = currentCacheScope();
    const cachedData = forceRefresh ? null : getCachedSearchUsage(scope);
    if (cachedData) {
      setData(cachedData);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchSearchUsageAPI();
      setCachedSearchUsage(scope, nextData);
      setData(nextData);
    } catch (err: any) {
      setError(err?.message || "联网用量查询失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const firecrawl = data?.firecrawl;
  const recordedUsage = firecrawl?.recorded_usage;
  const recordedUsageAvailable = Boolean(recordedUsage && recordedUsage.available !== false);
  const usagePercent = useMemo(() => {
    if (firecrawl?.usage_ratio === null || firecrawl?.usage_ratio === undefined) return null;
    return Math.max(0, Math.min(100, firecrawl.usage_ratio * 100));
  }, [firecrawl?.usage_ratio]);
  const historicalPeriods = useMemo(() => {
    if (!data?.historical?.available) return [];
    return [...(data.historical.periods ?? [])]
      .sort((a, b) => timestamp(b.start_date) - timestamp(a.start_date))
      .slice(0, 6);
  }, [data?.historical]);
  const dailyUsage = useMemo(() => recentDailyUsage(recordedUsage?.daily), [recordedUsage?.daily]);

  if (loading) {
    return (
      <Card className="border-muted shadow-sm">
        <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载联网用量
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-muted shadow-sm">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load(true)}>
            <RefreshCw className="mr-1 h-4 w-4" />
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!firecrawl?.available) {
    return (
      <Card className="border-muted shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WalletCards className="h-5 w-5 text-muted-foreground" />
            Firecrawl 用量暂不可用
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          当前 search-service 没有配置 Firecrawl API Key，暂时无法读取官方余额。
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
              <WalletCards className="h-5 w-5 text-primary" />
              Firecrawl 用量
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">官方余额 + 系统记录</Badge>
              <Button
                aria-label="刷新联网用量"
                size="sm"
                variant="outline"
                onClick={() => void load(true)}
                disabled={loading}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">剩余 credits</p>
              <p className="mt-1 text-2xl font-semibold">{formatNumber(firecrawl.remaining_credits)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">账期额度</p>
              <p className="mt-1 text-2xl font-semibold">{formatNumber(firecrawl.plan_credits)}</p>
            </div>
          </div>

          {usagePercent !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">官方额度参考</span>
                <span className="font-medium">官方已用 {usagePercent.toFixed(1)}%</span>
              </div>
              <Progress value={usagePercent} />
            </div>
          )}

          <div className="rounded-md border bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground">本系统记录消耗</p>
            <p className="mt-1 text-2xl font-semibold">
              {recordedUsageAvailable ? formatNumber(recordedUsage?.credits_used) : "--"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {recordedUsageAvailable
                ? `${formatNumber(recordedUsage?.request_count)} 次 Firecrawl 请求`
                : "记录暂不可用"}
            </p>
            {dailyUsage.length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                {dailyUsage.map((day) => (
                  <li key={day.date} className="flex items-center justify-between gap-3">
                    <span>{formatDate(day.date)}</span>
                    <span>
                      {formatNumber(day.credits_used)} credits / {formatNumber(day.request_count)} 次
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {formatDate(firecrawl.billing_period_start)} - {formatDate(firecrawl.billing_period_end)}
            </span>
          </div>

          <div className="rounded-md border p-3" data-testid="search-usage-history">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              官方历史消耗
            </div>
            {historicalPeriods.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {historicalPeriods.map((period) => (
                  <li key={`${period.start_date}-${period.end_date}`} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{formatMonth(period.start_date)}</span>
                    <span className="font-medium">{formatNumber(period.total_credits)} credits</span>
                  </li>
                ))}
              </ul>
            ) : data?.historical?.available === false ? (
              <p className="text-sm text-muted-foreground">官方历史暂不可用</p>
            ) : (
              <p className="text-sm text-muted-foreground">官方历史暂无数据</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted shadow-sm">
        <CardContent className="pt-4 text-sm text-muted-foreground">
          当前展示 Firecrawl 官方余额和本系统 Firecrawl 调用记录。
        </CardContent>
      </Card>
    </div>
  );
}
