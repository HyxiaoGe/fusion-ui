import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAdminConversations: vi.fn(),
  getAdminConversation: vi.fn(),
  getAdminConversationMessages: vi.fn(),
  getAdminConversationToolCalls: vi.fn(),
  getAdminConversationAgentRuns: vi.fn(),
  getAdminConversationFiles: vi.fn(),
}));

vi.mock('@/lib/api/adminAudit', () => apiMocks);

import AdminConversationsPanel from './AdminConversationsPanel';

const emptyPage = {
  items: [], total: 0, page: 1, page_size: 25, total_pages: 0, has_next: false, has_prev: false,
};

const conversations = ['alpha', 'beta'].map((username, index) => ({
  id: `conv-${index + 1}`,
  title: `对话 ${index + 1}`,
  user: { id: `user-${username}`, username, nickname: '同名用户', email_masked: 's***@example.com' },
  model_id: 'gpt-5', message_count: 1, tool_call_count: 1, file_count: 0,
  latest_agent_status: 'completed', input_tokens: 1, output_tokens: 2,
  created_at: null, updated_at: null,
}));

describe('AdminConversationsPanel', () => {
  beforeEach(() => {
    apiMocks.getAdminConversations.mockReset().mockResolvedValue({
      ...emptyPage, items: conversations, total: 2, total_pages: 1,
    });
    apiMocks.getAdminConversation.mockReset().mockResolvedValue(conversations[0]);
    apiMocks.getAdminConversationMessages.mockReset().mockResolvedValue(emptyPage);
    apiMocks.getAdminConversationFiles.mockReset().mockResolvedValue(emptyPage);
    apiMocks.getAdminConversationAgentRuns.mockReset().mockImplementation((_id, query) => Promise.resolve({
      ...emptyPage,
      page: query.page,
      total: 26,
      total_pages: 2,
      items: [{
        id: `run-page-${query.page}`, message_id: null, user_id: 'user-alpha', status: 'completed',
        model_id: 'gpt-5', provider: 'openai', total_steps: 0, total_tool_calls: 0,
        total_duration_ms: 100, limit_reason: null, config: null, error: null,
        created_at: null, progress: null, steps: [],
      }],
    }));
    apiMocks.getAdminConversationToolCalls.mockReset().mockImplementation((_id, query) => Promise.resolve({
      ...emptyPage,
      page: query.page,
      total: 26,
      total_pages: 2,
      items: [{
        id: `tool-page-${query.page}`, message_id: null, trace_id: null, step_number: null,
        tool_name: `tool_${query.page}`, status: 'success', duration_ms: 10,
        model_id: null, provider: null, arguments: {}, result_preview: {}, error: null,
        redacted_fields: [], created_at: null,
      }],
    }));
  });

  it('列表与详情在身份碰撞时仍展示昵称、username 和 user_id', async () => {
    render(<AdminConversationsPanel onForbidden={vi.fn()} />);

    await screen.findByText('对话 1');
    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('@beta')).toBeInTheDocument();
    expect(screen.getByText('user-alpha')).toBeInTheDocument();
    expect(screen.getByText('user-beta')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看对话详情 conv-1' }));

    const detail = await screen.findByLabelText('对话详情 conv-1');
    expect(detail).toHaveTextContent('同名用户');
    expect(detail).toHaveTextContent('@alpha');
    expect(detail).toHaveTextContent('user-alpha');
    expect(detail).toHaveTextContent('s***@example.com');
  });

  it('Agent runs 与 tool calls 使用独立页码和请求', async () => {
    render(<AdminConversationsPanel onForbidden={vi.fn()} />);
    await screen.findByText('对话 1');
    fireEvent.click(screen.getByRole('button', { name: '查看对话详情 conv-1' }));

    const runsSection = await screen.findByLabelText('Agent 运行记录');
    const toolsSection = await screen.findByLabelText('工具调用记录');
    expect(within(runsSection).getByText('run-page-1')).toBeInTheDocument();
    expect(within(toolsSection).getByText('tool_1')).toBeInTheDocument();

    fireEvent.click(within(runsSection).getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(apiMocks.getAdminConversationAgentRuns).toHaveBeenCalledTimes(2));
    expect(apiMocks.getAdminConversationToolCalls).toHaveBeenCalledTimes(1);
    expect(apiMocks.getAdminConversationAgentRuns.mock.calls[1][1]).toMatchObject({ page: 2, page_size: 25 });
    expect(await within(runsSection).findByText('run-page-2')).toBeInTheDocument();

    fireEvent.click(within(toolsSection).getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(apiMocks.getAdminConversationToolCalls).toHaveBeenCalledTimes(2));
    expect(apiMocks.getAdminConversationAgentRuns).toHaveBeenCalledTimes(2);
    expect(apiMocks.getAdminConversationToolCalls.mock.calls[1][1]).toMatchObject({ page: 2, page_size: 25 });
    expect(await within(toolsSection).findByText('tool_2')).toBeInTheDocument();
  });

  it('外部用户 ID 同时同步到筛选输入和实际列表请求', async () => {
    const { rerender } = render(<AdminConversationsPanel onForbidden={vi.fn()} userIdFilter="user-alpha" />);

    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-alpha' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-alpha');

    rerender(<AdminConversationsPanel onForbidden={vi.fn()} userIdFilter="user-beta" />);
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'user-beta' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-beta');
  });
});
