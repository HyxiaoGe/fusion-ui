/**
 * 派生逻辑集中（contract §4 / §5 / §6）。
 *
 * 把 retry heuristic、summary step 判断、banner 文案派生这类逻辑
 * 集中在这里，避免组件代码堆判断。
 */

import type {
  AgentStepState,
  ToolCallState,
  LimitReachedReason,
} from '@/types/agentRun';

/**
 * Retry heuristic（contract §4，FE-only，不进 BE 协议）。
 *
 * 判定条件：在同一 step 的 toolCalls 数组中，给定 tc 之前存在另一个
 * 同 toolName + 同 target（web_search 看 query / url_read 看 url）+ status='failed'
 * 的 tool call。
 */
export function isRetryAttempt(
  tc: ToolCallState,
  allInStep: ToolCallState[],
): boolean {
  if (tc.status !== 'success') return false;
  const target = getTarget(tc);
  if (!target) return false;
  const idx = allInStep.findIndex(x => x.toolCallId === tc.toolCallId);
  if (idx <= 0) return false;
  for (let i = 0; i < idx; i++) {
    const prev = allInStep[i];
    if (
      prev.toolName === tc.toolName &&
      getTarget(prev) === target &&
      prev.status === 'failed'
    ) {
      return true;
    }
  }
  return false;
}

function getTarget(tc: ToolCallState): string | null {
  if (tc.toolName === 'web_search') return String(tc.arguments.query ?? '') || null;
  if (tc.toolName === 'url_read') return String(tc.arguments.url ?? '') || null;
  return null;
}

/**
 * Summary step 判定（contract §5）。
 *
 * 0 tool call 的 step 视为总结步骤——典型场景是 limit_reached 触顶后
 * 的强制总结 round，或正常路径最后一轮 LLM 只产出文本不调工具。
 */
export function isSummaryStep(step: AgentStepState): boolean {
  return (step.toolCalls?.length ?? 0) === 0;
}

/**
 * RunBanner limit reached 文案派生（contract §6）。
 */
export function getLimitReachedBannerText(
  reason: LimitReachedReason,
  configValue: number,
): { title: string; sub: string } {
  switch (reason) {
    case 'max_steps':
      return {
        title: `已达最大步数（${configValue}）— 停止规划`,
        sub: '模型已用强制总结给出答复，可能未完整覆盖问题',
      };
    case 'max_tool_calls':
      return {
        title: `已达最大工具调用数（${configValue}）— 停止调工具`,
        sub: '工具预算用完，模型已用现有信息总结',
      };
    case 'timeout':
      return {
        title: `运行超时（${configValue}s）— 停止规划`,
        sub: '总耗时超过上限，结果可能不完整',
      };
    default:
      return {
        title: '已达运行上限',
        sub: '模型已用现有信息给出答复',
      };
  }
}
