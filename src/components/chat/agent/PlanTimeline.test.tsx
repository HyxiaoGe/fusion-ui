import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('默认只显示单一紧凑入口和当前计划步骤编号', () => {
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
      name: '查看计划流程，第 2/2 步：整理行程建议',
    });
    const progress = screen.getByRole('progressbar', { name: '计划完成进度' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('第 2/2 步');
    expect(trigger).toHaveTextContent('整理行程建议');
    expect(screen.queryByText('计划进度')).not.toBeInTheDocument();
    expect(screen.queryByText('当前步骤')).not.toBeInTheDocument();
    expect(screen.queryByText('搜索资料')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '2');
    expect(progress).toHaveAttribute('aria-valuetext', '已完成 1/2 个步骤');
    expect(screen.getByTestId('plan-progress-value')).toHaveAttribute('stroke-dashoffset', '50');
  });

  it('把并行搜索和读取任务汇总为三个顶层阶段，并保留阶段内任务', () => {
    const searchTasks: AgentPlanItem[] = [
      ['search-a', '搜索官方说明', 'completed'],
      ['search-b', '搜索社区反馈', 'completed'],
      ['search-c', '搜索性能数据', 'running'],
    ].map(([id, title, status]) => ({
      id,
      title,
      phaseId: 'phase-search-a',
      phaseTitle: '搜索并收集资料',
      status: status as AgentPlanItem['status'],
      kind: 'search',
      toolNames: ['web_search'],
      evidenceItemIds: [],
    }));
    const readTasks: AgentPlanItem[] = [
      ['read-a', '读取官方来源'],
      ['read-b', '读取独立来源'],
    ].map(([id, title]) => ({
      id,
      title,
      phaseId: 'phase-read-a',
      phaseTitle: '读取并核验关键来源',
      status: 'pending',
      kind: 'read',
      toolNames: ['url_read'],
      evidenceItemIds: [],
    }));
    const answer: AgentPlanItem = {
      id: 'answer',
      title: '综合证据并输出结论',
      phaseId: 'phase-answer',
      phaseTitle: '综合证据并输出结论',
      status: 'pending',
      kind: 'answer',
      toolNames: [],
      evidenceItemIds: [],
    };
    const { rerender } = render(<PlanTimeline run={createRun([
      ...searchTasks,
      ...readTasks,
      answer,
    ])} />);

    expect(screen.getByRole('button', {
      name: '查看计划流程，第 1/3 步：搜索并收集资料',
    })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '计划完成进度' })).toHaveAttribute('aria-valuemax', '3');
    const dialog = openPlanByClick();
    expect(within(dialog).getByText('搜索并收集资料')).toBeInTheDocument();
    expect(within(dialog).getByText('读取并核验关键来源')).toBeInTheDocument();
    expect(within(dialog).getByText('综合证据并输出结论')).toBeInTheDocument();
    expect(within(dialog).getByTestId('plan-task-search-a')).toHaveTextContent('搜索官方说明');
    expect(within(dialog).getByTestId('plan-task-search-b')).toHaveTextContent('搜索社区反馈');
    expect(within(dialog).getByTestId('plan-task-search-c')).toHaveTextContent('搜索性能数据');

    fireEvent.click(screen.getByRole('button', { name: /查看计划流程/ }));
    rerender(<PlanTimeline run={createRun([
      ...searchTasks.map(task => ({ ...task, status: 'completed' as const })),
      { ...readTasks[0], status: 'running' },
      readTasks[1],
      answer,
    ])} />);

    expect(screen.getByRole('button', {
      name: '查看计划流程，第 2/3 步：读取并核验关键来源',
    })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '计划完成进度' })).toHaveAttribute('aria-valuenow', '1');
  });

  it('深度研究 run 显示低干扰模式标签，普通 run 不显示', () => {
    const { rerender } = render(<PlanTimeline run={createRun([
      {
        id: 'research',
        title: '研究资料',
        status: 'running',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
    ], {
      config: {
        ...baseRun.config,
        taskMode: 'deep_research',
      },
    })} />);

    expect(screen.getByText('深度研究')).toHaveClass('text-info', 'bg-info-bg');

    rerender(<PlanTimeline run={createRun([
      {
        id: 'answer',
        title: '直接回答',
        status: 'running',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ])} />);

    expect(screen.queryByText('深度研究')).toBeNull();
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

  it('终态阶段内混合失败与未完成任务时优先显示失败且不保留进行中状态', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'search-a',
        title: '搜索官方说明',
        phaseId: 'phase-search',
        phaseTitle: '搜索并收集资料',
        status: 'completed',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
      {
        id: 'search-b',
        title: '搜索社区反馈',
        phaseId: 'phase-search',
        phaseTitle: '搜索并收集资料',
        status: 'failed',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
      {
        id: 'search-c',
        title: '搜索性能数据',
        phaseId: 'phase-search',
        phaseTitle: '搜索并收集资料',
        status: 'pending',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
    ], {
      status: 'completed',
    }, {
      source: 'model',
    })} />);

    expect(screen.getByRole('button', {
      name: '查看计划流程，计划已结束，已完成 0/1，1 项失败',
    })).toBeInTheDocument();
    const dialog = openPlanByClick();
    expect(within(dialog).getByTestId('plan-status-phase-search')).toHaveAttribute('title', '失败');
    expect(within(dialog).queryByTitle('进行中')).toBeNull();
  });

  it('运行态阶段内已完成与已跳过任务不会短暂显示为阻塞', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'search-a',
        title: '搜索官方说明',
        phaseId: 'phase-search',
        phaseTitle: '搜索并收集资料',
        status: 'completed',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
      {
        id: 'search-b',
        title: '搜索补充说明',
        phaseId: 'phase-search',
        phaseTitle: '搜索并收集资料',
        status: 'skipped',
        kind: 'search',
        toolNames: ['web_search'],
        evidenceItemIds: [],
      },
      {
        id: 'answer',
        title: '整理回答',
        phaseId: 'phase-answer',
        phaseTitle: '整理回答',
        status: 'running',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ])} />);

    expect(screen.getByRole('button', {
      name: '查看计划流程，第 2/2 步：整理回答',
    })).toBeInTheDocument();
    const dialog = openPlanByClick();
    expect(within(dialog).getByTestId('plan-status-phase-search')).toHaveAttribute('title', '已完成');
    expect(within(dialog).queryByTitle('已阻塞')).toBeNull();
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
    expect(screen.getByTestId('plan-progress-value')).toHaveClass('text-success');
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

  it('点击后通过 Portal 浮层只展示高层步骤状态与完整标题', () => {
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
    expect(dialog.closest('[data-radix-popper-content-wrapper]')?.parentElement).toBe(document.body);
    expect(dialog).toHaveClass('bg-popover');
    expect(within(dialog).getByText('收集出行信息')).toBeInTheDocument();
    expect(within(dialog).getByText('比较候选方案')).toBeInTheDocument();
    expect(within(dialog).queryByText('搜索')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('整理')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('依赖：收集出行信息')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/web_search|url_read|route_compare/)).not.toBeInTheDocument();
  });

  it('鼠标悬停可临时展开，离开后收起', async () => {
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
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
    });
  });

  it('键盘 focus 可临时展开，焦点离开后收起', async () => {
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
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
    });
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
      'w-[min(24rem,calc(100vw-2rem))]',
      'max-h-[min(26rem,calc(100vh-2rem))]',
      'overflow-y-auto',
      'motion-reduce:animate-none',
    );
    expect(screen.getByTestId('plan-progress-value')).toHaveClass('motion-reduce:transition-none');
  });

  it('completed 加 skipped 使用中性终态，跳过不计入完成进度', () => {
    render(<PlanTimeline run={createRun([
      {
        id: 'research',
        title: '核验关键资料',
        status: 'completed',
        kind: 'read',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'optional-1',
        title: '补充资料一',
        status: 'skipped',
        kind: 'search',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'optional-2',
        title: '补充资料二',
        status: 'skipped',
        kind: 'read',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'optional-3',
        title: '补充资料三',
        status: 'skipped',
        kind: 'synthesis',
        toolNames: [],
        evidenceItemIds: [],
      },
      {
        id: 'optional-4',
        title: '整理回答',
        status: 'skipped',
        kind: 'answer',
        toolNames: [],
        evidenceItemIds: [],
      },
    ], {
      status: 'completed',
    }, {
      source: 'model',
    })} />);

    const trigger = screen.getByRole('button', {
      name: '查看计划流程，完成 1/5，跳过 4',
    });
    expect(trigger).toHaveTextContent('完成 1/5');
    expect(trigger).toHaveTextContent('跳过 4');
    expect(trigger).not.toHaveTextContent('按需跳过');
    expect(screen.queryByText('部分步骤未完成')).not.toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: '计划完成进度' });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '5');
    expect(progress).toHaveAttribute('aria-valuetext', '已完成 1/5 个步骤');
    expect(screen.getByTestId('plan-progress-value')).toHaveAttribute('stroke-dashoffset', '80');
    expect(screen.getByTestId('plan-progress-value')).toHaveClass('text-muted-foreground');
    expect(screen.getByTestId('plan-progress-value')).not.toHaveClass('text-success', 'text-danger');

    const dialog = openPlanByClick();
    expect(within(dialog).getByText('完成 1/5 · 跳过 4')).toBeInTheDocument();
  });

  it('hover 打开与延时关闭浮层都不抢占或恢复焦点', () => {
    vi.useFakeTimers();
    try {
      render(
        <>
          <button type="button">外部操作</button>
          <PlanTimeline run={createRun([{
            id: 'answer',
            title: '整理回答',
            status: 'running',
            kind: 'answer',
            toolNames: [],
            evidenceItemIds: [],
          }])} />
        </>,
      );

      const externalButton = screen.getByRole('button', { name: '外部操作' });
      externalButton.focus();
      expect(externalButton).toHaveFocus();

      const overview = screen.getByTestId('plan-overview');
      fireEvent.mouseEnter(overview);
      expect(screen.getByRole('dialog', { name: '计划流程详情' })).toBeInTheDocument();
      expect(externalButton).toHaveFocus();

      fireEvent.mouseLeave(overview);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.queryByRole('dialog', { name: '计划流程详情' })).not.toBeInTheDocument();
      expect(externalButton).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
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

    expect(screen.getByRole('progressbar', { name: '计划完成进度' }))
      .toHaveAttribute('aria-valuetext', '已完成 4/4 个步骤');
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

  it('已完成的模型计划不会遗留 running spinner', () => {
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

    expect(screen.getByRole('progressbar', { name: '计划完成进度' }))
      .toHaveAttribute('aria-valuetext', '已完成 0/1 个步骤');
    openPlanByClick();
    expect(screen.getByTestId('plan-status-compare')).toHaveTextContent('已阻塞');
    expect(screen.getByTestId('plan-status-compare').querySelector('svg')).not.toHaveClass('animate-spin');
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
