import { describe, expect, it } from 'vitest';
import type { SearchBlock, UrlBlock } from '@/types/conversation';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import { deriveAnswerEvidenceSidebar } from './answerEvidenceSidebarModel';

const answerEvidence: AnswerEvidenceModel = {
  items: [
    {
      id: 'search-0',
      kind: 'search_source',
      title: '搜索来源',
      url: 'https://search.example.com/a',
      domain: 'search.example.com',
      sourceIndex: 0,
    },
    {
      id: 'url-url-1',
      kind: 'url_read',
      title: '读取来源',
      url: 'https://reader.example.com/a',
      domain: 'reader.example.com',
    },
  ],
  previewItems: [],
  searchCount: 1,
  urlCount: 1,
  totalCount: 2,
  hiddenSearchCount: 0,
  hiddenUrlCount: 0,
  summary: '回答依据 · 搜索 1 条 · 读取 1 个网页',
  hasSearchSources: true,
};

describe('deriveAnswerEvidenceSidebar', () => {
  it('uses answer evidence items as used sources', () => {
    const model = deriveAnswerEvidenceSidebar({
      answerEvidence,
      searchBlock: null,
      urlBlocks: [],
      searchQueries: ['AI 标准', 'AI 标准', 'OpenAI 最新融资'],
    });

    expect(model).not.toBeNull();
    expect(model?.summary).toMatchObject({
      usedCount: 2,
      searchCount: 1,
      urlCount: 1,
      issueCount: 0,
    });
    expect(model?.usedItems.map(item => item.title)).toEqual(['搜索来源', '读取来源']);
    expect(model?.searchQueries).toEqual(['AI 标准', 'OpenAI 最新融资']);
  });

  it('collects failed degraded and interrupted url blocks as issue items', () => {
    const urlBlocks: UrlBlock[] = [
      { type: 'url_read', id: 'u1', url: 'https://failed.example.com', status: 'failed', error_message: 'reader-service 读取超时，已降级跳过' },
      { type: 'url_read', id: 'u2', url: 'https://degraded.example.com', status: 'degraded' },
      { type: 'url_read', id: 'u3', url: 'https://interrupted.example.com', status: 'interrupted' },
    ];

    const model = deriveAnswerEvidenceSidebar({ answerEvidence: null, searchBlock: null, urlBlocks });

    expect(model?.usedItems).toEqual([]);
    expect(model?.issueItems).toHaveLength(3);
    expect(model?.issueItems[0]).toMatchObject({
      title: 'https://failed.example.com',
      status: 'failed',
      reason: '网页暂时无法读取',
    });
    expect(model?.issueItems[1]).toMatchObject({
      status: 'degraded',
      reason: '部分网页暂时无法读取',
    });
    expect(model?.issueItems[2]).toMatchObject({
      status: 'interrupted',
      reason: '读取已中断',
    });
  });

  it('collects non-success source refs as issues and deduplicates by url', () => {
    const searchBlock: SearchBlock = {
      type: 'search',
      id: 's1',
      query: 'AI 标准',
      sources: [],
      source_refs: [
        { kind: 'url_read', title: '失败页面', url: 'https://dup.example.com', status: 'failed', error_message: 'reader-service 读取超时，已降级跳过' },
        { kind: 'url_read', title: '重复失败页面', url: 'https://dup.example.com', status: 'failed', error_message: 'reader-service 读取超时，已降级跳过' },
        { kind: 'search', title: '降级搜索', url: 'https://search.example.com', status: 'degraded', error_message: 'web_search 已达到本轮联网预算' },
      ],
    };

    const model = deriveAnswerEvidenceSidebar({ answerEvidence: null, searchBlock, urlBlocks: [] });

    expect(model?.issueItems).toHaveLength(2);
    expect(model?.issueItems.map(item => item.title)).toEqual(['失败页面', '降级搜索']);
    expect(model?.issueItems.map(item => item.reason)).toEqual(['网页暂时无法读取', '部分搜索结果未能使用']);
  });

  it('url_read 失败时不透出 HTTP 状态等底层错误', () => {
    const searchBlock: SearchBlock = {
      type: 'search',
      id: 'search-http',
      query: 'AI 标准',
      sources: [],
      source_refs: [
        { kind: 'url_read', title: '404 页面', url: 'https://example.com/404', status: 'failed', error_message: 'HTTP 404' },
      ],
    };

    const model = deriveAnswerEvidenceSidebar({ answerEvidence: null, searchBlock, urlBlocks: [] });

    expect(model?.issueItems[0].reason).toBe('网页暂时无法读取');
  });

  it('returns null when there are no used or issue items', () => {
    expect(deriveAnswerEvidenceSidebar({
      answerEvidence: null,
      searchBlock: null,
      urlBlocks: [],
    })).toBeNull();
  });
});
