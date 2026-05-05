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
