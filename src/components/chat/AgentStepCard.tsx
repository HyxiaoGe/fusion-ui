'use client';

import { useState } from 'react';
import { Search, Globe, ChevronDown, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import type { AgentStep } from '@/redux/slices/streamSlice';

interface AgentStepCardProps {
  steps: AgentStep[];
  maxSteps: number;
  isStreaming: boolean;
  limitReached: boolean;
}

export default function AgentStepCard({ steps, maxSteps, isStreaming, limitReached }: AgentStepCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (steps.length === 0) return null;

  const currentStep = steps[steps.length - 1];
  const isRunning = isStreaming && currentStep?.status === 'running';
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalToolCalls = steps.reduce((sum, s) => sum + s.toolCalls.length, 0);

  // 流结束后折叠成摘要
  if (!isStreaming && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-2"
      >
        <ChevronRight className="w-3 h-3" />
        <span>深度搜索完成（{completedSteps} 步，{totalToolCalls} 次工具调用）</span>
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          )}
          <span>
            {isRunning
              ? `深度搜索 (${steps.length}/${maxSteps})`
              : `深度搜索完成（${completedSteps} 步，${totalToolCalls} 次工具调用）`
            }
          </span>
          {limitReached && (
            <span className="text-xs text-amber-500 font-normal">已达上限</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
      </button>

      {/* 步骤列表 */}
      {isExpanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {steps.map((agentStep) => (
            <div key={agentStep.step} className="flex items-start gap-2 text-xs">
              <div className="mt-0.5 flex-shrink-0">
                {agentStep.status === 'completed' ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-gray-500 dark:text-gray-400 mb-0.5">
                  步骤 {agentStep.step}
                </div>
                {agentStep.toolCalls.map((tc) => (
                  <div key={tc.toolCallId} className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 truncate">
                    {tc.toolName === 'web_search' ? (
                      <Search className="w-3 h-3 flex-shrink-0 text-blue-500" />
                    ) : (
                      <Globe className="w-3 h-3 flex-shrink-0 text-emerald-500" />
                    )}
                    <span className="truncate">{tc.query}</span>
                    {tc.status === 'running' && (
                      <Loader2 className="w-3 h-3 animate-spin text-gray-400 flex-shrink-0" />
                    )}
                    {tc.status === 'failed' && (
                      <span className="text-red-500 flex-shrink-0">失败</span>
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
