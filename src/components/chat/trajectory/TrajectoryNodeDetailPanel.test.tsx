import i18n from '@/lib/i18n';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import type { TrajectoryNodeDetailResponse, TrajectorySpan } from '@/types/trajectory';

const getTrajectoryToolNodeDetailMock = vi.hoisted(() => vi.fn());
const getTrajectoryLlmNodeDetailMock = vi.hoisted(() => vi.fn());
const getTrajectorySystemPromptNodeDetailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryLlmNodeDetail: getTrajectoryLlmNodeDetailMock,
  getTrajectoryToolNodeDetail: getTrajectoryToolNodeDetailMock,
  getTrajectorySystemPromptNodeDetail: getTrajectorySystemPromptNodeDetailMock,
}));

import { TrajectoryNodeDetailPanel } from './TrajectoryNodeDetailPanel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function toolCell(toolCallId = 'tool-1'): Extract<TrajectoryCell, { type: 'tool' }> {
  return {
    key: `run:run-1:tool:${toolCallId}`,
    type: 'tool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [3, 4],
    toolCallId,
    stepId: 'step-1',
    toolName: 'web_search',
    status: 'success',
    events: [],
  };
}

function attemptCell(
  toolAttemptId = 'attempt-1',
  attemptIndex = 1,
  toolCallId = 'tool-1',
): Extract<TrajectoryCell, { type: 'subtool' }> {
  return {
    key: `run:run-1:subtool:${toolAttemptId}`,
    type: 'subtool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [5],
    toolCallId,
    toolAttemptId,
    toolName: 'web_search',
    attemptIndex,
    status: 'success',
    events: [],
  };
}

function llmCell(): Extract<TrajectoryCell, { type: 'assistant_request' }> {
  return {
    key: 'run:run-1:llm:round-1',
    type: 'assistant_request',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [1, 2, 3],
    llmRoundId: 'round-1',
    roundIndex: 1,
    requestIndex: 4,
    model: 'deepseek-chat',
    provider: 'deepseek',
    status: 'success',
    reasoningPreview: '先分析项目结构。',
    outputPreview: '项目结构清晰。',
    inputTokens: 100,
    outputTokens: 40,
    reasoningTokens: 24,
    durationMs: 800,
    ttftMs: 90,
    detailAvailable: true,
    events: [],
  };
}

function runCell(): Extract<TrajectoryCell, { type: 'run' }> {
  return {
    key: 'run:run-1',
    type: 'run',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['run-summary'],
    sourceSequences: [],
    summarySource: 'run-summary',
    attemptIndex: 1,
    runStatus: 'completed',
    totalSteps: 1,
    totalToolCalls: 1,
    startedAt: '2026-08-27T00:00:00.000Z',
    endedAt: '2026-08-27T00:00:01.000Z',
    isSelected: true,
    isHydrated: true,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'run-summary', reason: null },
    capabilityResolution: {
      schema_version: 1,
      router_version: '2026-08-27.1',
      package_id: 'weather',
      confidence: 'high',
      resolution_mode: 'routed',
      reason_codes: ['explicit_weather_request'],
      external_tool_names: ['weather_forecast'],
      effective_plan_mode: 'off',
      include_current_date: true,
      network_boundary_required: false,
      bundle_fingerprint: `sha256:${'a'.repeat(64)}`,
    },
    records: [],
    spans: [],
    liveTail: [],
  };
}

function userCell(): Extract<TrajectoryCell, { type: 'user' }> {
  return {
    key: 'message:user:user-1',
    type: 'user',
    runId: null,
    userMessageId: 'user-1',
    assistantMessageId: null,
    completenessSources: ['message'],
    sourceSequences: [],
    message: {
      id: 'user-1',
      role: 'user',
      sequence: 7,
      timestamp: Date.parse('2026-08-25T05:00:00.000Z'),
      chatId: 'conversation-private-state',
      content: [
        {
          id: 'text-1',
          type: 'text',
          text: '# 用户需求\n\n请检查 `Preview` 与 **Raw**。',
        },
        {
          id: 'file-1',
          type: 'file',
          file_id: 'private-file-id',
          filename: '需求说明.pdf',
          mime_type: 'application/pdf',
          thumbnail_url: 'https://signed.example/private-token',
        },
      ],
    },
  };
}

function messageCell(): Extract<TrajectoryCell, { type: 'message' }> {
  return {
    key: 'message:assistant:assistant-1',
    type: 'message',
    runId: null,
    userMessageId: null,
    assistantMessageId: 'assistant-1',
    completenessSources: ['message'],
    sourceSequences: [],
    message: {
      id: 'assistant-1',
      role: 'assistant',
      sequence: 8,
      timestamp: Date.parse('2026-08-25T05:01:00.000Z'),
      chatId: 'conversation-private-state',
      model_id: 'deepseek-chat',
      usage: {
        input_tokens: 120,
        output_tokens: 60,
      },
      content: [
        {
          id: 'thinking-1',
          type: 'thinking',
          thinking: '不要在最终消息重复的思考',
        },
        {
          id: 'search-1',
          type: 'search',
          query: '不应出现在最终回答 Raw 的搜索',
          sources: [],
        },
        {
          id: 'url-1',
          type: 'url_read',
          url: 'https://example.com/internal-evidence',
        },
        {
          id: 'knowledge-1',
          type: 'knowledge_evidence',
          schema_version: 1,
          query: '不应出现在最终回答 Raw 的知识库检索',
          status: 'success',
          source_count: 0,
          knowledge_base_ids: [],
          source_refs: [],
        },
        {
          id: 'text-1',
          type: 'text',
          text: '# 最终回答\n\n这是 **最终正文**。',
        },
      ],
    },
  };
}

function attemptSpan(toolAttemptId = 'attempt-1'): TrajectorySpan {
  return {
    span_id: `tool_attempt:${toolAttemptId}`,
    kind: 'tool_attempt',
    name: toolAttemptId,
    parent_span_id: 'tool:tool-1',
    start_sequence: 5,
    end_sequence: 5,
    started_at: '2026-08-23T00:00:01.100Z',
    ended_at: '2026-08-23T00:00:01.140Z',
    duration_ms: 40,
    status: 'completed',
    terminal_source: 'recorded',
    inferred_reason: null,
    ttft_ms: null,
    record_sequences: [5],
  };
}

function detail(
  status: TrajectoryNodeDetailResponse['status'],
  overrides: Partial<TrajectoryNodeDetailResponse> = {},
): TrajectoryNodeDetailResponse {
  return {
    status,
    node_type: 'tool',
    available_sections: status === 'available'
      ? ['summary', 'payload', 'result', 'timing']
      : ['summary', 'timing'],
    detail: status === 'available'
      ? {
        tool_call_id: 'tool-1',
        tool_name: 'web_search',
        status: 'completed',
        duration_ms: 80,
        payload: { queryText: '上海天气' },
        result: { temperatureC: 28 },
        error: null,
      }
      : null,
    redacted_fields: [],
    truncated_fields: [],
    reason: status === 'available' ? null : `detail ${status}`,
    ...overrides,
  };
}

function renderPanel(
  cell: TrajectoryCell | null = toolCell(),
  relatedCells: readonly TrajectoryCell[] = [],
) {
  return render(
    <TrajectoryNodeDetailPanel
      conversationId="conversation-1"
      cell={cell}
      span={null}
      relatedCells={relatedCells}
    />,
  );
}

describe('TrajectoryNodeDetailPanel', () => {
  beforeEach(() => {
    getTrajectoryLlmNodeDetailMock.mockReset();
    getTrajectoryToolNodeDetailMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('保持同一 Run Detail 打开时切换语言会重算能力路由字段', async () => {
    await i18n.changeLanguage('zh-CN');
    renderPanel(runCell());
    const summary = screen.getByRole('tabpanel', { name: '摘要' });
    expect(within(summary).getByText('能力包')).toBeInTheDocument();
    expect(within(summary).getByText('天气 · weather')).toBeInTheDocument();
    expect(within(summary).getByText('高')).toBeInTheDocument();
    expect(within(summary).getByText('已路由')).toBeInTheDocument();
    expect(within(summary).getByText('关闭')).toBeInTheDocument();

    await act(async () => i18n.changeLanguage('en-US'));

    expect(within(summary).getByText('Capability package')).toBeInTheDocument();
    expect(within(summary).getByText('Weather · weather')).toBeInTheDocument();
    expect(within(summary).getByText('High')).toBeInTheDocument();
    expect(within(summary).getByText('Routed')).toBeInTheDocument();
    expect(within(summary).getByText('Initial external tools for Run')).toBeInTheDocument();
    expect(within(summary).getByText('Off')).toBeInTheDocument();
    expect(within(summary).getByText('Router version')).toBeInTheDocument();
    expect(within(summary).getByText('Capability bundle fingerprint')).toBeInTheDocument();
    expect(within(summary).queryByText('能力包')).not.toBeInTheDocument();
  });

  it('初始 Tool 与非 Tool 都只显示本地 Summary，点击 Payload 后才请求且 Result 复用响应', async () => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('available'));
    const { rerender } = renderPanel();

    const panel = screen.getByRole('complementary', { name: '轨迹节点详情' });
    expect(panel).toHaveClass('min-h-full');
    expect(panel).not.toHaveClass('h-full');
    expect(within(panel).getByRole('tabpanel', { name: '摘要' })).toHaveTextContent('工具调用');
    expect(within(panel).getByRole('tabpanel', { name: '摘要' })).toHaveTextContent('来源工具 · 搜索');
    expect(getTrajectoryToolNodeDetailMock).not.toHaveBeenCalled();

    expect(within(panel).getByRole('button', { name: '查看完整载荷' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '查看完整结果' })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: '查看完整载荷' }));
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1));
    expect(await within(panel).findByText(/"queryText": "上海天气"/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('tab', { name: '结果' }));
    expect(await within(panel).findByText(/"temperatureC": 28/)).toBeInTheDocument();
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);

    rerender(
      <TrajectoryNodeDetailPanel conversationId="conversation-1" cell={attemptCell()} span={null} />,
    );
    expect(within(panel).queryByRole('tab', { name: '载荷' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('tab', { name: '摘要' })).toHaveAttribute('aria-selected', 'true');
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);
  });

  it('LLM Request 用 Preview 组合思考与输出，Raw 复用同一份安全详情', async () => {
    getTrajectoryLlmNodeDetailMock.mockResolvedValue({
      status: 'available',
      node_type: 'llm',
      available_sections: ['summary', 'thinking', 'output', 'timing'],
      detail: {
        llm_round_id: 'round-1',
        reasoning_text: '先读取项目结构，再检查关键实现。',
        output_text: '项目整体结构清晰。',
      },
      redacted_fields: [],
      truncated_fields: [],
      reason: null,
    });
    renderPanel(llmCell());

    expect(screen.getByRole('heading', { name: 'Request #4' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      '摘要',
      '预览',
      '原始',
    ]);
    expect(screen.queryByRole('tab', { name: '思考' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '输出' })).not.toBeInTheDocument();
    const summaryPanel = screen.getByRole('tabpanel', { name: '摘要' });
    expect(summaryPanel).toHaveTextContent('deepseek · deepseek-chat');
    expect(summaryPanel).toHaveTextContent('输入 Token100 tok');
    expect(summaryPanel).toHaveTextContent('输出 Token40 tok');
    expect(summaryPanel).toHaveTextContent('推理 Token24 tok');
    expect(summaryPanel).toHaveTextContent('来源Request #4');
    expect(summaryPanel).toHaveTextContent('请求计时');
    expect(summaryPanel).toHaveTextContent('总耗时800 毫秒');
    expect(summaryPanel).toHaveTextContent('首次输出90 毫秒');
    expect(summaryPanel).not.toHaveTextContent('先分析项目结构');
    expect(within(summaryPanel).queryByRole('button', { name: '查看完整预览' }))
      .not.toBeInTheDocument();
    expect(getTrajectoryLlmNodeDetailMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: '预览' }));
    expect(await screen.findByRole('heading', { name: '思考过程' })).toBeInTheDocument();
    expect(await screen.findByText('先读取项目结构，再检查关键实现。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '模型输出' })).toBeInTheDocument();
    expect(screen.getByText('项目整体结构清晰。')).toBeInTheDocument();
    expect(getTrajectoryLlmNodeDetailMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: '原始' }));
    const raw = screen.getByRole('tabpanel', { name: '原始' });
    expect(raw).toHaveTextContent('"llm_round_id": "round-1"');
    expect(raw).toHaveTextContent('"reasoning_text": "先读取项目结构，再检查关键实现。"');
    expect(raw).toHaveTextContent('"output_text": "项目整体结构清晰。"');
    expect(getTrajectoryLlmNodeDetailMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tab', { name: '载荷' })).not.toBeInTheDocument();
  });

  it('LLM capability 未启用时保留生命周期摘要，但不渲染正文页签或兼容文案', () => {
    renderPanel({ ...llmCell(), detailAvailable: false });

    expect(screen.getByRole('heading', { name: 'Request #4' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '预览' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '原始' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '计时' })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: '摘要' })).toHaveTextContent('请求计时');
    expect(screen.queryByRole('button', { name: '查看完整预览' })).not.toBeInTheDocument();
    expect(screen.queryByText(/尚未记录模型正文/)).not.toBeInTheDocument();
    expect(getTrajectoryLlmNodeDetailMock).not.toHaveBeenCalled();
  });

  it('用户节点提供摘要、预览、原始和来源四层信息，不再显示无意义的计时页签', () => {
    renderPanel(userCell());

    const panel = screen.getByRole('complementary', { name: '轨迹节点详情' });
    expect(within(panel).getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      '摘要',
      '预览',
      '原始',
      '来源',
    ]);
    expect(within(panel).queryByRole('tab', { name: '计时' })).not.toBeInTheDocument();
    const summary = within(panel).getByRole('tabpanel', { name: '摘要' });
    expect(summary).toHaveTextContent('来源用户');
    expect(summary).toHaveTextContent('消息序号#7');
    expect(summary).not.toHaveTextContent('请检查 Preview 与 Raw');
    expect(within(summary).queryByRole('button', { name: '查看完整预览' }))
      .not.toBeInTheDocument();
    expect(within(summary).queryByText('摘要', { selector: 'dt' })).not.toBeInTheDocument();
  });

  it('用户 Preview 使用安全 Markdown 展示完整正文和附件摘要', () => {
    renderPanel(userCell());

    fireEvent.click(screen.getByRole('tab', { name: '预览' }));
    const preview = screen.getByRole('tabpanel', { name: '预览' });
    expect(within(preview).getByRole('heading', { name: '用户需求' })).toBeInTheDocument();
    expect(within(preview).getByText('Preview')).toBeInTheDocument();
    expect(within(preview).getByText('Raw')).toBeInTheDocument();
    expect(within(preview).getByText('需求说明.pdf')).toBeInTheDocument();
    expect(within(preview).getByText('application/pdf')).toBeInTheDocument();
  });

  it('用户 Raw 保留原始 Block 内容但不暴露文件凭据，Source 只展示消息来源字段', () => {
    renderPanel(userCell());

    fireEvent.click(screen.getByRole('tab', { name: '原始' }));
    const raw = screen.getByRole('tabpanel', { name: '原始' });
    expect(within(raw).getByText('Block #1 · text')).toBeInTheDocument();
    expect(within(raw).getByText(/# 用户需求/)).toBeInTheDocument();
    expect(within(raw).getByText('Block #2 · file')).toBeInTheDocument();
    expect(within(raw).getByText(/"filename": "需求说明.pdf"/)).toBeInTheDocument();
    expect(raw).not.toHaveTextContent('private-file-id');
    expect(raw).not.toHaveTextContent('private-token');

    fireEvent.click(screen.getByRole('tab', { name: '来源' }));
    const source = screen.getByRole('tabpanel', { name: '来源' });
    expect(source).toHaveTextContent('"kind": "user"');
    expect(source).toHaveTextContent('"messageId": "user-1"');
    expect(source).toHaveTextContent('"sequence": 7');
    expect(source).not.toHaveTextContent('conversation-private-state');
  });

  it('最终回答节点提供摘要、预览、原始和来源，但不重复中间思考或显示计时页签', () => {
    renderPanel(messageCell());

    const panel = screen.getByRole('complementary', { name: '轨迹节点详情' });
    expect(within(panel).getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      '摘要',
      '预览',
      '原始',
      '来源',
    ]);
    const summary = within(panel).getByRole('tabpanel', { name: '摘要' });
    expect(summary).toHaveTextContent('来源助手');
    expect(summary).toHaveTextContent('消息序号#8');
    expect(summary).toHaveTextContent('模型deepseek-chat');
    expect(summary).toHaveTextContent('输入 Token120 tok');
    expect(summary).toHaveTextContent('输出 Token60 tok');
    expect(within(summary).queryByText('最终正文')).not.toBeInTheDocument();
    expect(within(summary).queryByRole('button', { name: '查看完整预览' }))
      .not.toBeInTheDocument();
    expect(within(summary).queryByText('摘要', { selector: 'dt' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('tab', { name: '计时' })).not.toBeInTheDocument();
  });

  it('最终回答 Preview 只展示最终正文，Raw 排除 ThinkingBlock，Source 不泄露会话私有字段', () => {
    renderPanel(messageCell());

    fireEvent.click(screen.getByRole('tab', { name: '预览' }));
    const preview = screen.getByRole('tabpanel', { name: '预览' });
    expect(within(preview).getByRole('heading', { name: '最终回答' })).toBeInTheDocument();
    expect(within(preview).getByText('最终正文')).toBeInTheDocument();
    expect(preview).not.toHaveTextContent('不要在最终消息重复的思考');

    fireEvent.click(screen.getByRole('tab', { name: '原始' }));
    const raw = screen.getByRole('tabpanel', { name: '原始' });
    expect(raw).toHaveTextContent('# 最终回答');
    expect(raw).not.toHaveTextContent('不要在最终消息重复的思考');
    expect(raw).not.toHaveTextContent('thinking');
    expect(raw).not.toHaveTextContent('search');
    expect(raw).not.toHaveTextContent('url_read');
    expect(raw).not.toHaveTextContent('knowledge_evidence');
    expect(raw).not.toHaveTextContent('internal-evidence');

    fireEvent.click(screen.getByRole('tab', { name: '来源' }));
    const source = screen.getByRole('tabpanel', { name: '来源' });
    expect(source).toHaveTextContent('"kind": "assistant"');
    expect(source).toHaveTextContent('"modelId": "deepseek-chat"');
    expect(source).toHaveTextContent('"sequence": 8');
    expect(source).not.toHaveTextContent('conversation-private-state');
  });

  it('逻辑 Tool 显示 sibling attempt 总数，Attempt 自身只显示自己的序号且没有远端页签', () => {
    const firstAttempt = attemptCell('attempt-1', 1);
    const secondAttempt = attemptCell('attempt-2', 2);
    const unrelatedAttempt = attemptCell('attempt-other', 4, 'tool-other');
    const { rerender } = renderPanel(toolCell(), [firstAttempt, secondAttempt, unrelatedAttempt]);

    expect(screen.getByText('尝试次数')).toBeInTheDocument();
    expect(screen.getByText('2 次')).toBeInTheDocument();

    rerender(
      <TrajectoryNodeDetailPanel
        conversationId="conversation-1"
        cell={secondAttempt}
        span={attemptSpan('attempt-2')}
        relatedCells={[firstAttempt, secondAttempt, unrelatedAttempt]}
      />,
    );
    expect(screen.getByText('尝试')).toBeInTheDocument();
    expect(screen.getByText('第 2 次')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '载荷' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '结果' })).not.toBeInTheDocument();
    expect(getTrajectoryToolNodeDetailMock).not.toHaveBeenCalled();

    rerender(
      <TrajectoryNodeDetailPanel
        conversationId="conversation-1"
        cell={secondAttempt}
        span={attemptSpan('attempt-other')}
        relatedCells={[firstAttempt, secondAttempt, unrelatedAttempt]}
      />,
    );
    expect(screen.queryByText('尝试')).not.toBeInTheDocument();
    expect(screen.queryByText('第 2 次')).not.toBeInTheDocument();
  });

  it('切换 Tool 会 abort 旧请求、隔离迟到结果，并让新节点重新从零请求开始', async () => {
    const requestA = deferred<TrajectoryNodeDetailResponse>();
    const requestB = deferred<TrajectoryNodeDetailResponse>();
    let signalA: AbortSignal | undefined;
    getTrajectoryToolNodeDetailMock
      .mockImplementationOnce((_: string, __: string, ___: string, signal: AbortSignal) => {
        signalA = signal;
        return requestA.promise;
      })
      .mockReturnValueOnce(requestB.promise);
    const { rerender } = renderPanel(toolCell('tool-a'));

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1));
    rerender(
      <TrajectoryNodeDetailPanel
        conversationId="conversation-1"
        cell={toolCell('tool-b')}
        span={null}
      />,
    );

    expect(signalA?.aborted).toBe(true);
    expect(screen.getByRole('tab', { name: '摘要' })).toHaveAttribute('aria-selected', 'true');
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      requestA.resolve(detail('available', {
        detail: { ...detail('available').detail!, payload: { latePayload: 'A' } },
      }));
      await requestA.promise;
    });
    expect(screen.queryByText(/latePayload/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      requestB.resolve(detail('available', {
        detail: { ...detail('available').detail!, payload: { currentPayload: 'B' } },
      }));
      await requestB.promise;
    });
    expect(await screen.findByText(/"currentPayload": "B"/)).toBeInTheDocument();
  });

  it('available 独立校验 section 与实体字段，并展示脱敏字段名', async () => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('available', {
      available_sections: ['summary', 'payload', 'timing'],
      detail: { ...detail('available').detail!, result: { shouldNotRender: true } },
      redacted_fields: ['payload.apiKey', 'result.accessToken'],
    }));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    expect(await screen.findByText(/"queryText": "上海天气"/)).toBeInTheDocument();
    expect(screen.getByText('部分字段已脱敏')).toBeInTheDocument();
    expect(screen.getByText('payload.apiKey')).toBeInTheDocument();
    expect(screen.getByText('result.accessToken')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '结果' }));
    expect(screen.getByText('该部分未提供')).toBeInTheDocument();
    expect(screen.queryByText(/shouldNotRender/)).not.toBeInTheDocument();
  });

  it.each([
    ['not_recorded', '该运行生成时尚未记录 Payload/Result'],
    ['degraded', '运行已结束，但工具详情未能精确关联'],
  ] as const)('%s 与本地 Summary 保持独立并显示确定性文案', async (status, message) => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail(status));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '结果' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '摘要' }));
    expect(screen.getByRole('tabpanel', { name: '摘要' })).toHaveTextContent('工具调用');
    expect(screen.queryByText('轨迹降级')).not.toBeInTheDocument();
  });

  it('网络失败不冒充 degraded，并提供键盘可用的手动重试', async () => {
    getTrajectoryToolNodeDetailMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(detail('available'));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('加载工具详情失败，请稍后重试');
    expect(screen.queryByText(/精确关联/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText(/"queryText": "上海天气"/)).toBeInTheDocument();
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(2);
  });

  it('pending 每秒自动重试且同时受 7 次请求上限约束，手动检查开启新窗口', async () => {
    vi.useFakeTimers();
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('pending'));
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await act(async () => Promise.resolve());
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 6; index += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(7);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(7);
    expect(screen.getByRole('status')).toHaveTextContent('详情仍在落账');
    expect(screen.getByText('自动检查已停止')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新检查' }));
    await act(async () => Promise.resolve());
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(8);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(9);
  });

  it('pending 首次响应接近 monotonic deadline 时不再越界发起自动请求', async () => {
    vi.useFakeTimers();
    const firstRequest = deferred<TrajectoryNodeDetailResponse>();
    getTrajectoryToolNodeDetailMock.mockReturnValue(firstRequest.promise);
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(6_500));
    await act(async () => {
      firstRequest.resolve(detail('pending'));
      await firstRequest.promise;
    });

    expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByText('自动检查已停止')).toBeInTheDocument();
  });

  it('切换到本地页签与卸载都会清理 pending timer', async () => {
    vi.useFakeTimers();
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('pending'));
    const { unmount } = renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '结果' }));
    await act(async () => Promise.resolve());
    expect(vi.getTimerCount()).toBe(1);

    fireEvent.click(screen.getByRole('tab', { name: '计时' }));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: '载荷' }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tabs 支持 Arrow/Home/End，诊断信息默认折叠且默认区域不裸露内部 ID', () => {
    getTrajectoryToolNodeDetailMock.mockResolvedValue(detail('available'));
    renderPanel();
    const panel = screen.getByRole('complementary', { name: '轨迹节点详情' });
    const summaryTab = within(panel).getByRole('tab', { name: '摘要' });

    expect(within(panel).getByRole('group', { name: '诊断信息' })).not.toHaveAttribute('open');
    expect(within(panel).getByText('run-1')).not.toBeVisible();
    expect(within(panel).getByText('tool-1')).not.toBeVisible();
    expect(within(panel).getByText('step-1')).not.toBeVisible();

    summaryTab.focus();
    fireEvent.keyDown(summaryTab, { key: 'End' });
    expect(within(panel).getByRole('tab', { name: '计时' })).toHaveFocus();
    expect(within(panel).getByRole('tab', { name: '计时' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(within(panel).getByRole('tab', { name: '计时' }), { key: 'Home' });
    expect(summaryTab).toHaveFocus();
    fireEvent.keyDown(summaryTab, { key: 'ArrowRight' });
    expect(within(panel).getByRole('tab', { name: '载荷' })).toHaveFocus();
  });

  it('空选择显示稳定说明', () => {
    renderPanel(null);

    expect(screen.getByRole('complementary', { name: '轨迹节点详情' }))
      .toHaveTextContent('选择一条记录查看详情');
    expect(getTrajectoryToolNodeDetailMock).not.toHaveBeenCalled();
  });
});


function systemPromptCell(runId = 'run-1', status = 'ready'): Extract<TrajectoryCell, { type: 'context' }> {
  return {
    key: 'prompt', type: 'context', runId, userMessageId: null, assistantMessageId: null,
    completenessSources: ['durable-snapshot'], sourceSequences: [1], contextId: 'system_prompt', eventType: 'system_prompt_prepared',
    payload: { status, source: 'code', template_version: 'v-test', section_ids: ['base', 'tools'], fingerprint: 'a'.repeat(64), char_count: 123, duration_ms: 7, prompt: '事件中夹带的正文不能显示' },
  };
}

function systemPromptDetail(
  overrides: Partial<TrajectoryNodeDetailResponse> = {},
): TrajectoryNodeDetailResponse {
  return {
    status: 'available',
    node_type: 'system_prompt',
    available_sections: ['summary', 'prompt'],
    detail: {
      template_version: 'v-test',
      fingerprint: 'a'.repeat(64),
      char_count: 123,
      sections: [
        { section_id: 'z-base', content: '  # 原样标题\n\n<policy>不改写 **规则**</policy>\n' },
        { section_id: 'a-tools', content: '后段第一行\r\n第二行  ' },
      ],
    },
    redacted_fields: [],
    truncated_fields: [],
    reason: null,
    ...overrides,
  };
}

describe('系统提示词正文', () => {
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeTextMock = vi.fn();

  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
    getTrajectorySystemPromptNodeDetailMock.mockReset();
    writeTextMock.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('默认进入正文，按响应原顺序保留全部字符与换行，并以双换行拼接复制全文', async () => {
    const request = deferred<TrajectoryNodeDetailResponse>();
    getTrajectorySystemPromptNodeDetailMock.mockReturnValue(request.promise);
    renderPanel(systemPromptCell());

    expect(screen.getByRole('heading', { name: 'Run 初始系统提示词' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '正文' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('正在加载详情');
    expect(getTrajectorySystemPromptNodeDetailMock).toHaveBeenCalledWith(
      'conversation-1', 'run-1', expect.any(AbortSignal),
    );
    await act(async () => request.resolve(systemPromptDetail()));

    const body = screen.getByRole('tabpanel', { name: '正文' });
    expect(screen.getByText(
      '这是 Run 创建时保存的初始系统提示词；后续模型请求可能追加语言、修复、研究或总结规则。',
    )).toBeInTheDocument();
    const sections = body.querySelectorAll('pre');
    expect(Array.from(sections, section => section.textContent)).toEqual([
      '  # 原样标题\n\n<policy>不改写 **规则**</policy>\n',
      '后段第一行\r\n第二行  ',
    ]);
    expect(screen.queryByRole('heading', { name: '原样标题' })).not.toBeInTheDocument();
    expect(screen.queryByText('事件中夹带的正文不能显示')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '复制全文' }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith(
      '  # 原样标题\n\n<policy>不改写 **规则**</policy>\n\n\n后段第一行\r\n第二行  ',
    ));
    expect(await screen.findByRole('button', { name: '已复制全文' })).toBeInTheDocument();
  });

  it.each(['ready', 'failed'])('%s 保留摘要元数据与计时，不从事件载荷回填正文', async status => {
    getTrajectorySystemPromptNodeDetailMock.mockResolvedValue(systemPromptDetail({
      status: 'not_recorded', detail: null, reason: 'system_prompt_not_recorded',
    }));
    renderPanel(systemPromptCell('run-1', status));
    expect(await screen.findByText('该运行生成时未记录系统提示词正文')).toBeInTheDocument();
    expect(screen.queryByText('事件中夹带的正文不能显示')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '摘要' }));
    expect(screen.getByText(
      status === 'ready' ? 'Run 初始系统提示词已组装' : 'Run 初始系统提示词组装失败',
    )).toBeInTheDocument();
    expect(screen.getByText('v-test')).toBeInTheDocument();
    expect(screen.getByText('base · tools')).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '计时' }));
    expect(screen.getByText('7 毫秒')).toBeInTheDocument();
  });

  it('重新挂载从服务器恢复正文，不复用上次挂载的正文缓存', async () => {
    getTrajectorySystemPromptNodeDetailMock
      .mockResolvedValueOnce(systemPromptDetail())
      .mockResolvedValueOnce(systemPromptDetail({ detail: {
        template_version: 'v-test', fingerprint: 'b'.repeat(64), char_count: 10,
        sections: [{ section_id: 'base', content: '重新读取的完整正文' }],
      } }));
    const { unmount } = renderPanel(systemPromptCell());
    expect(await screen.findByText('z-base')).toBeInTheDocument();
    unmount();
    renderPanel(systemPromptCell());

    expect(await screen.findByText('重新读取的完整正文')).toBeInTheDocument();
    expect(screen.queryByText('z-base')).not.toBeInTheDocument();
    expect(getTrajectorySystemPromptNodeDetailMock).toHaveBeenCalledTimes(2);
  });

  it('相同节点 key 切换 Run 时取消旧请求，迟到响应不能覆盖当前正文', async () => {
    const requestA = deferred<TrajectoryNodeDetailResponse>();
    const requestB = deferred<TrajectoryNodeDetailResponse>();
    getTrajectorySystemPromptNodeDetailMock
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise);
    const { rerender } = renderPanel(systemPromptCell('run-a'));
    const signalA = getTrajectorySystemPromptNodeDetailMock.mock.calls[0]?.[2] as AbortSignal;
    rerender(<TrajectoryNodeDetailPanel conversationId="conversation-1" cell={systemPromptCell('run-b')} span={null} />);

    expect(signalA?.aborted).toBe(true);
    expect(getTrajectorySystemPromptNodeDetailMock).toHaveBeenLastCalledWith(
      'conversation-1', 'run-b', expect.any(AbortSignal),
    );
    await act(async () => requestB.resolve(systemPromptDetail({ detail: {
      template_version: 'v-test', fingerprint: 'b'.repeat(64), char_count: 8,
      sections: [{ section_id: 'base', content: '当前 Run 正文' }],
    } })));
    await act(async () => requestA.resolve(systemPromptDetail()));

    expect(screen.getByText('当前 Run 正文')).toBeInTheDocument();
    expect(screen.queryByText('z-base')).not.toBeInTheDocument();
  });

  it('切换 Run 后立即清除已经显示的旧正文', async () => {
    const nextRequest = deferred<TrajectoryNodeDetailResponse>();
    getTrajectorySystemPromptNodeDetailMock
      .mockResolvedValueOnce(systemPromptDetail())
      .mockReturnValueOnce(nextRequest.promise);
    const { rerender } = renderPanel(systemPromptCell('run-a'));
    expect(await screen.findByText('z-base')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '摘要' }));
    rerender(<TrajectoryNodeDetailPanel conversationId="conversation-1" cell={systemPromptCell('run-b')} span={null} />);

    expect(screen.getByRole('tab', { name: '正文' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('z-base')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载详情');
  });

  it('切换到其他节点会取消正文请求，迟到正文不会出现在其他节点', async () => {
    const request = deferred<TrajectoryNodeDetailResponse>();
    getTrajectorySystemPromptNodeDetailMock.mockReturnValue(request.promise);
    const { rerender } = renderPanel(systemPromptCell());
    const signal = getTrajectorySystemPromptNodeDetailMock.mock.calls[0]?.[2] as AbortSignal;
    rerender(<TrajectoryNodeDetailPanel conversationId="conversation-1" cell={toolCell()} span={null} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve(systemPromptDetail()));

    expect(screen.queryByRole('tab', { name: '正文' })).not.toBeInTheDocument();
    expect(screen.queryByText('z-base')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '摘要' })).toHaveAttribute('aria-selected', 'true');
  });

  it.each([toolCell(), llmCell(), userCell(), messageCell(), {
    ...systemPromptCell(), eventType: 'context_prepared', contextId: 'context',
  }, null])('无关节点 $type 不请求系统提示词正文', cell => {
    renderPanel(cell);
    expect(getTrajectorySystemPromptNodeDetailMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: '正文' })).not.toBeInTheDocument();
  });

  it('正文加载错误可手动重试，成功后恢复正文', async () => {
    getTrajectorySystemPromptNodeDetailMock
      .mockRejectedValueOnce(new Error('请求失败'))
      .mockResolvedValueOnce(systemPromptDetail());
    renderPanel(systemPromptCell());
    expect(await screen.findByRole('alert')).toHaveTextContent('加载系统提示词正文失败，请稍后重试');
    expect(screen.queryByText('该运行生成时未记录系统提示词正文')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText('z-base')).toBeInTheDocument();
    expect(getTrajectorySystemPromptNodeDetailMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['not_recorded', 'system_prompt_not_recorded', '该运行生成时未记录系统提示词正文'],
    ['degraded', 'system_prompt_assembly_failed', '系统提示词组装失败，未生成正文'],
    ['degraded', 'system_prompt_detail_missing', '系统提示词正文未能完整记录'],
    ['degraded', 'system_prompt_detail_invalid', '系统提示词正文记录无效，暂时无法展示'],
  ] as const)('%s / %s 显示对应空态且不允许复制未记录的正文', async (status, reason, message) => {
    getTrajectorySystemPromptNodeDetailMock.mockResolvedValue(systemPromptDetail({ status, reason, detail: null }));
    renderPanel(systemPromptCell());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制全文' })).not.toBeInTheDocument();
    expect(screen.queryByText('事件中夹带的正文不能显示')).not.toBeInTheDocument();
  });

  it('正文 pending 沿用有界检查，落账后自动显示完整正文', async () => {
    vi.useFakeTimers();
    getTrajectorySystemPromptNodeDetailMock
      .mockResolvedValueOnce(systemPromptDetail({ status: 'pending', detail: null, reason: 'system_prompt_detail_settling' }))
      .mockResolvedValueOnce(systemPromptDetail());
    renderPanel(systemPromptCell());
    await act(async () => Promise.resolve());
    expect(screen.getByRole('status')).toHaveTextContent('系统提示词正文仍在记录');
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(screen.getByText('z-base')).toBeInTheDocument();
    expect(getTrajectorySystemPromptNodeDetailMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('复制失败保持完整正文并明确提示，不伪装已复制', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('拒绝剪贴板权限'));
    getTrajectorySystemPromptNodeDetailMock.mockResolvedValue(systemPromptDetail());
    renderPanel(systemPromptCell());
    fireEvent.click(await screen.findByRole('button', { name: '复制全文' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('复制失败，请手动选择正文');
    expect(screen.queryByRole('button', { name: '已复制全文' })).not.toBeInTheDocument();
    expect(screen.getByText('z-base')).toBeInTheDocument();
  });
});
