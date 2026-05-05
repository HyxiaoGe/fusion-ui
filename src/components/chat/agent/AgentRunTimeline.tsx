'use client';

import { useAppSelector } from '@/redux/hooks';
import { RunHeader } from './RunHeader';
import { RunBanner } from './RunBanner';
import { StepTimeline } from './StepTimeline';

interface AgentRunTimelineProps {
  /** 当前 message 的 id（FE 占位 messageId 或 server messageId）。
   * 用于过滤：只渲染归属本 message 的 currentRun。 */
  assistantMessageId: string;
  /** 用户点「重试运行」/「重新提问」时调用。
   * undefined 时 RunBanner 不显示按钮（避免 fake CTA，contract §7）。 */
  onRetry?: () => void;
}

/**
 * Agent run timeline 顶层容器，组合 RunHeader + RunBanner + StepTimeline。
 * 数据源：state.stream.currentRun（contract §1）。
 *
 * 渲染条件（contract §1 message 归属）：
 *   - 必须有 currentRun
 *   - currentRun.messageId 必须与 assistantMessageId 匹配（或 serverMessageId 匹配）
 */
export function AgentRunTimeline({ assistantMessageId, onRetry }: AgentRunTimelineProps) {
  const run = useAppSelector(s => s.stream.currentRun);

  if (!run) return null;
  // contract §1：只挂到归属本 message 的 currentRun
  if (run.messageId !== assistantMessageId && run.serverMessageId !== assistantMessageId) {
    return null;
  }
  // 空 steps 守卫（contract §1）：
  //   - running / completed：空 steps 没有可展示信息，避免空容器
  //   - failed / interrupted / limit_reached：banner 仍有用户价值（如 ProviderOffline 0 step），保留渲染
  if (!run.steps?.length && (run.status === 'running' || run.status === 'completed')) return null;

  return (
    <div className="mb-3 w-full max-w-full">
      <RunHeader run={run} />
      <RunBanner run={run} onRetry={onRetry} />
      <StepTimeline run={run} />
    </div>
  );
}
