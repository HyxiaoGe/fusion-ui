import { describe, expect, it } from 'vitest';

import {
  getRuntimeConfigPresentation,
  summarizeRuntimeConfigPayload,
} from './runtimeConfigPresentation';

describe('runtimeConfigPresentation', () => {
  it('为已知 prompt 配置返回中文名称和影响范围', () => {
    const presentation = getRuntimeConfigPresentation('prompt_template', 'generate_title');

    expect(presentation.title).toBe('标题生成 Prompt');
    expect(presentation.category).toBe('Prompt 模板');
    expect(presentation.impact).toBe('影响新对话标题自动生成。');
    expect(presentation.risk).toContain('标题质量');
  });

  it('为未登记配置返回保守 fallback', () => {
    const presentation = getRuntimeConfigPresentation('unknown_namespace', 'unknown_key');

    expect(presentation.title).toBe('unknown key');
    expect(presentation.category).toBe('未登记配置');
    expect(presentation.description).toContain('尚未登记用途说明');
  });

  it('将 payload 摘要成可读字段说明', () => {
    const summary = summarizeRuntimeConfigPayload({
      template: '有效标题 prompt',
      max_searches: 4,
      enabled: true,
      rules: ['a', 'b'],
      nested: { mode: 'strict' },
      extra: 'more',
    });

    expect(summary).toEqual([
      '模板内容：11 字',
      '搜索预算：4',
      'enabled：已开启',
      'rules：2 项',
      '另有 2 个字段',
    ]);
  });
});
