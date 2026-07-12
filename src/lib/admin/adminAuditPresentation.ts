import type { AdminAuditEventRecord, AdminJsonValue } from '@/types/adminAudit';

const ACTION_LABELS: Record<string, string> = {
  'admin.audit.users.list': '查询用户列表',
  'admin.audit.user.view': '查看用户详情',
  'admin.audit.conversations.list': '查询对话列表',
  'admin.audit.conversation.view': '查看对话详情',
  'admin.audit.messages.list': '查看对话消息',
  'admin.audit.tool_calls.list': '查看工具调用',
  'admin.audit.agent_runs.list': '查看 Agent 运行',
  'admin.audit.files.list': '查看关联文件',
  'admin.audit.events.list': '查询访问审计',
  'admin.audit.performance_run.import': '导入压测记录',
  'admin.audit.performance_runs.list': '查询压测记录',
  'admin.audit.performance_run.view': '查看压测详情',
};

const RESOURCE_LABELS: Record<string, string> = {
  user: '用户',
  conversation: '对话',
  conversation_messages: '对话消息',
  conversation_tool_calls: '工具调用',
  conversation_agent_runs: 'Agent 运行',
  conversation_files: '关联文件',
  admin_audit_event: '访问审计',
  performance_run: '压测记录',
};

export interface AdminAuditAdminPresentation {
  primary: string;
  secondary?: string;
}

export function adminAuditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? '其他管理操作';
}

export function adminAuditResourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? '其他访问对象';
}

export function formatAdminAuditAdmin(snapshot: AdminJsonValue): AdminAuditAdminPresentation {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { primary: '管理员信息未记录' };
  }
  const username = typeof snapshot.username === 'string' ? snapshot.username.trim().slice(0, 80) : '';
  const email = typeof snapshot.email_masked === 'string' ? snapshot.email_masked.trim().slice(0, 120) : '';
  if (!username && !email) return { primary: '管理员信息未记录' };
  return {
    primary: username ? `@${username}` : '管理员账号未记录',
    ...(email ? { secondary: email } : {}),
  };
}

export interface AdminAuditTargetUserPresentation {
  primary: string;
  secondary?: string;
  detail: string;
}

type AdminAuditTargetUser = AdminAuditEventRecord['target_user'];

export function formatAdminAuditTargetUser(
  targetUser: AdminAuditTargetUser,
  targetUserId: string | null,
): AdminAuditTargetUserPresentation | null {
  if (targetUser && typeof targetUser === 'object') {
    const nickname = typeof targetUser.nickname === 'string' ? targetUser.nickname.trim().slice(0, 80) : '';
    const username = typeof targetUser.username === 'string' ? targetUser.username.trim().slice(0, 80) : '';
    const email = typeof targetUser.email_masked === 'string' ? targetUser.email_masked.trim().slice(0, 120) : '';
    const identity = [nickname, username ? `@${username}` : ''].filter(Boolean).join(' ') || '身份信息不完整';
    return {
      primary: `当前用户：${identity}`,
      ...(email ? { secondary: email } : {}),
      detail: [identity, email].filter(Boolean).join(' · '),
    };
  }
  if (!targetUserId) return null;
  if (targetUser === null) {
    return {
      primary: `用户记录已不存在（${shortAdminAuditId(targetUserId)}）`,
      detail: '用户记录已不存在',
    };
  }
  return {
    primary: `目标用户：${shortAdminAuditId(targetUserId)}（旧记录）`,
    detail: '旧审计记录未包含身份',
  };
}

function shortAdminAuditId(value: string): string {
  const normalized = value.trim();
  return normalized.length <= 8 ? normalized : `…${normalized.slice(-8)}`;
}

const METADATA_LABELS: Record<string, string> = {
  page: '页码',
  page_size: '每页数量',
  environment: '环境',
  schema_version: 'Schema 版本',
  status: '状态',
  has_tools: '工具筛选',
  has_files: '文件筛选',
  created_from: '开始日期',
  created_to: '结束日期',
  model_id: '模型',
  source: '来源',
  q: '查询条件',
  query: '查询条件',
};

export interface AdminAuditMetadataItem {
  label: string;
  value: string;
}

export function formatAdminAuditMetadata(metadata: AdminJsonValue): AdminAuditMetadataItem[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  return Object.entries(METADATA_LABELS).flatMap(([key, label]) => {
    const value = metadata[key];
    if (value === null || value === undefined) return [];
    if ((key === 'q' || key === 'query') && typeof value === 'object' && !Array.isArray(value)) {
      const present = value?.present === true;
      const length = typeof value?.length === 'number' ? Math.max(0, Math.trunc(value.length)) : null;
      return [{ label, value: present ? `已填写${length === null ? '' : `（${length} 字符）`}` : '未填写' }];
    }
    if (typeof value === 'string') return [{ label, value: value.slice(0, 80) }];
    if (typeof value === 'number' || typeof value === 'boolean') return [{ label, value: String(value) }];
    return [];
  });
}
