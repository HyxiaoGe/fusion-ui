import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import { PlanTimeline } from './PlanTimeline';

const baseRun: AgentRunState = {
  runId: 'r1',
  messageId: 'm1',
  status: 'running',
  config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
  totalSteps: 0,
  totalToolCalls: 0,
  steps: [],
  lastSequence: 1,
};

describe('PlanTimeline', () => {
  it('没有 plan items 时不渲染', () => {
    const { container } = render(<PlanTimeline run={baseRun} />);
    expect(container.firstChild).toBeNull();
  });

  it('渲染计划步骤、类型和摘要', () => {
    render(<PlanTimeline run={{
      ...baseRun,
      plan: {
        planId: 'plan-r1',
        revision: 1,
        items: [
          {
            id: 'search',
            title: '搜索资料',
            status: 'completed',
            kind: 'search',
            summary: '找到 2 条来源',
            toolNames: ['web_search'],
            evidenceItemIds: ['ev-1'],
          },
          {
            id: 'answer',
            title: '生成回答',
            status: 'running',
            kind: 'answer',
            toolNames: [],
            evidenceItemIds: [],
          },
        ],
      },
    }} />);

    expect(screen.getByText('搜索资料')).toBeInTheDocument();
    expect(screen.getByText('搜索')).toBeInTheDocument();
    expect(screen.getByText('找到 2 条来源')).toBeInTheDocument();
    expect(screen.getByText('生成回答')).toBeInTheDocument();
    expect(screen.getByText('回答')).toBeInTheDocument();
  });

  it('运行中的直接回答计划不展示搜索或读取步骤', () => {
    render(<PlanTimeline run={{
      ...baseRun,
      plan: {
        planId: 'plan-r1',
        revision: 1,
        items: [
          {
            id: 'understand',
            title: '制定执行计划',
            status: 'running',
            kind: 'reasoning',
            summary: '确认「你好啊，你是谁」的目标和回答结构',
            toolNames: [],
            evidenceItemIds: [],
          },
          {
            id: 'answer',
            title: '整理回答',
            status: 'pending',
            kind: 'answer',
            summary: '基于已有上下文直接回答，不使用联网工具',
            toolNames: [],
            evidenceItemIds: [],
          },
        ],
      },
    }} />);

    expect(screen.getByText('制定执行计划')).toBeInTheDocument();
    expect(screen.getByText('整理回答')).toBeInTheDocument();
    expect(screen.queryByText(/搜索/)).not.toBeInTheDocument();
    expect(screen.queryByText(/读取/)).not.toBeInTheDocument();
  });

  it('已完成 run 不展示历史 snapshot 中残留的 running/pending 状态', () => {
    const { container } = render(<PlanTimeline run={{
      ...baseRun,
      status: 'completed',
      totalToolCalls: 1,
      evidence: [{
        id: 'ev-1',
        kind: 'web',
        status: 'used',
        title: '官方来源',
        claim: '确认来源',
        usedByFinalAnswer: true,
      }],
      plan: {
        planId: 'plan-r1',
        revision: 1,
        items: [
          {
            id: 'understand',
            title: '理解问题',
            status: 'running',
            kind: 'reasoning',
            toolNames: [],
            evidenceItemIds: [],
          },
          {
            id: 'search',
            title: '查找资料',
            status: 'completed',
            kind: 'search',
            summary: '完成 0 个工具调用',
            toolNames: ['web_search'],
            evidenceItemIds: ['ev-1'],
          },
          {
            id: 'read',
            title: '读取关键来源',
            status: 'pending',
            kind: 'read',
            toolNames: [],
            evidenceItemIds: ['ev-1'],
          },
          {
            id: 'answer',
            title: '整理回答',
            status: 'pending',
            kind: 'answer',
            toolNames: [],
            evidenceItemIds: [],
          },
        ],
      },
    }} />);

    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelectorAll('svg.text-success')).toHaveLength(4);
    expect(screen.queryByText('完成 0 个工具调用')).not.toBeInTheDocument();
    expect(screen.getByText('完成 1 个工具调用')).toBeInTheDocument();
  });

  it('已完成 run 不把计划中的 toolNames 当成真实搜索或读取', () => {
    const { container } = render(<PlanTimeline run={{
      ...baseRun,
      status: 'completed',
      plan: {
        planId: 'plan-r1',
        revision: 1,
        items: [
          {
            id: 'search',
            title: '搜索：iPhone为什么要换USB-C接口',
            status: 'completed',
            kind: 'search',
            summary: '工具：联网搜索；预算：最多 4 次搜索，每次 3-10 条结果',
            toolNames: ['web_search'],
            evidenceItemIds: [],
          },
          {
            id: 'read',
            title: '筛选关键来源',
            status: 'pending',
            kind: 'read',
            summary: '必要时读取网页核验；预算：最多 5 个网页',
            toolNames: ['url_read'],
            evidenceItemIds: ['ev-missing'],
          },
        ],
      },
    }} />);

    expect(container.querySelectorAll('svg.text-success')).toHaveLength(0);
    expect(container.querySelectorAll('svg.text-muted-foreground')).toHaveLength(2);
  });
});
