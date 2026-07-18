'use client';

import { AlertCircle, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocationContextHandshake } from '@/hooks/useLocationContextHandshake';
import type { AgentContextPurpose } from '@/types/agentRun';

interface LocationContextBannerProps {
  conversationId: string | null;
}

const PURPOSE_TEXT: Record<AgentContextPurpose, string> = {
  nearby_search: '推荐你附近的地点',
  route_origin: '将当前位置作为路线起点',
  route_destination: '将当前位置作为路线终点',
  local_weather: '查询你所在地的天气',
};

export default function LocationContextBanner({ conversationId }: LocationContextBannerProps) {
  const {
    request,
    allowLocation,
    declineLocation,
    retrySubmission,
  } = useLocationContextHandshake(conversationId);

  if (!request) return null;

  const purposeText = PURPOSE_TEXT[request.purpose];
  const isLocating = request.phase === 'locating';
  const isSubmitting = request.phase === 'submitting';
  const isFailed = request.phase === 'submit_failed';

  return (
    <section
      aria-label="位置授权提示"
      className="flex shrink-0 items-start gap-3 border-b border-border/60 bg-muted/20 px-4 py-3"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {isLocating || isSubmitting
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : isFailed
            ? <AlertCircle className="h-4 w-4" aria-hidden="true" />
            : <MapPin className="h-4 w-4" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {isLocating
            ? '正在获取位置'
            : isSubmitting
              ? '正在继续处理'
              : isFailed
                ? '位置结果提交失败'
                : `需要你的位置，以便${purposeText}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isFailed ? '网络恢复后可重试，本次结果不会写入消息。' : '仅用于本次请求，不会写入聊天记录。'}
        </p>
      </div>
      {request.phase === 'required' ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => { void allowLocation(); }}
          >
            使用我的位置
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { void declineLocation(); }}
          >
            暂不提供
          </Button>
        </div>
      ) : isFailed ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => { void retrySubmission(); }}
        >
          重试提交
        </Button>
      ) : null}
    </section>
  );
}
