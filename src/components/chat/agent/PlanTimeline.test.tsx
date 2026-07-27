import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentPlanItem, AgentPlanState, AgentRunState } from '@/types/agentRun';
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

function createRun(
  items: AgentPlanItem[],
  runOverrides: Partial<AgentRunState> = {},
  planOverrides: Partial<AgentPlanState> = {},
): AgentRunState {
  return {
    ...baseRun,
    ...runOverrides,
    plan: {
      planId: 'plan-r1',
      revision: 1,
      ...planOverrides,
      items,
    },
  };
}

function openPlanByClick(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /查看计划流程/ }));
  return screen.getByRole('dialog', { name: '计划流程详情' });
}

describe('PlanTimeline', () => {
  it('没有 plan items 时不渲染', () => {
    const { container } = render(<PlanTimeline run={baseRun} />);
    expect(container.firstChild).toBeNull();
  });

  it('默认只显示紧凑环形进度、完成数和当前步骤', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'search',
        title: '搜索资料',
        status: 'completed',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
      {
        id: 'answer',
        title: '整理行程建议',
        status: 'running',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ])} />);

    const trigger = screen.getByRole('button', {
      name: '查看计划流程，已完成 1/2，当前步骤：整理行程建议',
    });
    const progress = screen.getByRole('progressbar', { name: '计划完成进度' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('整理行程建议')).toBeInTheDocument();
    expect(screen.queryByText('搜索资料')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '2');
    expect(progress).toHaveAttribute('aria-valuetext', '已完成 1/2 个步骤');
    expect(screen.getByTestId('plan-progress-value')).toHaveAttribute('stroke-dashoffset', '50');
  });

  it('计划部分失败并结束后展示终态摘要，不把失败步骤标成当前步骤', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'outbound-flight',
        title: '查询去程航班',
        status: 'failed',
        kind: 'other',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'outbound-train',
        title: '查询去程高铁',
        status: 'completed',
        kind: 'other',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'return-flight',
        title: '查询返程航班',
        status: 'failed',
        kind: 'other',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'return-train',
        title: '查询返程高铁',
        status: 'completed',
        kind: 'other',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'weather',
        title: '查询天气',
        status: 'completed',
        kind: 'other',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'answer',
        title: '整理行程建议',
        status: 'completed',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ], {
      status: 'completed',
    }, {
      source: 'model',
    })} />);

    expect(screen.getByRole('button', {
      name: '查看计划流程，计划已结束，已完成 4/6，2 项失败',
    })).toBeInTheDocument();
    expect(screen.getByText('计划已结束')).toBeInTheDocument();
    expect(screen.getByText('2 项失败')).toBeInTheDocument();
    expect(screen.queryByText('当前步骤')).not.toBeInTheDocument();
    expect(screen.queryByText('查询去程航班')).not.toBeInTheDocument();
  });

  it('计划全部完成后展示完成终态', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'research',
        title: '查询资料',
        status: 'completed',
        kind: 'search',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'answer',
        title: '整理回答',
        status: 'completed',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ], {
      status: 'completed',
    }, {
      source: 'model',
    })} />);

    expect(screen.getByRole('button', {
      name: '查看计划流程，计划已完成 2/2',
    })).toBeInTheDocument();
    expect(screen.getByText('计划已完成')).toBeInTheDocument();
    expect(screen.getByText('全部步骤已完成')).toBeInTheDocument();
    expect(screen.queryByText('当前步骤')).not.toBeInTheDocument();
  });

  it('计划被中断后展示停止终态并保留完成进度', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'research',
        title: '查询资料',
        status: 'completed',
        kind: 'search',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'answer',
        title: '整理回答',
        status: 'pending',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ], {
      status: 'interrupted',
    }, {
      source: 'model',
    })} />);

    expect(screen.getByRole('button', {
      name: '查看计划流程，计划已停止，已完成 1/2',
    })).toBeInTheDocument();
    expect(screen.getByText('计划已停止')).toBeInTheDocument();
    expect(screen.getByText('已保留完成结果')).toBeInTheDocument();
    expect(screen.queryByText('当前步骤')).not.toBeInTheDocument();
  });

  it('运行中的直接回答计划只展示实际步骤，不补造搜索或读取', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'understand',
        title: '制定执行计划',
        status: 'running',
        kind: 'reasoning',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'answer',
        title: '整理回答',
        status: 'pending',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ])} />);

    const dialog = openPlanByClick();
    expect(within(dialog).getByText('制定执行计划')).toBeInTheDocument();
    expect(within(dialog).getByText('整理回答')).toBeInTheDocument();
    expect(within(dialog).queryByText('搜索')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('阅读')).not.toBeInTheDocument();
  });

  it('点击后在不占正文布局的浮层展示步骤、类型和标题化依赖，不暴露内部工具名', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'research',
        title: '收集出行信息',
        status: 'completed',
        kind: 'search',
        summary: '调用 web_search 和 url_read',
        toolNames: ['web_search'],
        evidenceItemIds: [],
        plannedTools: ['web_search', 'url_read'],
      },
      {
        id: 'compare',
        title: '比较候选方案',
        status: 'running',
        kind: 'synthesis',
        toolNames: ['route_compare'],
        evidenceItemIds: [],
        dependsOn: ['research'],
        plannedTools: ['route_compare'],
      },
    ], {}, { mode: 'on', source: 'model' })} />);

    const dialog = openPlanByClick();

    expect(screen.getByRole('button', { name: /查看计划流程/ })).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveClass('absolute');
    expect(within(dialog).getByText('收集出行信息')).toBeInTheDocument();
    expect(within(dialog).getByText('比较候选方案')).toBeInTheDocument();
    expect(within(dialog).getByText('搜索')).toBeInTheDocument();
    expect(within(dialog).getByText('整理')).toBeInTheDocument();
    expect(within(dialog).getByText('依赖：收集出行信息')).toBeInTheDocument();
    expect(within(dialog).queryByText(/web_search|url_read|route_compare/)).not.toBeInTheDocument();
  });

  it('鼠标悬停可临时展开，离开后收起', () => {
    render(<PlanTimeline run={createRun([{
      id: 'answer',
      title: '整理回答',
      status: 'running',
      kind: 'answer',
      toolNames: [],
      evidenceItemIds: [],
    }])} />);

    const overview = screen.getByTestId('plan-overview');
    fireEvent.mouseEnter(overview);
    expect(screen.getByRole('dialog', { name: '计划流程详情' })).toBeInTheDocument();

    fireEvent.mouseLeave(overview);
    expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
  });

  it('键盘 focus 可临时展开，焦点离开后收起', () => {
    render(<PlanTimeline run={createRun([{
      id: 'answer',
      title: '整理回答',
      status: 'running',
      kind: 'answer',
      toolNames: [],
      evidenceItemIds: [],
    }])} />);

    const trigger = screen.getByRole('button', { name: /查看计划流程/ });
    fireEvent.focus(trigger);
    expect(screen.getByRole('dialog', { name: '计划流程详情' })).toBeInTheDocument();

    fireEvent.blur(trigger, { relatedTarget: document.body });
    expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
  });

  it('点击可固定浮层，再次点击收起', () => {
    render(<PlanTimeline run={createRun([{
      id: 'answer',
      title: '整理回答',
      status: 'running',
      kind: 'answer',
      toolNames: [],
      evidenceItemIds: [],
    }])} />);

    const trigger = screen.getByRole('button', { name: /查看计划流程/ });
    const overview = screen.getByTestId('plan-overview');
    fireEvent.click(trigger);
    fireEvent.mouseLeave(overview);
    expect(screen.getByRole('dialog', { name: '计划流程详情' })).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
  });

  it('流程浮层为运行、完成、阻塞、失败和跳过提供克制且可区分的颜色语义', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'pending',
        title: '等待开始',
        status: 'pending',
        kind: 'reasoning',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'running',
        title: '正在处理',
        status: 'running',
        kind: 'search',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'completed',
        title: '已经完成',
        status: 'completed',
        kind: 'read',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'blocked',
        title: '等待条件',
        status: 'blocked',
        kind: 'other',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'failed',
        title: '执行失败',
        status: 'failed',
        kind: 'synthesis',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'skipped',
        title: '无需执行',
        status: 'skipped',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ], {}, { source: 'model' })} />);

    openPlanByClick();

    expect(screen.getByTestId('plan-status-running')).toHaveClass('text-info', 'bg-info-bg/60');
    expect(screen.getByTestId('plan-status-completed')).toHaveClass('text-success', 'bg-success-bg/60');
    expect(screen.getByTestId('plan-status-blocked')).toHaveClass('text-warn', 'bg-warn-bg/60');
    expect(screen.getByTestId('plan-status-failed')).toHaveClass('text-danger', 'bg-danger-bg/60');
    expect(screen.getByTestId('plan-status-skipped')).toHaveClass('text-muted-foreground', 'bg-muted/50');
    expect(screen.getByTestId('plan-status-running').querySelector('svg')).toHaveClass(
      'animate-spin',
      'motion-reduce:animate-none',
    );
  });

  it('浮层限制视口宽高且动效支持 prefers-reduced-motion', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'running',
        title: '正在处理',
        status: 'running',
        kind: 'search',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'answer',
        title: '整理回答',
        status: 'pending',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ])} />);

    const dialog = openPlanByClick();

    expect(screen.getByTestId('plan-overview')).toHaveClass('max-w-full');
    expect(dialog).toHaveClass(
      'w-[min(22rem,calc(100vw-2rem))]',
      'max-w-[calc(100vw-2rem)]',
      'max-h-[min(26rem,calc(100vh-2rem))]',
      'overflow-y-auto',
      'motion-reduce:animate-none',
    );
    expect(screen.getByTestId('plan-progress-value')).toHaveClass('motion-reduce:transition-none');
  });

  it('旧 observed plan 在终态仍归一化残留状态并展示紧凑总览', () => {
    render(<PlanTimeline run={createRun([
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
    ], {
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
    }, {
      source: 'observed',
    })} />);

    expect(screen.getByText('4/4')).toBeInTheDocument();
    openPlanByClick();
    expect(screen.getByTestId('plan-status-understand')).toHaveTextContent('已完成');
    expect(screen.getByTestId('plan-status-search')).toHaveTextContent('已完成');
    expect(screen.getByTestId('plan-status-read')).toHaveTextContent('已完成');
    expect(screen.getByTestId('plan-status-answer')).toHaveTextContent('已完成');
  });

  it('已达上限的 observed plan 根据真实读取证据收口残留运行态', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'understand',
        title: '理解问题',
        status: 'completed',
        kind: 'reasoning',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'search',
        title: '查找资料',
        status: 'completed',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: ['ev-read-1'],
      },
      {
        id: 'read',
        title: '读取关键来源',
        status: 'running',
        kind: 'read',
        summary: '正在整理关键来源',
        toolNames: ['url_read'],
        evidenceItemIds: ['ev-read-1'],
      },
      {
        id: 'answer',
        title: '整理回答',
        status: 'completed',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ], {
      status: 'limit_reached',
      limitReachedReason: 'max_steps',
      totalToolCalls: 3,
      evidence: [{
        id: 'ev-read-1',
        kind: 'web',
        status: 'read_success',
        title: '官方公告',
        claim: '已读取官方公告',
        usedByFinalAnswer: false,
      }],
      toolDigests: [{
        toolCallId: 'read-1',
        toolName: 'url_read',
        status: 'success',
        title: '网页读取完成',
        summary: '已读取网页内容',
        keyFindings: [],
        sourceRefs: ['ev-read-1'],
        truncated: false,
      }],
    })} />);

    openPlanByClick();
    expect(screen.getByTestId('plan-status-read')).toHaveTextContent('已完成');
    expect(screen.getByTestId('plan-status-read').querySelector('svg')).not.toHaveClass('animate-spin');
    expect(screen.queryByText('正在整理关键来源')).not.toBeInTheDocument();
  });

  it('已完成的模型计划严格展示服务端 item 终态', () => {
    render(<PlanTimeline run={createRun([{
      id: 'compare',
      title: '比较多个候选方案',
      status: 'running',
      kind: 'other',
      toolNames: [],
      evidenceItemIds: [],
      dependsOn: ['research'],
      plannedTools: ['route_compare'],
    }], {
      status: 'completed',
    }, {
      mode: 'on',
      source: 'model',
      reason: 'model_update',
    })} />);

    expect(screen.getByText('0/1')).toBeInTheDocument();
    openPlanByClick();
    expect(screen.getByTestId('plan-status-compare')).toHaveTextContent('进行中');
    expect(screen.getByTestId('plan-status-compare').querySelector('svg')).toHaveClass('animate-spin');
  });

  it('旧 observed plan 不把计划中的工具名称当成真实执行结果', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'search',
        title: '查找接口变更原因',
        status: 'completed',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
      {
        id: 'read',
        title: '筛选关键来源',
        status: 'pending',
        kind: 'read',
        toolNames: ['url_read'],
        evidenceItemIds: ['ev-missing'],
      },
    ], {
      status: 'completed',
    })} />);

    openPlanByClick();
    expect(screen.getByTestId('plan-status-search')).toHaveTextContent('已跳过');
    expect(screen.getByTestId('plan-status-read')).toHaveTextContent('已跳过');
    expect(screen.queryByText(/web_search|url_read/)).not.toBeInTheDocument();
  });
});
