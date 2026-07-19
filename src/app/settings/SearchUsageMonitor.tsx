"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, CalendarDays, ChevronDown, List, Loader2, WalletCards } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchSearchUsageAPI, type ProviderRecordedUsageDaily, type SearchUsageOverview } from "@/lib/api/searchUsage";
import { useServiceUsageRefreshHandler } from "./serviceUsageRefresh";

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

  const forceRefresh = useCallback(() => load(true), [load]);
  useServiceUsageRefreshHandler("search", forceRefresh);

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
      <Card className="h-full border-border shadow-sm">
        <CardContent className="flex min-h-32 flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载联网用量
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

  if (!firecrawl?.available) {
    return (
      <Card className="h-full border-border shadow-sm">
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
    <Card
      data-testid="search-usage-card"
      className="h-full gap-0 overflow-hidden border-border py-0 shadow-sm"
    >
      <CardHeader className="px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <WalletCards className="h-4 w-4 text-primary" />
          </span>
          Firecrawl 用量
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 px-5 pb-5">
        <div>
          <p className="text-xs text-muted-foreground">剩余额度</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-3xl font-semibold tracking-tight">
              {formatNumber(firecrawl.remaining_credits)}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">credits</span>
            </p>
            <p className="text-xs text-muted-foreground">
              套餐额度 {formatNumber(firecrawl.plan_credits)}
            </p>
          </div>
          {usagePercent !== null && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>额度进度</span>
                <span>已使用 {usagePercent.toFixed(1)}%</span>
              </div>
              <Progress aria-label="Firecrawl 额度用量" value={usagePercent} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">系统累计</span>
          <span className="text-right font-medium">
            {recordedUsageAvailable
              ? `${formatNumber(recordedUsage?.credits_used)} credits · ${formatNumber(recordedUsage?.request_count)} 次请求`
              : "记录暂不可用"}
          </span>
        </div>

        <details
          data-testid="search-usage-details"
          className="group rounded-lg border bg-muted/5"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <span>查看详细记录</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t px-3 py-3">
            <section aria-labelledby="search-daily-usage-heading">
              <h3
                id="search-daily-usage-heading"
                className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"
              >
                <List className="h-3.5 w-3.5" />
                每日明细
              </h3>
              {dailyUsage.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {dailyUsage.map((day) => (
                    <li key={day.date} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{formatDate(day.date)}</span>
                      <span className="font-medium">
                        {formatNumber(day.credits_used)} credits / {formatNumber(day.request_count)} 次
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">暂无每日记录</p>
              )}
            </section>

            <section aria-labelledby="search-history-usage-heading" data-testid="search-usage-history">
              <h3
                id="search-history-usage-heading"
                className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                官方历史消耗
              </h3>
              {historicalPeriods.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {historicalPeriods.map((period) => (
                    <li key={`${period.start_date}-${period.end_date}`} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{formatMonth(period.start_date)}</span>
                      <span className="font-medium">{formatNumber(period.total_credits)} credits</span>
                    </li>
                  ))}
                </ul>
              ) : data?.historical?.available === false ? (
                <p className="text-xs text-muted-foreground">官方历史暂不可用</p>
              ) : (
                <p className="text-xs text-muted-foreground">官方历史暂无数据</p>
              )}
            </section>
          </div>
        </details>
      </CardContent>

      <CardFooter className="mt-auto gap-2 border-t bg-muted/10 px-5 py-3 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        账期 {formatDate(firecrawl.billing_period_start)} - {formatDate(firecrawl.billing_period_end)}
      </CardFooter>
    </Card>
  );
}
