import { describe, it, expect } from 'vitest';
import {
  isRetryAttempt,
  isSummaryStep,
  getLimitReachedBannerText,
} from './timelineDerive';
import type { AgentStepState, ToolCallState, LimitReachedReason } from '@/types/agentRun';

const tc = (over: Partial<ToolCallState>): ToolCallState => ({
  toolCallId: 'tc',
  toolName: 'web_search',
  arguments: {},
  status: 'success',
  startedAt: 0,
  ...over,
});

describe('timelineDerive — retry heuristic', () => {
  it('同 step + 同 toolName + 同 query + 前 failed 后 success → 后者是 retry', () => {
    const tcs: ToolCallState[] = [
      tc({ toolCallId: 't1', toolName: 'web_search', arguments: { query: 'x' }, status: 'failed' }),
      tc({ toolCallId: 't2', toolName: 'web_search', arguments: { query: 'x' }, status: 'success' }),
    ];
    expect(isRetryAttempt(tcs[1], tcs)).toBe(true);
    expect(isRetryAttempt(tcs[0], tcs)).toBe(false);
  });

  it('同 toolName 但 query 不同 → 不算 retry', () => {
    const tcs: ToolCallState[] = [
      tc({ toolCallId: 't1', toolName: 'web_search', arguments: { query: 'x' }, status: 'failed' }),
      tc({ toolCallId: 't2', toolName: 'web_search', arguments: { query: 'y' }, status: 'success' }),
    ];
    expect(isRetryAttempt(tcs[1], tcs)).toBe(false);
  });

  it('url_read 用 url 比较', () => {
    const tcs: ToolCallState[] = [
      tc({ toolCallId: 't1', toolName: 'url_read', arguments: { url: 'https://a' }, status: 'failed' }),
      tc({ toolCallId: 't2', toolName: 'url_read', arguments: { url: 'https://a' }, status: 'success' }),
    ];
    expect(isRetryAttempt(tcs[1], tcs)).toBe(true);
  });

  it('前 success 后 failed → 不是 retry', () => {
    const tcs: ToolCallState[] = [
      tc({ toolCallId: 't1', toolName: 'web_search', arguments: { query: 'x' }, status: 'success' }),
      tc({ toolCallId: 't2', toolName: 'web_search', arguments: { query: 'x' }, status: 'failed' }),
    ];
    expect(isRetryAttempt(tcs[1], tcs)).toBe(false);
  });

  it('三连 fail / fail / success → 最后 success 仍识别为 retry', () => {
    const tcs: ToolCallState[] = [
      tc({ toolCallId: 't1', toolName: 'web_search', arguments: { query: 'x' }, status: 'failed' }),
      tc({ toolCallId: 't2', toolName: 'web_search', arguments: { query: 'x' }, status: 'failed' }),
      tc({ toolCallId: 't3', toolName: 'web_search', arguments: { query: 'x' }, status: 'success' }),
    ];
    expect(isRetryAttempt(tcs[2], tcs)).toBe(true);
  });

  it('同 step 不同工具不算 retry', () => {
    const tcs: ToolCallState[] = [
      tc({ toolCallId: 't1', toolName: 'web_search', arguments: { query: 'x' }, status: 'failed' }),
      tc({ toolCallId: 't2', toolName: 'url_read', arguments: { url: 'https://x' }, status: 'success' }),
    ];
    expect(isRetryAttempt(tcs[1], tcs)).toBe(false);
  });

  it('tc 不在 allInStep（idx === -1）时返回 false', () => {
    const tcs: ToolCallState[] = [
      tc({ toolCallId: 't1', toolName: 'web_search', arguments: { query: 'x' }, status: 'failed' }),
    ];
    const orphan = tc({ toolCallId: 't_orphan', toolName: 'web_search', arguments: { query: 'x' }, status: 'success' });
    expect(isRetryAttempt(orphan, tcs)).toBe(false);
  });
});

describe('timelineDerive — isSummaryStep', () => {
  const step = (over: Partial<AgentStepState>): AgentStepState => ({
    stepId: 's',
    stepNumber: 1,
    status: 'completed',
    toolCalls: [],
    contentBlockIds: [],
    startedAt: 0,
    ...over,
  });

  it('completed + 0 toolCalls + 有 contentBlockIds → 是 summary', () => {
    expect(isSummaryStep(step({ status: 'completed', toolCalls: [], contentBlockIds: ['blk_1'] }))).toBe(true);
  });

  it('toolCalls.length > 0 → 不是 summary（即使其它条件满足）', () => {
    expect(isSummaryStep(step({ status: 'completed', toolCalls: [tc({})], contentBlockIds: ['blk_1'] }))).toBe(false);
  });

  it('running + 0 toolCalls 不是 summary（LLM 还在决定要不要调工具）', () => {
    expect(isSummaryStep(step({ status: 'running', toolCalls: [], contentBlockIds: [] }))).toBe(false);
  });

  it('completed + 0 toolCalls + 0 contentBlockIds 不是 summary（异常 case）', () => {
    expect(isSummaryStep(step({ status: 'completed', toolCalls: [], contentBlockIds: [] }))).toBe(false);
  });

  it('failed + 0 toolCalls 不是 summary（异常终态没产出）', () => {
    expect(isSummaryStep(step({ status: 'failed', toolCalls: [], contentBlockIds: [] }))).toBe(false);
  });
});

describe('timelineDerive — getLimitReachedBannerText', () => {
  it.each(['max_steps', 'max_tool_calls'] as const)(
    '%s 使用统一的普通用户文案且不泄露内部限制',
    reason => {
      const t = getLimitReachedBannerText(reason);
      const rendered = `${t.title} ${t.sub}`;

      expect(t.title).toBe('本次检索已达到安全上限');
      expect(t.sub).toBe('当前结果可能未完整覆盖你的问题，可以继续查找。');
      expect(rendered).not.toMatch(/max_steps|max_tool_calls|最大步数|工具调用|停止规划|停止调工具|工具预算|\b8\b|\b20\b/);
    },
  );

  it('timeout 使用普通用户文案且不泄露内部时限', () => {
    const t = getLimitReachedBannerText('timeout');
    const rendered = `${t.title} ${t.sub}`;

    expect(t.title).toBe('本次检索用时较长，已结束当前检索');
    expect(t.sub).toBe('当前结果可能未完整覆盖你的问题，可以继续查找。');
    expect(rendered).not.toMatch(/timeout|300|运行超时|停止规划|工具预算/);
  });

  it('未知 reason 使用安全兜底文案', () => {
    const t = getLimitReachedBannerText('unknown' as LimitReachedReason);
    expect(t).toEqual({
      title: '本次检索已达到安全上限',
      sub: '当前结果可能未完整覆盖你的问题，可以继续查找。',
    });
  });
});
