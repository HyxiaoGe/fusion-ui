/**
 * 通用 SemanticColor → Tailwind class lookup map（contract §8 + §12）。
 *
 * Tailwind JIT 需要 literal class string；Record 强制覆盖 6 种 SemanticColor，
 * 加新色时 TS 立刻报错，避免组件渲染时静默 fallback 灰色。
 *
 * 三个 map 服务不同视觉用途（chip / step number / status tag），class 顺序略有差异
 * 但都是 text + bg + border 三件套。
 */

import type { SemanticColor } from './toolRegistry';

/** ToolCallChip：text + border + bg 顺序（chip 视觉，border 优先于 bg 强调） */
export const CHIP_COLOR_CLASSES: Record<SemanticColor, string> = {
  info:    'text-info border-info/30 bg-info/10',
  success: 'text-success border-success/30 bg-success/10',
  warn:    'text-warn border-warn/30 bg-warn/10',
  danger:  'text-danger border-danger/30 bg-danger/10',
  teal:    'text-teal border-teal/30 bg-teal/10',
  neutral: 'text-muted-foreground border-border bg-muted/30',
};

/** AgentStepCard StepNumber：bg + text + border 顺序（圆形 step 编号，bg 优先填充） */
export const STEP_NUMBER_COLOR_CLASSES: Record<SemanticColor, string> = {
  info:    'bg-info/10 text-info border-info/30',
  success: 'bg-success/10 text-success border-success/30',
  warn:    'bg-warn/10 text-warn border-warn/30',
  danger:  'bg-danger/10 text-danger border-danger/30',
  teal:    'bg-teal/10 text-teal border-teal/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

/** RunHeader StatusTag：text + bg + border 顺序（小标签，text 优先于 bg 强调） */
export const STATUS_TAG_COLOR_CLASSES: Record<SemanticColor, string> = {
  info:    'text-info bg-info/10 border-info/30',
  success: 'text-success bg-success/10 border-success/30',
  warn:    'text-warn bg-warn/10 border-warn/30',
  danger:  'text-danger bg-danger/10 border-danger/30',
  teal:    'text-teal bg-teal/10 border-teal/30',
  neutral: 'text-muted-foreground bg-muted/30 border-border',
};
