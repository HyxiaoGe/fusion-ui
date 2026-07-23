/**
 * 工具元数据注册表（contract §8）。
 *
 * 加新工具只改这张表；组件代码不允许出现 if (toolName === '...') 这类硬编码。
 *
 * icon 用 Lucide component reference 而不是字符串——保证类型安全 + tree-shaking 友好。
 */

import { Search, Globe, MapPin, Plane, Route, Train, Wrench } from 'lucide-react';
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
  local_place_search: {
    label: '搜索附近地点',
    icon: MapPin,
    color: 'teal',
    summarize: (a) => joinSummaryParts(
      firstStringArgument(a, ['location', 'area', 'city', 'near']),
      firstStringArgument(a, ['query', 'keywords', 'keyword']),
      '附近地点',
    ),
  },
  route_compare: {
    label: '比较路线',
    icon: Route,
    color: 'info',
    summarize: (a) => {
      const origin = firstStringArgument(a, ['origin', 'from', 'start']);
      const destination = firstStringArgument(a, ['destination', 'to', 'end']);
      if (origin && destination) return `${origin} → ${destination}`;
      return origin || destination || '路线方案';
    },
  },
  search_flights: {
    label: '查询航班',
    icon: Plane,
    color: 'info',
    summarize: summarizeTravelQuery,
  },
  search_trains: {
    label: '查询高铁',
    icon: Train,
    color: 'teal',
    summarize: summarizeTravelQuery,
  },
};

const FALLBACK: ToolMeta = {
  label: '外部工具',
  icon: Wrench,
  color: 'neutral',
  summarize: () => '',
};

export function getToolMeta(toolName: string): ToolMeta {
  const found = TOOL_REGISTRY[toolName];
  if (found) return found;
  return FALLBACK;
}

export function hasToolMeta(toolName: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, toolName);
}

function firstStringArgument(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function joinSummaryParts(first: string, second: string, fallback: string): string {
  if (first && second) return `${first} · ${second}`;
  return first || second || fallback;
}

function summarizeTravelQuery(args: Record<string, unknown>): string {
  const origin = firstStringArgument(args, ['origin', 'from']);
  const destination = firstStringArgument(args, ['destination', 'to']);
  const date = firstStringArgument(args, ['departure_date', 'date']);
  const route = origin && destination ? `${origin} → ${destination}` : origin || destination;
  return joinSummaryParts(route, date, '出行方案');
}
