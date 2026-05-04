'use client';

import { useState } from 'react';
import { Search, Globe, ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

import { useAppSelector } from '@/redux/hooks';
import type { AgentStepStatus } from '@/types/agentRun';

/**
 * AgentStepCard
 *
 * 显示当前 agent run 的 step / tool_call 折叠卡片。
 * Phase 1 视觉与现状保持一致；Phase 2 多形态分场景渲染（spec §6.7 / §9）。
 *
 * 数据源：state.stream.currentRun（Task 12 streamSlice 重写后的 timeline）。
 * 旧消息（无 currentRun）→ 不渲染（spec §6.9 不反推）。
 */
export default function AgentStepCard() {
  const [isExpanded, setIsExpanded] = useState(true);
  const run = useAppSelector((s) => s.stream.currentRun);

  if (!run || run.steps.length === 0) return null;

  const steps = run.steps;
  const maxSteps = run.config.maxSteps;
  const isStreaming = run.status === 'running';
  const limitReached = !!run.limitReachedReason;

  const currentStep = steps[steps.length - 1];
  const isRunning = isStreaming && currentStep?.status === 'running';
  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const totalToolCalls = steps.reduce((sum, s) => sum + s.toolCalls.length, 0);

  // 流结束后折叠成摘要
  if (!isStreaming && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast mb-2"
      >
        <ChevronRight className="w-3 h-3" />
        <span>深度搜索完成（{completedSteps} 步，{totalToolCalls} 次工具调用）</span>
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/30 overflow-hidden">
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors duration-fast"
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-info motion-reduce:animate-none" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          )}
          <span>
            {isRunning
              ? `深度搜索 (${steps.length}/${maxSteps})`
              : `深度搜索完成（${completedSteps} 步，${totalToolCalls} 次工具调用）`
            }
          </span>
          {limitReached && (
            <span className="text-xs text-warn font-normal">已达上限</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
      </button>

      {/* 步骤列表 */}
      {isExpanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {steps.map((agentStep) => (
            <div key={agentStep.stepId} className="flex items-start gap-2 text-xs">
              <div className="mt-0.5 flex-shrink-0">{stepStatusIcon(agentStep.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-muted-foreground mb-0.5">
                  步骤 {agentStep.stepNumber}
                </div>
                {agentStep.toolCalls.map((tc) => (
                  <div key={tc.toolCallId} className="flex items-center gap-1.5 text-foreground/80 truncate">
                    {tc.toolName === 'web_search' ? (
                      <Search className="w-3 h-3 flex-shrink-0 text-info" />
                    ) : (
                      <Globe className="w-3 h-3 flex-shrink-0 text-teal" />
                    )}
                    <span className={`truncate${tc.status === 'running' ? ' text-muted-foreground' : ''}`}>
                      {toolCallLabel(tc.toolName, tc.arguments)}
                    </span>
                    {(tc.status === 'failed' || tc.status === 'degraded') && (
                      <span className="text-danger flex-shrink-0">
                        {tc.status === 'failed' ? '失败' : '降级'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function stepStatusIcon(status: AgentStepStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-3 h-3 text-success" aria-label="完成" />;
    case 'running':
      return <span className="block w-2 h-2 rounded-full bg-info/70" aria-label="进行中" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-danger" aria-label="失败" />;
    case 'interrupted':
      return <AlertCircle className="w-3 h-3 text-warn" aria-label="已中断" />;
  }
}

/** 从 ToolCall 的 arguments 提取展示文案（query 或 url）。*/
function toolCallLabel(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'web_search') {
    return (args.query as string | undefined) ?? '';
  }
  if (toolName === 'url_read') {
    return (args.url as string | undefined) ?? '';
  }
  // 未知工具：显示 tool_name 占位（未来如果有更多工具，扩展这里）
  return toolName;
}
