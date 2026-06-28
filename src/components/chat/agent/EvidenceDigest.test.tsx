import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';
import { EvidenceDigest } from './EvidenceDigest';

const baseRun: AgentRunState = {
  runId: 'r1',
  messageId: 'm1',
  status: 'completed',
  config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
  totalSteps: 0,
  totalToolCalls: 0,
  steps: [],
  lastSequence: 1,
};

describe('EvidenceDigest', () => {
  it('没有工具摘要时不渲染', () => {
    const { container } = render(<EvidenceDigest run={baseRun} />);
    expect(container.firstChild).toBeNull();
  });

  it('只有回答依据但没有工具摘要时不渲染', () => {
    const { container } = render(<EvidenceDigest run={{
      ...baseRun,
      evidence: [
        {
          id: 'ev-1',
          kind: 'web',
          status: 'used',
          title: '新闻来源',
          domain: 'example.com',
          url: 'https://example.com/news',
          claim: 'G7 讨论 AI 标准',
          usedByFinalAnswer: true,
        },
      ],
    }} />);

    expect(container.firstChild).toBeNull();
  });

  it('渲染工具摘要但不重复展示回答依据列表', () => {
    render(<EvidenceDigest run={{
      ...baseRun,
      toolDigests: [
        {
          toolCallId: 'tc-1',
          toolName: 'web_search',
          status: 'success',
          title: 'OpenAI承诺在2026年对与AI相关的非营利问题投资5000万美元。',
          summary: '保留 2 条候选结果，供后续回答筛选。',
          keyFindings: ['G7 讨论 AI 标准'],
          sourceRefs: ['https://example.com/news'],
          truncated: false,
        },
      ],
      evidence: [
        {
          id: 'ev-1',
          kind: 'web',
          status: 'used',
          title: '新闻来源',
          domain: 'example.com',
          url: 'https://example.com/news',
          claim: 'G7 讨论 AI 标准',
          usedByFinalAnswer: true,
        },
      ],
    }} />);

    expect(screen.getByText('工具结果')).toBeInTheDocument();
    expect(screen.getByText('搜索完成')).toBeInTheDocument();
    expect(screen.getByText('保留 2 条候选结果，供后续回答筛选。')).toBeInTheDocument();
    expect(screen.queryByText('回答依据')).not.toBeInTheDocument();
    expect(screen.queryByText('新闻来源 · example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('G7 讨论 AI 标准')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /新闻来源/ })).not.toBeInTheDocument();
  });
});
