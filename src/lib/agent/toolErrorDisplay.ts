import type { ToolCallStatus } from '@/types/agentRun';

const SAFE_EXTERNAL_TOOL_NAMES = new Set([
  'local_place_search',
  'route_compare',
]);

export function getToolErrorDisplay(
  toolName: string,
  status: ToolCallStatus,
  error?: string,
): string | undefined {
  if (status === 'success' || status === 'running') {
    return undefined;
  }

  if (toolName === 'url_read') {
    if (status === 'interrupted') return '网页读取已中断';
    return '网页暂时无法读取';
  }

  if (toolName === 'web_search') {
    if (status === 'interrupted') return '搜索已中断';
    return '部分搜索结果未能使用';
  }

  if (
    (toolName.startsWith('mcp_') || SAFE_EXTERNAL_TOOL_NAMES.has(toolName))
    && (status === 'failed' || status === 'degraded')
  ) {
    return '部分工具结果未能使用';
  }

  const rawError = error?.trim();
  if (rawError && !isInternalFailureReason(rawError) && !containsInternalToolAlias(rawError, toolName)) {
    return rawError;
  }

  if (status === 'interrupted') return '工具调用已中断';
  return '部分工具结果未能使用';
}

function containsInternalToolAlias(reason: string, toolName: string): boolean {
  const normalizedReason = reason.toLowerCase();
  const normalizedToolName = toolName.trim().toLowerCase();
  return Boolean(normalizedToolName && normalizedReason.includes(normalizedToolName))
    || /(?:^|[^a-z0-9])mcp(?:__|[_:-])[a-z0-9_.:-]+/i.test(reason);
}

function isInternalFailureReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized.includes('reader-service')
    || normalized.includes('web_search')
    || normalized.includes('url_read')
    || normalized.includes('timeout')
    || normalized.includes('超时')
    || normalized.includes('本轮联网预算')
    || normalized.includes('已降级跳过')
    || normalized.includes('降级处理')
    || normalized.includes('预算');
}
