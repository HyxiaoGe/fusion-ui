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

export interface NetworkDiagnosticsProcessItem {
  id: string;
  toolLabel: string;
  status: NetworkDiagnosticsToolItem['status'];
  statusLabel: string;
  target: string;
  resultCount: number | null;
  durationText: string;
  reason?: string;
}

export interface NetworkDiagnosticsModel {
  summaryText: string;
  displaySummaryText?: string;
  processItems: NetworkDiagnosticsProcessItem[];
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

  const processItems = diagnostics.tools.map(item => buildProcessItem(item));
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
    summaryText: buildSummaryText(diagnostics, { includeLegacyTitle: true }),
    displaySummaryText: buildSummaryText(diagnostics),
    processItems,
    issueItems,
    tools: diagnostics.tools,
    canShowAdminDetails: false,
  };
}

function buildSummaryText(
  diagnostics: NetworkDiagnosticsResponse,
  options: { includeLegacyTitle?: boolean } = {},
): string {
  const parts = options.includeLegacyTitle ? ['联网诊断'] : [];
  if (diagnostics.summary.search_calls > 0) {
    parts.push(`搜索 ${diagnostics.summary.search_calls} 次`);
  }
  if (diagnostics.summary.url_read_calls > 0) {
    parts.push(`读取 ${diagnostics.summary.url_read_calls} 个网页`);
  }
  if (diagnostics.summary.total_duration_ms !== null) {
    parts.push(`用时 ${formatDuration(diagnostics.summary.total_duration_ms)}`);
  }
  const issueCount = diagnostics.summary.failed_count
    + diagnostics.summary.degraded_count
    + diagnostics.summary.interrupted_count;
  if (issueCount > 0) {
    parts.push(`异常 ${issueCount} 次`);
  }
  if (parts.length === 0) {
    parts.push(`${diagnostics.summary.total_tool_calls} 次工具调用`);
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
    return '读取网页';
  }
  return toolName;
}

function buildProcessItem(item: NetworkDiagnosticsToolItem): NetworkDiagnosticsProcessItem {
  const reason = item.status === 'success'
    ? undefined
    : item.reason || getFallbackReason(item.status);

  return {
    id: item.tool_call_log_id,
    toolLabel: getToolLabel(item.tool_name),
    status: item.status,
    statusLabel: getStatusLabel(item.status),
    target: item.target?.trim() || '未提供目标',
    resultCount: item.tool_name === 'web_search' ? item.result_count ?? null : null,
    durationText: item.duration_ms === null ? '耗时未知' : formatDuration(item.duration_ms),
    ...(reason ? { reason } : {}),
  };
}

function getStatusLabel(status: NetworkDiagnosticsToolItem['status']): string {
  if (status === 'success') {
    return '成功';
  }
  if (status === 'failed') {
    return '失败';
  }
  if (status === 'degraded') {
    return '降级';
  }
  return '中断';
}
