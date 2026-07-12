import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';

const apiMocks = vi.hoisted(() => ({
  getAdminUsers: vi.fn(),
  getAdminUser: vi.fn(),
  getAdminConversations: vi.fn(),
  getAdminConversation: vi.fn(),
  getAdminConversationMessages: vi.fn(),
  getAdminConversationToolCalls: vi.fn(),
  getAdminConversationAgentRuns: vi.fn(),
  getAdminConversationFiles: vi.fn(),
  getAdminPerformanceRuns: vi.fn(),
  getAdminPerformanceRun: vi.fn(),
  getAdminAuditEvents: vi.fn(),
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);

import AdminAuditCenter from './AdminAuditCenter';

const emptyPage = {
  items: [], total: 0, page: 1, page_size: 25, total_pages: 0, has_next: false, has_prev: false,
};

describe('AdminAuditCenter', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach(mock => mock.mockReset().mockResolvedValue(emptyPage));
  });

  it('提供四个独立管理页签并默认加载用户列表', async () => {
    render(<AdminAuditCenter />);

    expect(screen.getByRole('tab', { name: '用户' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '压测' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '访问审计' })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.getAdminUsers).toHaveBeenCalled());
  });

  it('切换到对话页后加载全局对话，不读取普通聊天状态', async () => {
    apiMocks.getAdminConversations.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'conv-1', title: '压测会话', model_id: 'gpt-5', created_at: null, updated_at: null,
        user: { id: 'user-1', username: 'tester', nickname: null, email_masked: 't***@example.com' },
        message_count: 2, tool_call_count: 1, file_count: 0, input_tokens: 10, output_tokens: 20,
        latest_agent_status: 'completed',
      }],
    });
    render(<AdminAuditCenter initialTab="conversations" />);

    expect(await screen.findByText('压测会话')).toBeInTheDocument();
    expect(apiMocks.getAdminConversations).toHaveBeenCalled();
  });

  it('后端 403 时立即清空敏感内容并显示权限失效', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'user-1', username: 'secret-user', nickname: null, email_masked: 's***@example.com',
        is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
        conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
      }],
    });
    const { rerender } = render(<AdminAuditCenter />);
    expect(await screen.findByText('secret-user')).toBeInTheDocument();

    apiMocks.getAdminUsers.mockRejectedValue(new ApiError('FORBIDDEN', 'Forbidden', 'req-1'));
    fireEvent.click(screen.getByRole('button', { name: '刷新用户列表' }));
    rerender(<AdminAuditCenter />);

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByText('secret-user')).toBeNull();
  });

  it('敏感用户详情返回 403 时同样卸载并清空已加载列表', async () => {
    apiMocks.getAdminUsers.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        id: 'user-1', username: 'secret-user', nickname: null, email_masked: 's***@example.com',
        is_superuser: false, created_at: null, updated_at: null, last_active_at: null,
        conversation_count: 1, message_count: 2, tool_call_count: 3, input_tokens: 4, output_tokens: 5,
      }],
    });
    apiMocks.getAdminUser.mockRejectedValue(new ApiError('FORBIDDEN', '需要管理员权限', 'req-detail'));
    render(<AdminAuditCenter />);
    expect(await screen.findByText('secret-user')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByText('secret-user')).toBeNull();
  });

  it('压测详情返回 403 时卸载整个审计中心并清空压测列表', async () => {
    apiMocks.getAdminPerformanceRuns.mockResolvedValue({
      ...emptyPage,
      total: 1,
      total_pages: 1,
      items: [{
        run_id: 'perf-sensitive', environment: 'production', model_id: null, status: 'completed',
        schema_version: 2, started_at: null, finished_at: null, created_at: '2026-07-12T00:00:00Z',
      }],
    });
    apiMocks.getAdminPerformanceRun.mockRejectedValue(new ApiError('FORBIDDEN', '需要管理员权限', 'req-perf'));
    render(<AdminAuditCenter initialTab="performance" />);
    expect(await screen.findByText('perf-sensitive')).toBeInTheDocument();
    expect(screen.getByText('完整执行')).toBeInTheDocument();
    expect(screen.getByText(/模型未采集/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看压测详情 perf-sensitive' }));

    expect(await screen.findByText('管理员权限已失效')).toBeInTheDocument();
    expect(screen.queryByText('perf-sensitive')).toBeNull();
  });
});
