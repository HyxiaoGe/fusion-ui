'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getChatCapabilities } from '@/lib/api/chat';
import type { RunListRefreshResult } from '@/hooks/useConversationTrajectory';
import {
  resolveTrajectoryActionPolicy,
  type TrajectoryActionPolicyInput,
  type TrajectoryRunActionTarget,
} from '@/lib/trajectory/trajectoryActionPolicy';

type CapabilityStatus = 'idle' | 'loading' | 'supported' | 'unsupported';

export interface TrajectoryRunActionLifecycle {
  canStart: () => boolean;
  onAccepted: () => void;
  onRejected: () => void;
}

type TrajectoryRunActionHandler = (
  target: TrajectoryRunActionTarget,
  lifecycle: TrajectoryRunActionLifecycle,
) => void | Promise<void>;

export interface TrajectoryRunActionsProps
  extends Omit<TrajectoryActionPolicyInput, 'retryCapabilityAvailable'> {
  enabled?: boolean;
  refreshRuns: () => Promise<RunListRefreshResult>;
  getLatestPolicyInput: () => Omit<TrajectoryActionPolicyInput, 'retryCapabilityAvailable'>;
  onRetry?: TrajectoryRunActionHandler;
  onContinue?: TrajectoryRunActionHandler;
}

function readOnlyMessage(
  policy: ReturnType<typeof resolveTrajectoryActionPolicy>,
  capabilityStatus: CapabilityStatus,
): string {
  if (capabilityStatus === 'idle' || capabilityStatus === 'loading') {
    return '正在验证安全运行操作能力';
  }
  const blockers = new Set([
    ...policy.retry.blockers,
    ...policy.continue.blockers,
  ]);
  if (blockers.has('run-not-latest-attempt') || blockers.has('run-not-last-turn')) {
    return '历史执行只读；仅最后一轮的最新执行可操作';
  }
  if (
    blockers.has('trajectory-legacy')
    || blockers.has('trajectory-degraded')
    || blockers.has('trajectory-truncated')
    || blockers.has('trajectory-unverified')
  ) {
    return '轨迹完整性不足，本次运行仅供查看';
  }
  if (blockers.has('active-stream')) return '当前有回答正在生成，运行操作暂不可用';
  if (blockers.has('retry-capability-unavailable')) {
    return '当前服务版本不支持安全运行重试';
  }
  if (blockers.has('model-unavailable')) return '该会话模型当前不可用';
  if (blockers.has('knowledge-unavailable')) return '当前知识库选择不可用';
  if (blockers.has('knowledge-attachment-conflict')) {
    return '严格知识库模式不能重试带附件的历史消息';
  }
  if (blockers.has('run-turn-missing') || blockers.has('assistant-message-missing')) {
    return '运行与消息无法安全关联，本次运行仅供查看';
  }
  return '本次运行仅供查看';
}

export function TrajectoryRunActions({
  enabled = true,
  refreshRuns,
  getLatestPolicyInput,
  onRetry,
  onContinue,
  ...policyInput
}: TrajectoryRunActionsProps) {
  const [capabilityStatus, setCapabilityStatus] = useState<CapabilityStatus>('idle');
  const [actionPending, setActionPending] = useState(false);
  const activeActionRef = useRef<symbol | null>(null);
  const structuralPolicy = useMemo(() => resolveTrajectoryActionPolicy({
    ...policyInput,
    retryCapabilityAvailable: true,
  }), [policyInput]);

  useEffect(() => {
    if (!enabled || !structuralPolicy.terminal) return;
    const controller = new AbortController();
    let current = true;
    setCapabilityStatus('loading');
    void getChatCapabilities(controller.signal)
      .then((capabilities) => {
        if (!current) return;
        setCapabilityStatus(capabilities.message_retry_v1 ? 'supported' : 'unsupported');
      })
      .catch((error: unknown) => {
        if (!current || (error instanceof Error && error.name === 'AbortError')) return;
        setCapabilityStatus('unsupported');
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, structuralPolicy.terminal]);

  const policy = resolveTrajectoryActionPolicy({
    ...policyInput,
    retryCapabilityAvailable: capabilityStatus === 'supported',
  });

  const target = policy.target;
  const showRetry = Boolean(target && policy.retry.allowed && onRetry);
  const showContinue = Boolean(target && policy.continue.allowed && onContinue);

  const startAction = useCallback((kind: 'retry' | 'continue') => {
    if (activeActionRef.current) return;
    const currentTarget = policy.target;
    const handler = kind === 'retry' ? onRetry : onContinue;
    const decision = kind === 'retry' ? policy.retry : policy.continue;
    if (!currentTarget || !handler || !decision.allowed) return;

    const token = Symbol(`trajectory-${kind}`);
    const selectedRunId = currentTarget.previousRunId;
    activeActionRef.current = token;
    setActionPending(true);

    const release = () => {
      if (activeActionRef.current !== token) return;
      activeActionRef.current = null;
      setActionPending(false);
    };
    const latestDecision = () => {
      if (activeActionRef.current !== token) return null;
      const latestPolicy = resolveTrajectoryActionPolicy({
        ...getLatestPolicyInput(),
        retryCapabilityAvailable: capabilityStatus === 'supported',
      });
      const latestTarget = latestPolicy.target;
      const latestAction = kind === 'retry' ? latestPolicy.retry : latestPolicy.continue;
      if (
        !latestAction.allowed
        || !latestTarget
        || latestTarget.previousRunId !== selectedRunId
      ) return null;
      return latestTarget;
    };

    void (async () => {
      try {
        if (await refreshRuns() !== 'ready') return;
        const latestTarget = latestDecision();
        if (!latestTarget) return;
        await handler(latestTarget, {
          canStart: () => latestDecision() !== null,
          onAccepted: release,
          onRejected: release,
        });
      } finally {
        release();
      }
    })();
  }, [
    capabilityStatus,
    getLatestPolicyInput,
    onContinue,
    onRetry,
    policy,
    refreshRuns,
  ]);

  if (!enabled || !policy.terminal) return null;

  return (
    <section
      aria-label="所选运行的终态操作"
      className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-2"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">所选运行已结束</p>
        {actionPending ? (
          <p role="status" aria-label="运行操作状态" className="truncate text-xs text-muted-foreground">
            正在刷新并验证最新运行
          </p>
        ) : !showRetry && !showContinue ? (
          <p role="status" aria-label="运行操作状态" className="truncate text-xs text-muted-foreground">
            {readOnlyMessage(policy, capabilityStatus)}
          </p>
        ) : policy.continue.blockers.includes('knowledge-continuation-unsupported') ? (
          <p className="truncate text-xs text-muted-foreground">知识库回答不支持继续执行，可重新运行</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showRetry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={actionPending}
            onClick={() => startAction('retry')}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            重试所选运行
          </Button>
        ) : null}
        {showContinue ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={actionPending}
            onClick={() => startAction('continue')}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            继续所选运行
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export default TrajectoryRunActions;
