import { describe, expect, it } from 'vitest';
import {
  adminAuditActionLabel, adminAuditResourceLabel, formatAdminAuditAdmin,
  formatAdminAuditMetadata, formatAdminAuditTargetUser,
} from './adminAuditPresentation';

describe('adminAuditPresentation', () => {
  it('把已知审计动作和资源映射为中文业务文案', () => {
    expect(adminAuditActionLabel('admin.audit.conversation.view')).toBe('查看对话详情');
    expect(adminAuditActionLabel('admin.audit.performance_run.import')).toBe('导入压测记录');
    expect(adminAuditResourceLabel('conversation_tool_calls')).toBe('工具调用');
    expect(adminAuditResourceLabel('performance_run')).toBe('压测记录');
  });

  it('未知动作、未知资源和缺失管理员快照使用安全兜底', () => {
    expect(adminAuditActionLabel('future.sensitive.action')).toBe('其他管理操作');
    expect(adminAuditResourceLabel('future_private_resource')).toBe('其他访问对象');
    expect(formatAdminAuditAdmin(null)).toEqual({ primary: '管理员信息未记录' });
    expect(formatAdminAuditAdmin({ username: 'ops', email_masked: 'o***@example.com' })).toEqual({
      primary: '@ops', secondary: 'o***@example.com',
    });
  });

  it('metadata 仅派生白名单短摘要并隐藏未知字段', () => {
    expect(formatAdminAuditMetadata({
      page: 2,
      q: { present: true, length: 12 },
      source: 'x'.repeat(100),
      unknown_secret: '不得展示',
    })).toEqual([
      { label: '页码', value: '2' },
      { label: '来源', value: 'x'.repeat(80) },
      { label: '查询条件', value: '已填写（12 字符）' },
    ]);
  });

  it('目标用户当前身份、删除记录和旧响应分别使用明确摘要', () => {
    expect(formatAdminAuditTargetUser({
      id: 'user-current', username: 'target', nickname: '目标用户', email_masked: 't***@example.com',
    }, 'user-current')).toEqual({
      primary: '当前用户：目标用户 @target',
      secondary: 't***@example.com',
      detail: '目标用户 @target · t***@example.com',
    });
    expect(formatAdminAuditTargetUser(null, 'user-deleted-12345678')).toEqual({
      primary: '用户记录已不存在（…12345678）',
      detail: '用户记录已不存在',
    });
    expect(formatAdminAuditTargetUser(undefined, 'user-legacy-87654321')).toEqual({
      primary: '目标用户：…87654321（旧记录）',
      detail: '旧审计记录未包含身份',
    });
  });
});
