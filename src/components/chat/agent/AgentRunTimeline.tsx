'use client';

import { useAppSelector } from '@/redux/hooks';
import type { AgentRunState } from '@/types/agentRun';
import { RunHeader } from './RunHeader';
import { RunBanner } from './RunBanner';
import { StepTimeline } from './StepTimeline';
import { RunProgressStrip } from './RunProgressStrip';
import { PlanTimeline } from './PlanTimeline';
import { EvidenceDigest } from './EvidenceDigest';
import { ExecutionProcess } from './ExecutionProcess';
import { buildExecutionProcessModel, type ExecutionProcessSource } from './executionProcessModel';

interface AgentRunTimelineProps {
  /** 当前 message 的 id（FE 占位 messageId 或 server messageId）。
   * 用于过滤：只渲染归属本 message 的 currentRun。 */
  assistantMessageId: string;
  /** 用户点「重试运行」/「重新提问」时调用。
   * undefined 时 RunBanner 不显示按钮（避免 fake CTA，contract §7）。 */
  onRetry?: () => void;
  onContinue?: (previousRunId?: string) => void;
  /** 上层已知的 run。传入 null 时不订阅全局 currentRun；undefined 按未传处理。 */
  run?: AgentRunState | null;
  /** 对话正文已经解析出的搜索来源，用于补齐执行过程侧栏的候选列表。 */
  searchSources?: ExecutionProcessSource[];
}

/**
 * Agent run timeline 顶层容器，组合 RunHeader + RunBanner + StepTimeline。
 * 数据源：state.stream.currentRun（contract §1）。
 *
 * 渲染条件（contract §1 message 归属）：
 *   - 必须有 currentRun
 *   - currentRun.messageId 必须与 assistantMessageId 匹配（或 serverMessageId 匹配）
 */
export function AgentRunTimeline(props: AgentRunTimelineProps) {
  if (props.run !== undefined) {
    return (
      <AgentRunTimelineContent
        assistantMessageId={props.assistantMessageId}
        onRetry={props.onRetry}
        onContinue={props.onContinue}
        run={props.run ?? null}
        searchSources={props.searchSources}
      />
    );
  }

  return (
    <AgentRunTimelineFromStore
      assistantMessageId={props.assistantMessageId}
      onRetry={props.onRetry}
      onContinue={props.onContinue}
      searchSources={props.searchSources}
    />
  );
}

function AgentRunTimelineFromStore({
  assistantMessageId,
  onRetry,
  onContinue,
  searchSources,
}: Omit<AgentRunTimelineProps, 'run'>) {
  const run = useAppSelector(s => s.stream.currentRun);

  return (
    <AgentRunTimelineContent
      assistantMessageId={assistantMessageId}
      onRetry={onRetry}
      onContinue={onContinue}
      run={run}
      searchSources={searchSources}
    />
  );
}

function AgentRunTimelineContent({
  assistantMessageId,
  onRetry,
  onContinue,
  run,
  searchSources,
}: Required<Pick<AgentRunTimelineProps, 'assistantMessageId' | 'run'>> & Pick<AgentRunTimelineProps, 'onRetry' | 'onContinue' | 'searchSources'>) {
  if (!run) return null;
  // contract §1：只挂到归属本 message 的 currentRun
  if (run.messageId !== assistantMessageId && run.serverMessageId !== assistantMessageId) {
    return null;
  }
  const completedProcessModel = buildExecutionProcessModel(run, { searchSources });
  if (shouldRenderCompletedProcess(run, completedProcessModel.isRenderable)) {
    return (
      <div
        data-testid="agent-run-timeline"
        className="mb-3 w-full max-w-full min-w-0 self-stretch"
      >
        <ExecutionProcess run={run} searchSources={searchSources} />
      </div>
    );
  }
  if (shouldHideCompletedRun(run)) return null;
  const hasV2Artifacts = hasReadableProgress(run);
  // 空 steps 守卫（contract §1）：
  //   - running / completed：空 steps 没有可展示信息，避免空容器
  //   - failed / interrupted / limit_reached：banner 仍有用户价值（如 ProviderOffline 0 step），保留渲染
  if (
    !run.steps?.length
    && !hasV2Artifacts
    && (run.status === 'running' || (run.status === 'completed' && !run.limitReachedReason))
  ) return null;

  return (
    <div
      data-testid="agent-run-timeline"
      className="mb-3 w-full max-w-full min-w-0 self-stretch"
    >
      <RunHeader run={run} />
      <RunProgressStrip run={run} />
      <RunBanner
        run={run}
        onRetry={onRetry}
        onContinue={onContinue ? () => onContinue(run.runId) : undefined}
      />
      <PlanTimeline run={run} />
      <EvidenceDigest run={run} />
      <StepTimeline run={run} />
    </div>
  );
}

function shouldRenderCompletedProcess(run: AgentRunState, hasExecutionProcess: boolean): boolean {
  return run.status === 'completed'
    && !run.limitReachedReason
    && hasExecutionProcess;
}

function shouldHideCompletedRun(run: AgentRunState): boolean {
  if (run.status !== 'completed') return false;
  if (run.limitReachedReason) return false;
  if (hasReadableProgress(run)) return false;

  return !run.steps?.some(step => (
    step.status === 'failed'
    || step.status === 'interrupted'
    || step.toolCalls.some(call => (
      call.status === 'failed'
      || call.status === 'degraded'
      || call.status === 'interrupted'
    ))
  ));
}

function hasReadableProgress(run: AgentRunState): boolean {
  return Boolean(
    run.progress
    || run.plan?.items.length
    || run.toolDigests?.length
    || run.evidence?.length
  );
}
