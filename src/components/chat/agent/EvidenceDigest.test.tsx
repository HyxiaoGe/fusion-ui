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
  it('没有工具摘要和依据时不渲染', () => {
    const { container } = render(<EvidenceDigest run={baseRun} />);
    expect(container.firstChild).toBeNull();
  });

  it('渲染工具摘要和回答依据', () => {
    render(<EvidenceDigest run={{
      ...baseRun,
      toolDigests: [
        {
          toolCallId: 'tc-1',
          toolName: 'web_search',
          status: 'success',
          title: '搜索资料',
          summary: '找到 2 条来源',
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
    expect(screen.getByText('搜索资料')).toBeInTheDocument();
    expect(screen.getByText('找到 2 条来源')).toBeInTheDocument();
    expect(screen.getByText('回答依据')).toBeInTheDocument();
    expect(screen.getByText('新闻来源 · example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /新闻来源/ })).toHaveAttribute('href', 'https://example.com/news');
  });
});
