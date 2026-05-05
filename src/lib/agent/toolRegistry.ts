/**
 * 工具元数据注册表（contract §8）。
 *
 * 加新工具只改这张表；组件代码不允许出现 if (toolName === '...') 这类硬编码。
 *
 * icon 用 Lucide component reference 而不是字符串——保证类型安全 + tree-shaking 友好。
 */

import { Search, Globe, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SemanticColor = 'info' | 'success' | 'warn' | 'danger' | 'teal' | 'neutral';

export interface ToolMeta {
  label: string;
  icon: LucideIcon;
  color: SemanticColor;
  /** arguments → 单行摘要文案（如 query 或 url） */
  summarize: (args: Record<string, unknown>) => string;
  /**
   * 渲染 args 详情前的脱敏 hook（contract §8 sanitizer 原则的 FE 侧对应）。
   * 缺省时走 getDisplayArgs 的通用 sensitive key redaction。
   * 工具有特殊脱敏需求（如某字段语义上敏感但 key 名不在通用 pattern 里）才需要自定义。
   */
  redactArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
}

export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  web_search: {
    label: '搜索',
    icon: Search,
    color: 'info',
    summarize: (a) => String(a.query ?? ''),
  },
  url_read: {
    label: '读取',
    icon: Globe,
    color: 'teal',
    summarize: (a) => String(a.url ?? ''),
  },
};

const FALLBACK: ToolMeta = {
  label: '',
  icon: Wrench,
  color: 'neutral',
  summarize: () => '',
};

export function getToolMeta(toolName: string): ToolMeta {
  const found = TOOL_REGISTRY[toolName];
  if (found) return found;
  return { ...FALLBACK, label: toolName };
}

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|connection[_-]?string|authorization)/i;

/**
 * 递归遮敏感字段。
 *   - dict：遍历 entries；key 命中 sensitive pattern → value='[REDACTED]'；否则递归 value
 *   - array：遍历元素递归
 *   - primitive / null：原样返回
 *
 * 不 mutate 原对象，全部返回新对象 / 新数组。
 */
function redactValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactValue);
  return redactDict(value as Record<string, unknown>);
}

function redactDict(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[REDACTED]' : redactValue(v);
  }
  return out;
}

/**
 * 获取展示用 args——优先走 ToolMeta.redactArgs，否则走通用 sensitive key 兜底（递归）。
 * ToolCallDetail 必须调用此函数，不得直接 JSON.stringify(call.arguments)。
 */
export function getDisplayArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const meta = getToolMeta(toolName);
  if (meta.redactArgs) return meta.redactArgs(args);
  return redactDict(args);
}
