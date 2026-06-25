"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, CalendarDays, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchSearchUsageAPI, type SearchUsageOverview } from "@/lib/api/searchUsage";

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

function latestCredits(data: SearchUsageOverview | null): number | null {
  const latest = data?.historical?.periods?.[0];
  return latest?.total_credits ?? null;
}

export default function SearchUsageMonitor() {
  const [data, setData] = useState<SearchUsageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSearchUsageAPI());
    } catch (err: any) {
      setError(err?.message || "联网用量查询失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const firecrawl = data?.firecrawl;
  const usagePercent = useMemo(() => {
    if (firecrawl?.usage_ratio === null || firecrawl?.usage_ratio === undefined) return null;
    return Math.max(0, Math.min(100, firecrawl.usage_ratio * 100));
  }, [firecrawl?.usage_ratio]);

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
          <Button size="sm" variant="outline" onClick={() => void load()}>
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
            <Badge variant="outline">官方余额</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">剩余 credits</p>
              <p className="mt-1 text-2xl font-semibold">{formatNumber(firecrawl.remaining_credits)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">账期额度</p>
              <p className="mt-1 text-2xl font-semibold">{formatNumber(firecrawl.plan_credits)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">已消耗</p>
              <p className="mt-1 text-2xl font-semibold">{formatNumber(firecrawl.used_credits)}</p>
            </div>
          </div>

          {usagePercent !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">本账期使用比例</span>
                <span className="font-medium">已用 {usagePercent.toFixed(1)}%</span>
              </div>
              <Progress value={usagePercent} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {formatDate(firecrawl.billing_period_start)} - {formatDate(firecrawl.billing_period_end)}
            </span>
            {latestCredits(data) !== null && (
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                历史消耗 {formatNumber(latestCredits(data))} credits
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted shadow-sm">
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Brave 暂无官方余额接口，当前只展示 Firecrawl 官方余额。
        </CardContent>
      </Card>
    </div>
  );
}
