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
  it('max_steps 文案', () => {
    const t = getLimitReachedBannerText('max_steps', 8);
    expect(t.title).toContain('最大步数');
    expect(t.title).toContain('8');
  });

  it('max_tool_calls 文案', () => {
    const t = getLimitReachedBannerText('max_tool_calls', 20);
    expect(t.title).toContain('工具调用');
  });

  it('timeout 文案', () => {
    const t = getLimitReachedBannerText('timeout', 300);
    expect(t.title).toContain('超时');
  });

  it('未知 reason 兜底', () => {
    const t = getLimitReachedBannerText('unknown' as LimitReachedReason, 0);
    expect(t.title).toBeTruthy();
  });
});
