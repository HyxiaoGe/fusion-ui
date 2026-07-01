import { describe, expect, it } from 'vitest';
import type { AgentEvidenceItem } from '@/types/agentRun';
import type { SearchSourceSummary, SourceReference, UrlBlock } from '@/types/conversation';
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

const sourceRefs: SourceReference[] = [
  {
    kind: 'search',
    title: '统一搜索来源',
    url: 'https://unified.example.com/search-source',
    favicon: 'https://unified.example.com/favicon.ico',
  },
  {
    kind: 'url_read',
    title: '统一读取来源',
    url: 'https://reader.example.com/unified',
    domain: 'reader.example.com',
  },
];

describe('deriveAnswerEvidence', () => {
  it('无搜索来源和 URL 读取时返回 null', () => {
    expect(deriveAnswerEvidence({ searchSources: [], urlBlocks: [] })).toBeNull();
  });

  it('优先使用 agent evidence 区分已使用来源和候选来源', () => {
    const agentEvidence: AgentEvidenceItem[] = [
      {
        id: 'ev-used',
        kind: 'web',
        status: 'used',
        title: '官方公告',
        url: 'https://openai.com/news/product',
        domain: 'openai.com',
        claim: '最终回答引用了该来源。',
        usedByFinalAnswer: true,
      },
      {
        id: 'ev-candidate',
        kind: 'web',
        status: 'candidate',
        title: '媒体报道',
        url: 'https://example.com/media',
        domain: 'example.com',
        claim: '搜索候选。',
        usedByFinalAnswer: false,
      },
      {
        id: 'ev-read-used',
        kind: 'web',
        status: 'read_success',
        title: '官方公告深读',
        url: 'https://openai.com/news/product',
        domain: 'openai.com',
        claim: '已读取网页。',
        usedByFinalAnswer: false,
      },
    ];

    const evidence = deriveAnswerEvidence({
      agentEvidence,
      searchSources: [
        { title: '官方公告', url: 'https://openai.com/news/product' },
        { title: '媒体报道', url: 'https://example.com/media' },
      ],
      urlBlocks: [
        { type: 'url_read', id: 'url-1', url: 'https://openai.com/news/product', title: '官方公告深读' },
      ],
    });

    expect(evidence?.summary).toBe('回答依据 · 已使用 1 条 · 候选 1 条 · 深读 1 个网页');
    expect(evidence?.items.map(item => item.title)).toEqual(['官方公告']);
    expect(evidence?.usedItems?.map(item => item.title)).toEqual(['官方公告']);
    expect(evidence?.candidateItems?.map(item => item.title)).toEqual(['媒体报道']);
    expect(evidence?.usedItems?.[0]).toMatchObject({
      kind: 'search_source',
      sourceIndex: 0,
      deepRead: true,
    });
  });

  it('agent evidence 没有 used 时预览候选来源但不伪装成已使用', () => {
    const evidence = deriveAnswerEvidence({
      agentEvidence: [
        {
          id: 'ev-candidate-1',
          kind: 'web',
          status: 'candidate',
          title: '候选一',
          url: 'https://example.com/one',
          domain: 'example.com',
          claim: '搜索候选。',
          usedByFinalAnswer: false,
        },
        {
          id: 'ev-read-1',
          kind: 'web',
          status: 'read_success',
          title: '深读一',
          url: 'https://reader.example.com/a',
          domain: 'reader.example.com',
          claim: '已读取网页。',
          usedByFinalAnswer: false,
        },
      ],
      searchSources: [],
      urlBlocks: [],
    });

    expect(evidence?.summary).toBe('回答依据 · 候选 2 条 · 深读 1 个网页');
    expect(evidence?.items.map(item => item.title)).toEqual(['候选一', '深读一']);
    expect(evidence?.usedItems).toEqual([]);
    expect(evidence?.candidateItems?.map(item => item.title)).toEqual(['候选一', '深读一']);
  });

  it('将搜索来源转换为 search_source evidence items', () => {
    const evidence = deriveAnswerEvidence({ searchSources, urlBlocks: [] });

    expect(evidence).not.toBeNull();
    expect(evidence?.summary).toBe('回答依据 · 搜索候选 2 条');
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

  it('搜索来源带最终 provider 时在摘要中展示服务提供方', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [
        {
          title: 'Fallback 搜索结果',
          url: 'https://fallback.example.com',
        },
      ],
      urlBlocks: [],
      searchProvider: 'brave',
    });

    expect(evidence?.summary).toBe('回答依据 · 搜索候选 1 条 · 本次搜索由 Brave 提供');
  });

  it('优先使用统一 sourceRefs，避免旧 sources 和 urlBlocks 重复计数', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs,
      searchSources,
      urlBlocks,
    });

    expect(evidence).not.toBeNull();
    expect(evidence?.summary).toBe('回答依据 · 搜索候选 1 条 · 深读 1 个网页');
    expect(evidence?.totalCount).toBe(2);
    expect(evidence?.items).toEqual([
      expect.objectContaining({
        id: 'source-ref-0',
        kind: 'search_source',
        title: '统一搜索来源',
        url: 'https://unified.example.com/search-source',
        domain: 'unified.example.com',
      }),
      expect.objectContaining({
        id: 'source-ref-1',
        kind: 'url_read',
        title: '统一读取来源',
        url: 'https://reader.example.com/unified',
        domain: 'reader.example.com',
      }),
    ]);
  });

  it('搜索候选与深读网页同 URL 时去重展示并保留深读计数', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs: [
        {
          kind: 'search',
          title: 'Previewing GPT-5.6 Sol',
          url: 'https://openai.com/index/previewing-gpt-5-6-sol',
        },
        {
          kind: 'search',
          title: 'OpenAI 新闻室',
          url: 'https://openai.com/zh-Hant-HK/news/company-announcements',
        },
        {
          kind: 'search',
          title: '健康隐私通知',
          url: 'https://openai.com/zh-Hans-CN/policies/health-privacy-policy',
        },
        {
          kind: 'search',
          title: 'Helping build shared standards for advanced AI',
          url: 'https://openai.com/index/helping-build-shared-standards-for-advanced-ai',
        },
        {
          kind: 'search',
          title: 'ChatGPT 版本说明',
          url: 'https://help.openai.com/zh-hant/articles/6825453-chatgpt-%E7%89%88%E6%9C%AC%E8%AA%AA%E6%98%8E',
        },
        {
          kind: 'search',
          title: 'YouTube 搜索结果 1',
          url: 'https://youtube.com/watch?v=-MSH5Oeta0s',
        },
        {
          kind: 'search',
          title: 'YouTube 搜索结果 2',
          url: 'https://youtube.com/watch?v=3QYAPbc9KLc',
        },
        {
          kind: 'search',
          title: 'Nikkei 搜索结果',
          url: 'https://online.nikkei-cnbc.co.jp/vod/66381',
        },
        {
          kind: 'url_read',
          title: 'Helping build shared standards for advanced AI',
          url: 'https://openai.com/index/helping-build-shared-standards-for-advanced-ai',
        },
        {
          kind: 'url_read',
          title: 'Previewing GPT-5.6 Sol',
          url: 'https://openai.com/index/previewing-gpt-5-6-sol',
        },
        {
          kind: 'url_read',
          title: 'OpenAI 新闻室',
          url: 'https://openai.com/zh-Hant-HK/news/company-announcements',
        },
      ],
      searchSources: [],
      urlBlocks: [],
    });

    expect(evidence?.summary).toBe('回答依据 · 搜索候选 8 条 · 深读 3 个网页');
    expect(evidence?.searchCount).toBe(8);
    expect(evidence?.urlCount).toBe(3);
    expect(evidence?.totalCount).toBe(8);
    expect(evidence?.items.filter(item => item.kind === 'url_read')).toHaveLength(0);
    expect(evidence?.items.filter(item => item.kind === 'search_source' && item.deepRead)).toHaveLength(3);
  });

  it('sourceRefs 缺 favicon 时用同 URL 的旧来源补齐站点图标', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs: [
        {
          kind: 'search',
          title: '统一搜索来源',
          url: 'https://www.example.com/news/one',
        },
      ],
      searchSources,
      urlBlocks: [],
    });

    expect(evidence?.items[0]).toEqual(
      expect.objectContaining({
        kind: 'search_source',
        favicon: 'https://example.com/favicon.ico',
      }),
    );
  });

  it('sourceRefs 自带 favicon 时不被旧来源覆盖', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs: [
        {
          kind: 'search',
          title: '统一搜索来源',
          url: 'https://www.example.com/news/one',
          favicon: 'https://source-ref.example.com/icon.svg',
        },
      ],
      searchSources,
      urlBlocks: [],
    });

    expect(evidence?.items[0]).toEqual(
      expect.objectContaining({
        favicon: 'https://source-ref.example.com/icon.svg',
      }),
    );
  });

  it('搜索来源缺 favicon 时使用同源站点图标兜底', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [
        {
          title: 'Firecrawl 搜索结果',
          url: 'https://www.reddit.com/r/apple/comments/example',
        },
      ],
      urlBlocks: [],
    });

    expect(evidence?.items[0]).toEqual(
      expect.objectContaining({
        favicon: 'https://www.reddit.com/favicon.ico',
      }),
    );
  });

  it('sourceRefs 和旧来源都缺 favicon 时使用同源站点图标兜底', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs: [
        {
          kind: 'search',
          title: '统一搜索来源',
          url: 'https://news.example.com/article',
        },
      ],
      searchSources: [],
      urlBlocks: [],
    });

    expect(evidence?.items[0]).toEqual(
      expect.objectContaining({
        favicon: 'https://news.example.com/favicon.ico',
      }),
    );
  });

  it('统一 sourceRefs 中的失败来源不作为正常回答依据', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs: [
        {
          kind: 'url_read',
          title: '失败读取来源',
          url: 'https://failed.example.com',
          status: 'failed',
          error_message: 'timeout',
        },
        {
          kind: 'search',
          title: '成功搜索来源',
          url: 'https://success.example.com',
          status: 'success',
        },
      ],
      searchSources: [],
      urlBlocks: [],
    });

    expect(evidence?.summary).toBe('回答依据 · 搜索候选 1 条');
    expect(evidence?.items).toEqual([
      expect.objectContaining({
        kind: 'search_source',
        title: '成功搜索来源',
        url: 'https://success.example.com',
      }),
    ]);
  });

  it('统一 sourceRefs 中降级或中断的搜索来源不作为正常回答依据', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs: [
        {
          kind: 'search',
          title: '降级搜索来源',
          url: 'https://degraded-search.example.com',
          status: 'degraded',
        },
        {
          kind: 'search',
          title: '中断搜索来源',
          url: 'https://interrupted-search.example.com',
          status: 'interrupted',
        },
        {
          kind: 'search',
          title: '成功搜索来源',
          url: 'https://success-search.example.com',
          status: 'success',
        },
      ],
      searchSources: [],
      urlBlocks: [],
    });

    expect(evidence?.summary).toBe('回答依据 · 搜索候选 1 条');
    expect(evidence?.items).toEqual([
      expect.objectContaining({
        kind: 'search_source',
        title: '成功搜索来源',
        url: 'https://success-search.example.com',
      }),
    ]);
  });

  it('统一 sourceRefs 非空但全部不可用时不回退旧来源', () => {
    const evidence = deriveAnswerEvidence({
      sourceRefs: [
        {
          kind: 'url_read',
          title: '降级读取来源',
          url: 'https://degraded.example.com',
          status: 'degraded',
        },
        {
          kind: 'url_read',
          title: '中断读取来源',
          url: 'https://interrupted.example.com',
          status: 'interrupted',
        },
      ],
      searchSources,
      urlBlocks,
    });

    expect(evidence).toBeNull();
  });

  it('没有统一来源时不把失败 URL 读取渲染成正常回答依据', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [],
      urlBlocks: [
        {
          type: 'url_read',
          id: 'url-failed',
          url: 'https://failed.example.com',
          title: '读取失败页面',
          status: 'failed',
          error_message: 'timeout',
        },
      ],
    });

    expect(evidence).toBeNull();
  });

  it('将 URL blocks 转换为 url_read evidence items', () => {
    const evidence = deriveAnswerEvidence({ searchSources: [], urlBlocks });

    expect(evidence).not.toBeNull();
    expect(evidence?.summary).toBe('回答依据 · 深读 2 个网页');
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
    expect(evidence?.summary).toBe('回答依据 · 搜索候选 2 条 · 深读 2 个网页');
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

  it('搜索和 URL 同时存在时 previewItems 兼容字段保留完整 items', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [
        ...searchSources,
        { title: '第三条搜索结果', url: 'https://third.example.com' },
        { title: '第四条搜索结果', url: 'https://fourth.example.com' },
      ],
      urlBlocks: [urlBlocks[0]],
      previewLimit: 3,
    });

    expect(evidence?.items).toHaveLength(5);
    expect(evidence?.previewItems).toEqual(evidence?.items);
    expect(evidence?.hiddenSearchCount).toBe(0);
    expect(evidence?.hiddenUrlCount).toBe(0);
  });

  it('previewLimit 小于 1 时不再裁剪模型层 items', () => {
    const evidence = deriveAnswerEvidence({
      searchSources,
      urlBlocks: [],
      previewLimit: 0,
    });

    expect(evidence?.previewItems).toEqual(evidence?.items);
    expect(evidence?.previewItems).toHaveLength(2);
    expect(evidence?.hiddenSearchCount).toBe(0);
  });

  it('previewLimit 默认展示单次搜索返回的 5 条结果', () => {
    const fiveSearchEvidence = deriveAnswerEvidence({
      searchSources: [
        ...searchSources,
        { title: '第三条搜索结果', url: 'https://third.example.com' },
        { title: '第四条搜索结果', url: 'https://fourth.example.com' },
        { title: '第五条搜索结果', url: 'https://fifth.example.com' },
      ],
      urlBlocks: [],
    });
    const fiveUrlEvidence = deriveAnswerEvidence({
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
        {
          type: 'url_read',
          id: 'url-5',
          url: 'https://fifth.example.com',
          title: '第五篇网页',
        },
      ],
    });

    expect(fiveSearchEvidence?.previewItems).toHaveLength(5);
    expect(fiveSearchEvidence?.hiddenSearchCount).toBe(0);
    expect(fiveUrlEvidence?.previewItems).toHaveLength(5);
    expect(fiveUrlEvidence?.hiddenUrlCount).toBe(0);
  });

  it('搜索和 URL 同时存在且 previewLimit=1 时仍保留完整 items', () => {
    const evidence = deriveAnswerEvidence({
      searchSources,
      urlBlocks,
      previewLimit: 1,
    });

    expect(evidence?.previewItems).toEqual(evidence?.items);
    expect(evidence?.previewItems).toHaveLength(4);
    expect(evidence?.previewItems[0]).toMatchObject({
      id: 'search-0',
      kind: 'search_source',
    });
    expect(evidence?.hiddenSearchCount).toBe(0);
    expect(evidence?.hiddenUrlCount).toBe(0);
  });

  it('搜索少于旧预留位时也不在模型层隐藏 URL', () => {
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

    expect(evidence?.previewItems).toEqual(evidence?.items);
    expect(evidence?.previewItems).toHaveLength(5);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(1);
    expect(evidence?.previewItems.filter(item => item.kind === 'url_read')).toHaveLength(4);
    expect(evidence?.hiddenUrlCount).toBe(0);
    expect(evidence?.hiddenSearchCount).toBe(0);
  });

  it('搜索刚好占满旧预留位时也保留全部 URL', () => {
    const evidence = deriveAnswerEvidence({
      searchSources,
      urlBlocks,
      previewLimit: 3,
    });

    expect(evidence?.previewItems).toEqual(evidence?.items);
    expect(evidence?.previewItems).toHaveLength(4);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(2);
    expect(evidence?.previewItems.filter(item => item.kind === 'url_read')).toHaveLength(2);
    expect(evidence?.hiddenUrlCount).toBe(0);
    expect(evidence?.hiddenSearchCount).toBe(0);
  });

  it('搜索超过旧预留位时不再由模型层统计隐藏依据', () => {
    const evidence = deriveAnswerEvidence({
      searchSources: [
        ...searchSources,
        { title: '第三条搜索结果', url: 'https://third.example.com' },
        { title: '第四条搜索结果', url: 'https://fourth.example.com' },
      ],
      urlBlocks,
      previewLimit: 3,
    });

    expect(evidence?.previewItems).toEqual(evidence?.items);
    expect(evidence?.previewItems).toHaveLength(6);
    expect(evidence?.previewItems.filter(item => item.kind === 'search_source')).toHaveLength(4);
    expect(evidence?.previewItems.filter(item => item.kind === 'url_read')).toHaveLength(2);
    expect(evidence?.hiddenUrlCount).toBe(0);
    expect(evidence?.hiddenSearchCount).toBe(0);
  });

  it('只有 URL 超过旧上限时也保留完整 URL', () => {
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

    expect(evidence?.previewItems).toEqual(evidence?.items);
    expect(evidence?.previewItems).toHaveLength(4);
    expect(evidence?.hiddenUrlCount).toBe(0);
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
