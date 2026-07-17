import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n';
import type { AgentRunState } from '@/types/agentRun';
import type { ContextUsage } from '@/types/conversation';

import AnswerEvidenceSidebar from './AnswerEvidenceSidebar';
import type { AnswerEvidenceSidebarModel } from './answerEvidenceSidebarModel';
import {
  ChatDetailOverlayProvider,
} from './ChatDetailOverlayContext';
import ContextStatus, {
  CONTEXT_STATUS_OPEN_STORAGE_KEY,
} from './ContextStatus';
import { ExecutionProcess } from './agent/ExecutionProcess';

const usage: ContextUsage = {
  status: 'within_budget',
  window_tokens: 100_000,
  estimated_tokens_before: 40_000,
  estimated_tokens_after: 40_000,
  actual_prompt_tokens: 40_000,
  removed_turns: 0,
  removed_messages: 0,
  removed_tool_transactions: 0,
  round_index: 1,
};

const run: AgentRunState = {
  runId: 'run-1',
  messageId: 'assistant-1',
  status: 'completed',
  config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
  totalSteps: 1,
  totalToolCalls: 1,
  lastSequence: 1,
  steps: [
    {
      stepId: 'step-1',
      stepNumber: 1,
      status: 'completed',
      toolCalls: [
        {
          toolCallId: 'search-1',
          toolName: 'web_search',
          arguments: { query: '深圳聚餐' },
          status: 'success',
          resultSummary: { kind: 'search', count: 2, truncated: false },
          startedAt: 1_000,
          completedAt: 1_100,
        },
      ],
      contentBlockIds: [],
      startedAt: 1_000,
      completedAt: 1_100,
    },
  ],
};

const evidenceModel: AnswerEvidenceSidebarModel = {
  summary: {
    usedCount: 1,
    candidateCount: 0,
    searchCount: 1,
    urlCount: 0,
    issueCount: 0,
  },
  usedItems: [
    {
      id: 'source-1',
      kind: 'search',
      title: '深圳餐厅来源',
      url: 'https://example.com/shenzhen',
      domain: 'example.com',
      sourceIndex: 0,
    },
  ],
  candidateItems: [],
  issueItems: [],
  searchQueries: ['深圳聚餐'],
  isRenderable: true,
};

function ContextPanel() {
  return <ContextStatus conversationId="chat-overlay" usage={usage} />;
}

function AnswerEvidenceHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开回答依据</button>
      <AnswerEvidenceSidebar
        model={evidenceModel}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function ProcessToEvidenceHarness() {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  return (
    <>
      <ExecutionProcess
        run={run}
        searchSources={evidenceModel.usedItems.map(item => ({
          id: item.id,
          title: item.title,
          url: item.url,
          domain: item.domain,
        }))}
        searchQueries={evidenceModel.searchQueries}
        onOpenSources={() => setEvidenceOpen(true)}
      />
      <AnswerEvidenceSidebar
        model={evidenceModel}
        isOpen={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
      />
    </>
  );
}

describe('聊天详情浮层互斥', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(CONTEXT_STATUS_OPEN_STORAGE_KEY, 'true');
    await i18n.changeLanguage('zh-CN');
  });

  it('执行过程打开时临时隐藏上下文，关闭后恢复且不修改自动展开偏好', () => {
    render(
      <ChatDetailOverlayProvider>
        <ContextPanel />
        <ExecutionProcess run={run} />
      </ChatDetailOverlayProvider>,
    );

    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看执行过程' }));

    expect(screen.getByRole('dialog', { name: '执行过程' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).not.toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_OPEN_STORAGE_KEY)).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '关闭执行过程' }));

    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '回答完成后自动展开' })).toBeChecked();
  });

  it('回答依据打开时临时隐藏上下文，关闭后恢复且不修改自动展开偏好', () => {
    render(
      <ChatDetailOverlayProvider>
        <ContextPanel />
        <AnswerEvidenceHarness />
      </ChatDetailOverlayProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开回答依据' }));

    expect(screen.getByRole('dialog', { name: '回答依据' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).not.toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_OPEN_STORAGE_KEY)).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '回答完成后自动展开' })).toBeChecked();
  });

  it('详情侧栏所在消息卸载时清理登记并恢复上下文', () => {
    function UnmountHarness() {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setMounted(false)}>卸载回答消息</button>
          {mounted ? (
            <AnswerEvidenceSidebar
              model={evidenceModel}
              isOpen
              onClose={() => undefined}
            />
          ) : null}
        </>
      );
    }

    render(
      <ChatDetailOverlayProvider>
        <ContextPanel />
        <UnmountHarness />
      </ChatDetailOverlayProvider>,
    );

    expect(screen.queryByRole('dialog', { name: '上下文状态' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '卸载回答消息' }));
    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_OPEN_STORAGE_KEY)).toBe('true');
  });

  it('从执行过程切换到回答依据时上下文保持隐藏，最终关闭后再恢复', () => {
    render(
      <ChatDetailOverlayProvider>
        <ContextPanel />
        <ProcessToEvidenceHarness />
      </ChatDetailOverlayProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看执行过程' }));
    fireEvent.click(screen.getByRole('button', { name: '查看依据' }));

    expect(screen.queryByRole('dialog', { name: '执行过程' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '回答依据' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '上下文状态' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭回答依据' }));

    expect(screen.getByRole('dialog', { name: '上下文状态' })).toBeInTheDocument();
    expect(localStorage.getItem(CONTEXT_STATUS_OPEN_STORAGE_KEY)).toBe('true');
  });
});
