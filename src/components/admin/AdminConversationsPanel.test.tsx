import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
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
const noop = () => undefined;

function ControlledConversationsPanel({
  userIdFilter, onUserFilterChange = noop,
}: { userIdFilter?: string; onUserFilterChange?: (userId?: string) => void }) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  return (
    <AdminConversationsPanel
      onForbidden={noop}
      userIdFilter={userIdFilter}
      onUserFilterChange={onUserFilterChange}
      selectedConversationId={selectedConversationId}
      onOpen={setSelectedConversationId}
      onBack={() => setSelectedConversationId(null)}
    />
  );
}

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
    render(<ControlledConversationsPanel />);

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

  it('对话单元格展示更新时间和创建时间，全部缺失时显示时间未记录且保持紧凑宽度', async () => {
    apiMocks.getAdminConversations.mockResolvedValue({
      ...emptyPage,
      items: [
        {
          ...conversations[0],
          created_at: '2026-07-11T09:30:00Z',
          updated_at: '2026-07-12T02:15:00Z',
        },
        conversations[1],
      ],
      total: 2,
      total_pages: 1,
    });

    render(<ControlledConversationsPanel />);

    const firstTime = await screen.findByLabelText('对话时间 conv-1');
    expect(firstTime).toHaveTextContent('更新：2026/7/12 10:15:00（北京时间）');
    expect(firstTime).toHaveTextContent('创建：2026/7/11 17:30:00（北京时间）');
    expect(firstTime.textContent?.indexOf('更新：')).toBeLessThan(firstTime.textContent?.indexOf('创建：') ?? 0);

    const secondTime = screen.getByLabelText('对话时间 conv-2');
    expect(secondTime).toHaveTextContent('时间未记录');
    expect(firstTime.closest('td')).toHaveTextContent('对话 1');
    expect(firstTime.closest('table')).toHaveClass('min-w-[1100px]');
    expect(firstTime.closest('table')).not.toHaveClass('min-w-[1400px]');
  });

  it('Agent runs 与 tool calls 使用独立页码和请求', async () => {
    render(<ControlledConversationsPanel />);
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
    const { rerender } = render(<ControlledConversationsPanel userIdFilter="user-alpha" />);

    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-alpha' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-alpha');

    rerender(<ControlledConversationsPanel userIdFilter="user-beta" />);
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'user-beta' }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('用户 ID')).toHaveValue('user-beta');
  });

  it('手动应用用户 ID 时通知路由同步最新筛选', async () => {
    const onUserFilterChange = vi.fn();
    render(<ControlledConversationsPanel userIdFilter="user-a" onUserFilterChange={onUserFilterChange} />);
    await screen.findByText('对话 1');

    fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: '  user-b  ' } });
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));

    expect(onUserFilterChange).toHaveBeenCalledWith('user-b');
    await waitFor(() => expect(apiMocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'user-b' }),
      expect.any(AbortSignal),
    ));
  });
});
