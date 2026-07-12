import { describe, expect, it } from 'vitest';
import { buildAdminAuditUrl, parseAdminAuditRoute } from './adminAuditRoute';

describe('adminAuditRoute', () => {
  it('解析受支持的页签和与页签匹配的详情参数', () => {
    expect(parseAdminAuditRoute(new URLSearchParams())).toEqual({ tab: 'users' });
    expect(parseAdminAuditRoute(new URLSearchParams('tab=users&user_id=%20user-1%20'))).toEqual({
      tab: 'users', userId: 'user-1',
    });
    expect(parseAdminAuditRoute(new URLSearchParams('tab=conversations&user_id=user-1&conversation_id=conv-1'))).toEqual({
      tab: 'conversations', userId: 'user-1', conversationId: 'conv-1',
    });
    expect(parseAdminAuditRoute(new URLSearchParams('tab=performance&run_id=perf-1'))).toEqual({
      tab: 'performance', runId: 'perf-1',
    });
    expect(parseAdminAuditRoute(new URLSearchParams('tab=events'))).toEqual({ tab: 'events' });
  });

  it('忽略未知页签、错页签详情参数和不安全 ID', () => {
    expect(parseAdminAuditRoute(new URLSearchParams('tab=unknown&user_id=secret'))).toEqual({ tab: 'users' });
    expect(parseAdminAuditRoute(new URLSearchParams('tab=events&conversation_id=conv-1'))).toEqual({ tab: 'events' });
    expect(parseAdminAuditRoute(new URLSearchParams('tab=users&user_id=user%0Asecret'))).toEqual({ tab: 'users' });
    expect(parseAdminAuditRoute(new URLSearchParams(`tab=performance&run_id=${'x'.repeat(201)}`))).toEqual({ tab: 'performance' });
  });

  it('只用 URLSearchParams 构建规范 URL', () => {
    expect(buildAdminAuditUrl({ tab: 'users' })).toBe('/admin');
    expect(buildAdminAuditUrl({ tab: 'users', userId: 'user / 1' })).toBe('/admin?tab=users&user_id=user+%2F+1');
    expect(buildAdminAuditUrl({ tab: 'conversations', userId: 'user-1', conversationId: 'conv-1' }))
      .toBe('/admin?tab=conversations&user_id=user-1&conversation_id=conv-1');
    expect(buildAdminAuditUrl({ tab: 'performance', runId: 'perf-1' }))
      .toBe('/admin?tab=performance&run_id=perf-1');
    expect(buildAdminAuditUrl({ tab: 'events' })).toBe('/admin?tab=events');
    expect(buildAdminAuditUrl({ tab: 'users', userId: 'unsafe\nvalue' })).toBe('/admin');
  });
});
