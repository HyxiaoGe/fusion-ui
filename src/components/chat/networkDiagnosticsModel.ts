import type {
  NetworkDiagnosticsResponse,
  NetworkDiagnosticsToolItem,
} from '@/types/networkDiagnostics';

export interface NetworkDiagnosticsIssueItem {
  id: string;
  toolName: string;
  title: string;
  status: NetworkDiagnosticsToolItem['status'];
  reason: string;
}

export interface NetworkDiagnosticsModel {
  summaryText: string;
  issueItems: NetworkDiagnosticsIssueItem[];
  tools: NetworkDiagnosticsToolItem[];
  canShowAdminDetails: boolean;
}

export function deriveNetworkDiagnosticsModel(
  diagnostics: NetworkDiagnosticsResponse | null,
): NetworkDiagnosticsModel | null {
  if (!diagnostics || diagnostics.is_empty || diagnostics.summary.total_tool_calls === 0) {
    return null;
  }

  const issueItems = diagnostics.tools
    .filter(item => item.status === 'failed' || item.status === 'degraded' || item.status === 'interrupted')
    .map(item => ({
      id: item.tool_call_log_id,
      toolName: item.tool_name,
      title: item.target || getToolLabel(item.tool_name),
      status: item.status,
      reason: item.reason || getFallbackReason(item.status),
    }));

  return {
    summaryText: buildSummaryText(diagnostics),
    issueItems,
    tools: diagnostics.tools,
    canShowAdminDetails: diagnostics.visibility === 'admin' && diagnostics.tools.some(item => item.admin),
  };
}

function buildSummaryText(diagnostics: NetworkDiagnosticsResponse): string {
  const parts = ['联网诊断'];
  if (diagnostics.summary.search_calls > 0) {
    parts.push(`搜索 ${diagnostics.summary.search_calls} 次`);
  }
  if (diagnostics.summary.url_read_calls > 0) {
    parts.push(`读取 ${diagnostics.summary.url_read_calls} 个网页`);
  }
  if (diagnostics.summary.total_duration_ms !== null) {
    parts.push(`用时 ${formatDuration(diagnostics.summary.total_duration_ms)}`);
  }
  return parts.join(' · ');
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function getFallbackReason(status: NetworkDiagnosticsToolItem['status']): string {
  if (status === 'degraded') {
    return '部分内容不可用，已降级处理';
  }
  if (status === 'interrupted') {
    return '工具调用已中断';
  }
  return '未取得可用内容';
}

function getToolLabel(toolName: string): string {
  if (toolName === 'web_search') {
    return '搜索';
  }
  if (toolName === 'url_read') {
    return '网页读取';
  }
  return toolName;
}
