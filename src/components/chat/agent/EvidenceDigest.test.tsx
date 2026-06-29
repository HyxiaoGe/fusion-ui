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

  it('运行中渲染资料处理摘要但不重复展示回答依据列表', () => {
    render(<EvidenceDigest run={{
      ...baseRun,
      status: 'running',
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

    expect(screen.getByText('资料处理')).toBeInTheDocument();
    expect(screen.getByText('搜索完成')).toBeInTheDocument();
    expect(screen.getByText('保留 2 条候选结果，供后续回答筛选。')).toBeInTheDocument();
    expect(screen.queryByText('回答依据')).not.toBeInTheDocument();
    expect(screen.queryByText('新闻来源 · example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('G7 讨论 AI 标准')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /新闻来源/ })).not.toBeInTheDocument();
  });

  it('资料处理摘要不暴露内部工具名和 reader-service 错误', () => {
    render(<EvidenceDigest run={{
      ...baseRun,
      status: 'running',
      toolDigests: [
        {
          toolCallId: 'tc-2',
          toolName: 'url_read',
          status: 'degraded',
          title: 'url_read 降级完成',
          summary: 'reader-service 返回 HTTP 502，已降级跳过',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
      ],
    }} />);

    expect(screen.getByText('资料处理')).toBeInTheDocument();
    expect(screen.getByText('网页读取部分可用')).toBeInTheDocument();
    expect(screen.getByText('网页暂时无法读取，已跳过该来源。')).toBeInTheDocument();
    expect(screen.queryByText(/url_read/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reader-service/)).not.toBeInTheDocument();
  });

  it('网页读取成功摘要不透出旧版工具兜底文案', () => {
    render(<EvidenceDigest run={{
      ...baseRun,
      status: 'running',
      toolDigests: [
        {
          toolCallId: 'tc-3',
          toolName: 'url_read',
          status: 'success',
          title: 'url_read 已完成',
          summary: '工具返回了可用结果。',
          keyFindings: [],
          sourceRefs: [],
          truncated: false,
        },
      ],
    }} />);

    expect(screen.getByText('网页读取完成')).toBeInTheDocument();
    expect(screen.getByText('已读取网页内容，供后续回答核验。')).toBeInTheDocument();
    expect(screen.queryByText(/工具返回/)).not.toBeInTheDocument();
    expect(screen.queryByText(/url_read/)).not.toBeInTheDocument();
  });
});
