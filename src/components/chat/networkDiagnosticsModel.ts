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
  detailParts: string[];
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
      reason: getDisplayReason(item),
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
    parts.push(`部分来源未使用 ${issueCount} 次`);
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

function getDisplayReason(item: NetworkDiagnosticsToolItem): string {
  if (item.tool_name === 'url_read') {
    if (item.status === 'interrupted') {
      return '网页读取已中断';
    }
    return '网页暂时无法读取';
  }

  if (item.tool_name === 'web_search') {
    if (item.status === 'interrupted') {
      return '搜索已中断';
    }
    return '部分搜索结果未能使用';
  }

  const rawReason = item.reason?.trim();
  if (rawReason && !isInternalFailureReason(rawReason)) {
    return rawReason;
  }

  if (item.status === 'degraded') {
    return '部分来源未能使用';
  }
  if (item.status === 'interrupted') {
    return '工具调用已中断';
  }
  return '部分来源未能使用';
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
    : getDisplayReason(item);

  return {
    id: item.tool_call_log_id,
    toolLabel: getToolLabel(item.tool_name),
    status: item.status,
    statusLabel: getStatusLabel(item.status),
    target: item.target?.trim() || '未提供目标',
    resultCount: null,
    durationText: item.duration_ms === null ? '耗时未知' : formatDuration(item.duration_ms),
    detailParts: buildDetailParts(item),
    ...(reason ? { reason } : {}),
  };
}

function buildDetailParts(item: NetworkDiagnosticsToolItem): string[] {
  if (item.tool_name === 'web_search') {
    return [];
  }
  if (item.tool_name === 'url_read') {
    const reason = item.status === 'success' ? item.reason?.trim() : '';
    return reason ? [`读取目的：${reason}`] : [];
  }
  return [];
}

function getStatusLabel(status: NetworkDiagnosticsToolItem['status']): string {
  if (status === 'success') {
    return '成功';
  }
  if (status === 'failed') {
    return '未使用';
  }
  if (status === 'degraded') {
    return '部分可用';
  }
  return '中断';
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
