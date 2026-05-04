"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  message: string;
  code?: string;
  data?: Record<string, unknown>;
  onDismiss?: () => void;
}

/**
 * 流式调用错误卡片：附在消息底部。
 *
 * 当 code === "PROVIDER_OFFLINE" 时额外显示「去管理 Key」CTA，跳转到设置页的
 * 「模型与 Key」tab，便于用户排查（key 失效 / 余额耗尽 / ToS 违规等）。
 */
export default function StreamErrorCard({ message, code, data, onDismiss }: Props) {
  const router = useRouter();
  const isProviderOffline = code === "PROVIDER_OFFLINE";
  const providerId = typeof data?.provider_id === "string" ? data.provider_id : null;
  const reason = typeof data?.reason === "string" ? data.reason : null;

  return (
    <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-3 my-2 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-destructive font-medium">{message}</p>
          {isProviderOffline && providerId && (
            <p className="text-xs text-muted-foreground mt-1">
              提供商：{providerId}
              {reason ? `（${reason}）` : null}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            {isProviderOffline && (
              <Button size="sm" variant="outline" onClick={() => router.push("/settings")}>
                去管理 Key
              </Button>
            )}
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                忽略
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
