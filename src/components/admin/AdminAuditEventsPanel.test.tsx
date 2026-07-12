import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ getAdminAuditEvents: vi.fn() }));
vi.mock('@/lib/api/adminAudit', () => apiMocks);

import AdminAuditEventsPanel from './AdminAuditEventsPanel';

const page = {
  total: 3, page: 1, page_size: 25, total_pages: 1, has_next: false, has_prev: false,
  items: [
    {
      id: 'event-11111111-1111-1111-1111-111111111111',
      admin_user_id: 'admin-22222222-2222-2222-2222-222222222222',
      admin_snapshot: { username: 'ops-admin', email_masked: 'o***@example.com' },
      action: 'admin.audit.conversation.view', resource_type: 'conversation',
      resource_id: 'conv-33333333-3333-3333-3333-333333333333',
      target_user_id: 'user-44444444-4444-4444-4444-444444444444',
      target_user: {
        id: 'user-44444444-4444-4444-4444-444444444444', username: 'target-user',
        nickname: '目标昵称', email_masked: 't***@example.com',
      },
      request_id: 'req-55555555-5555-5555-5555-555555555555',
      reason: '排查用户反馈', metadata: { source: 'admin-ui', unknown_secret: '不得展示' }, created_at: '2026-07-12T00:00:00Z',
    },
    {
      id: 'event-missing', admin_user_id: '', admin_snapshot: null,
      action: 'future.private.action', resource_type: 'future_private_resource',
      resource_id: null, target_user_id: 'user-deleted-00000000-0000-0000-0000-12345678', target_user: null,
      request_id: null, reason: '   ', metadata: null,
      created_at: '2026-07-12T01:00:00Z',
    },
    {
      id: 'event-legacy', admin_user_id: 'admin-legacy', admin_snapshot: { username: 'legacy' },
      action: 'admin.audit.user.view', resource_type: 'user', resource_id: 'user-resource',
      target_user_id: 'user-legacy-00000000-0000-0000-0000-87654321',
      request_id: null, reason: null, metadata: {}, created_at: '2026-07-12T02:00:00Z',
    },
  ],
};

describe('AdminAuditEventsPanel', () => {
  beforeEach(() => apiMocks.getAdminAuditEvents.mockReset().mockResolvedValue(page));

  it('主表只展示紧凑中文摘要，完整标识与理由进入展开详情', async () => {
    render(<AdminAuditEventsPanel onForbidden={vi.fn()} />);

    const admin = await screen.findByLabelText('审计管理员 event-11111111-1111-1111-1111-111111111111');
    expect(admin).toHaveTextContent('@ops-admin');
    expect(admin).not.toHaveTextContent('o***@example.com');
    expect(screen.getByLabelText('审计操作 event-11111111-1111-1111-1111-111111111111')).toHaveTextContent('查看对话详情');
    const object = screen.getByLabelText('审计对象 event-11111111-1111-1111-1111-111111111111');
    expect(object).toHaveTextContent('对话');
    expect(object).toHaveTextContent('当前用户：目标昵称 @target-user');
    expect(object).not.toHaveTextContent('t***@example.com');
    expect(object).not.toHaveTextContent('user-44444444-4444-4444-4444-444444444444');
    expect(admin.closest('table')).toHaveClass('min-w-[860px]');

    const trigger = screen.getByRole('button', { name: '查看审计详情 event-11111111-1111-1111-1111-111111111111' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '审计事件详情' });
    const details = within(dialog).getByLabelText('审计详情 event-11111111-1111-1111-1111-111111111111');
    expect(details).toHaveTextContent('event-11111111-1111-1111-1111-111111111111');
    expect(details).toHaveTextContent('admin-22222222-2222-2222-2222-222222222222');
    expect(details).toHaveTextContent('conv-33333333-3333-3333-3333-333333333333');
    expect(details).toHaveTextContent('user-44444444-4444-4444-4444-444444444444');
    expect(details).toHaveTextContent('目标用户当前身份目标昵称 @target-user');
    expect(details).not.toHaveTextContent('t***@example.com');
    expect(details).toHaveTextContent('req-55555555-5555-5555-5555-555555555555');
    expect(details).toHaveTextContent('admin.audit.conversation.view');
    expect(details).toHaveTextContent('排查用户反馈');
    expect(details).toHaveTextContent('admin-ui');
    expect(details).not.toHaveTextContent('不得展示');
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭审计详情' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('缺失管理员和目标信息安全降级，未知原始值不进入主表', async () => {
    render(<AdminAuditEventsPanel onForbidden={vi.fn()} />);
    const admin = await screen.findByLabelText('审计管理员 event-missing');
    expect(admin).toHaveTextContent('管理员信息未记录');
    const action = screen.getByLabelText('审计操作 event-missing');
    expect(action).toHaveTextContent('其他管理操作');
    expect(action).not.toHaveTextContent('future.private.action');
    const missingObject = screen.getByLabelText('审计对象 event-missing');
    expect(missingObject).toHaveTextContent('其他访问对象');
    expect(missingObject).toHaveTextContent('用户记录已不存在（…12345678）');
    fireEvent.click(screen.getByRole('button', { name: '查看审计详情 event-missing' }));
    const missingDetail = within(await screen.findByRole('dialog', { name: '审计事件详情' })).getByLabelText('审计详情 event-missing');
    expect(missingDetail).toHaveTextContent('目标用户当前身份用户记录已不存在');
    expect(missingDetail).toHaveTextContent('user-deleted-00000000-0000-0000-0000-12345678');
    expect(screen.queryByText('访问理由')).toBeNull();
  });

  it('旧响应缺少 target_user 字段时使用短 ID 兜底且不误称当前身份', async () => {
    render(<AdminAuditEventsPanel onForbidden={vi.fn()} />);
    const object = await screen.findByLabelText('审计对象 event-legacy');
    expect(object).toHaveTextContent('用户');
    expect(object).toHaveTextContent('目标用户：…87654321（旧记录）');
    expect(object).not.toHaveTextContent('user-legacy-00000000-0000-0000-0000-87654321');
    fireEvent.click(screen.getByRole('button', { name: '查看审计详情 event-legacy' }));
    expect(within(await screen.findByRole('dialog', { name: '审计事件详情' })).getByLabelText('审计详情 event-legacy')).toHaveTextContent('目标用户当前身份旧审计记录未包含身份');
  });

  it('表格提供 caption、列作用域且详情层不会撑宽表格', async () => {
    render(<AdminAuditEventsPanel onForbidden={vi.fn()} />);
    const table = await screen.findByRole('table', { name: '管理员访问审计记录' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
    within(table).getAllByRole('columnheader').forEach(header => expect(header).toHaveAttribute('scope', 'col'));
    fireEvent.click(within(table).getByRole('button', { name: '查看审计详情 event-missing' }));
    expect(await screen.findByRole('dialog', { name: '审计事件详情' })).toBeInTheDocument();
    expect(table.querySelector('.min-w-\\[420px\\]')).toBeNull();
  });

  it('访问审计主表和详情任何位置都不展示管理员或目标用户邮箱', async () => {
    render(<AdminAuditEventsPanel onForbidden={vi.fn()} />);
    await screen.findByRole('table', { name: '管理员访问审计记录' });
    expect(screen.queryByText('o***@example.com')).toBeNull();
    expect(screen.queryByText('t***@example.com')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看审计详情 event-11111111-1111-1111-1111-111111111111' }));
    await screen.findByRole('dialog', { name: '审计事件详情' });
    expect(screen.queryByText('o***@example.com')).toBeNull();
    expect(screen.queryByText('t***@example.com')).toBeNull();
  });
});
