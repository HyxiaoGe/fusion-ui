import { describe, expect, it } from 'vitest';
import type { SearchSourceSummary, UrlBlock } from '@/types/conversation';
import { deriveAnswerEvidence } from './answerEvidenceModel';

const searchSources: SearchSourceSummary[] = [
  {
    title: '第一条搜索结果',
    url: 'https://www.example.com/news/one',
    favicon: 'https://example.com/favicon.ico',
  },
  {
    title: '第二条搜索结果',
    url: 'https://docs.example.org/guide',
  },
];

const urlBlocks: UrlBlock[] = [
  {
    type: 'url_read',
    id: 'url-1',
    url: 'https://www.reader.example.com/article',
    title: '第一篇网页',
    favicon: 'https://reader.example.com/favicon.ico',
  },
  {
    type: 'url_read',
    id: 'url-2',
    url: 'https://blog.example.net/post',
    title: '第二篇网页',
  },
];

describe('deriveAnswerEvidence', () => {
  it('无搜索来源和 URL 读取时返回 null', () => {
    expect(deriveAnswerEvidence({ searchSources: [], urlBlocks: [] })).toBeNull();
  });

  it('将搜索来源转换为 search_source evidence items', () => {
    const evidence = deriveAnswerEvidence({ searchSources, urlBlocks: [] });

    expect(evidence).not.toBeNull();
    expect(evidence?.summary).toBe('回答依据 · 搜索 2 条');
    expect(evidence?.searchCount).toBe(2);
    expect(evidence?.urlCount).toBe(0);
    expect(evidence?.items[0]).toMatchObject({
      id: 'search-0',
      kind: 'search_source',
      sourceIndex: 0,
      title: '第一条搜索结果',
      url: 'https://www.example.com/news/one',
      domain: 'example.com',
      favicon: 'https://example.com/favicon.ico',
    });
  });

  it('将 URL blocks 转换为 url_read evidence items', () => {
    const evidence = deriveAnswerEvidence({ searchSources: [], urlBlocks });

    expect(evidence).not.toBeNull();
    expect(evidence?.summary).toBe('回答依据 · 读取 2 个网页');
    expect(evidence?.items[0]).toMatchObject({
      id: 'url-url-1',
      kind: 'url_read',
      title: '第一篇网页',
      url: 'https://www.reader.example.com/article',
      domain: 'reader.example.com',
      favicon: 'https://reader.example.com/favicon.ico',
    });
  });

  it('生成搜索和 URL 组合摘要', () => {
    const evidence = deriveAnswerEvidence({ searchSources, urlBlocks });

    expect(evidence).not.toBeNull();
    expect(evidence?.summary).toBe('回答依据 · 搜索 2 条 · 读取 2 个网页');
    expect(evidence?.totalCount).toBe(4);
    expect(evidence?.hasSearchSources).toBe(true);
  });

  it('URL 解析失败时 domain fallback 到原始字符串', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [],
      urlBlocks: [
        {
          type: 'url_read',
          id: 'broken',
          url: 'not a valid url',
          title: '',
        },
      ],
    });

    expect(evidence?.items[0]).toMatchObject({
      title: 'not a valid url',
      domain: 'not a valid url',
    });
  });

  it('搜索和 URL 同时存在且超过预览上限时保留搜索和首个 URL', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [
        ...searchSources,
        { title: '第三条搜索结果', url: 'https://third.example.com' },
        { title: '第四条搜索结果', url: 'https://fourth.example.com' },
      ],
      urlBlocks: [urlBlocks[0]],
      previewLimit: 3,
    });

    expect(evidence?.previewItems).toHaveLength(3);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(2);
    expect(evidence?.previewItems.filter(item => item.kind === 'url_read')).toHaveLength(1);
  });

  it('previewLimit 小于 1 时按 1 处理', () => {
    const evidence = deriveAnswerEvidence({
      searchSources,
      urlBlocks: [],
      previewLimit: 0,
    });

    expect(evidence?.previewItems).toHaveLength(1);
    expect(evidence?.previewItems[0]?.id).toBe('search-0');
  });

  it('previewLimit 默认展示 3 条预览', () => {
    const fourSearchEvidence = deriveAnswerEvidence({
      searchSources: [
        ...searchSources,
        { title: '第三条搜索结果', url: 'https://third.example.com' },
        { title: '第四条搜索结果', url: 'https://fourth.example.com' },
      ],
      urlBlocks: [],
    });
    const fourUrlEvidence = deriveAnswerEvidence({
      searchSources: [],
      urlBlocks: [
        ...urlBlocks,
        {
          type: 'url_read',
          id: 'url-3',
          url: 'https://third.example.com',
          title: '第三篇网页',
        },
        {
          type: 'url_read',
          id: 'url-4',
          url: 'https://fourth.example.com',
          title: '第四篇网页',
        },
      ],
    });

    expect(fourSearchEvidence?.previewItems).toHaveLength(3);
    expect(fourUrlEvidence?.previewItems).toHaveLength(3);
  });

  it('搜索和 URL 同时存在且 previewLimit=1 时只预览第一个 URL', () => {
    const evidence = deriveAnswerEvidence({
      searchSources,
      urlBlocks,
      previewLimit: 1,
    });

    expect(evidence?.previewItems).toHaveLength(1);
    expect(evidence?.previewItems[0]).toMatchObject({
      id: 'url-url-1',
      kind: 'url_read',
    });
  });

  it('搜索少于预留位时用 URL 补满 mixed 预览', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: searchSources.slice(0, 1),
      urlBlocks: [
        ...urlBlocks,
        {
          type: 'url_read',
          id: 'url-3',
          url: 'https://third.example.com',
          title: '第三篇网页',
        },
        {
          type: 'url_read',
          id: 'url-4',
          url: 'https://fourth.example.com',
          title: '第四篇网页',
        },
      ],
      previewLimit: 3,
    });

    expect(evidence?.previewItems).toHaveLength(3);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(1);
    expect(evidence?.previewItems.filter(item => item.kind === 'url_read')).toHaveLength(2);
    expect(evidence?.hiddenUrlCount).toBe(2);
    expect(evidence?.hiddenSearchCount).toBe(0);
  });

  it('搜索刚好占满预留位时 mixed 预览保留首个 URL', () => {
    const evidence = deriveAnswerEvidence({
      searchSources,
      urlBlocks,
      previewLimit: 3,
    });

    expect(evidence?.previewItems).toHaveLength(3);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(2);
    expect(evidence?.previewItems.filter(item => item.kind === 'url_read')).toHaveLength(1);
    expect(evidence?.hiddenUrlCount).toBe(1);
    expect(evidence?.hiddenSearchCount).toBe(0);
  });

  it('搜索超过预留位时统计隐藏搜索和隐藏 URL', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [
        ...searchSources,
        { title: '第三条搜索结果', url: 'https://third.example.com' },
        { title: '第四条搜索结果', url: 'https://fourth.example.com' },
      ],
      urlBlocks,
      previewLimit: 3,
    });

    expect(evidence?.previewItems).toHaveLength(3);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(2);
    expect(evidence?.previewItems.filter(item => item.kind === 'url_read')).toHaveLength(1);
    expect(evidence?.hiddenUrlCount).toBe(1);
    expect(evidence?.hiddenSearchCount).toBe(2);
  });

  it('只有 URL 超过上限时统计隐藏网页数量', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [],
      urlBlocks: [
        ...urlBlocks,
        {
          type: 'url_read',
          id: 'url-3',
          url: 'https://third.example.com',
          title: '第三篇网页',
        },
        {
          type: 'url_read',
          id: 'url-4',
          url: 'https://fourth.example.com',
          title: '第四篇网页',
        },
      ],
      previewLimit: 3,
    });

    expect(evidence?.previewItems).toHaveLength(3);
    expect(evidence?.hiddenUrlCount).toBe(1);
  });

  it('隐藏计数不小于 0', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [],
      urlBlocks,
      previewLimit: 3,
    });

    expect(evidence?.hiddenUrlCount).toBe(0);
    expect(evidence?.hiddenSearchCount).toBe(0);
  });
});
