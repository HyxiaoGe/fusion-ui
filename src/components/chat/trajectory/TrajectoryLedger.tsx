'use client';

import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import {
  TrajectoryTable,
  type TrajectoryInspectTarget,
} from './TrajectoryTable';

export type { TrajectoryInspectTarget } from './TrajectoryTable';

export interface TrajectoryLedgerProps {
  cells: readonly TrajectoryCell[];
  selectedCellKey: string | null;
  inspectTarget?: TrajectoryInspectTarget | null;
  viewportHeight?: number;
  initialScrollTop?: number;
  /** 新会话或新视图恢复事务必须更换 identity；同 identity 不会覆盖后续用户滚动。 */
  restoreKey?: string | number | null;
  onSelectCell?: (cell: TrajectoryCell, index: number) => void;
  onInspectTargetResolved?: (
    target: TrajectoryInspectTarget,
    index: number,
    cell: TrajectoryCell,
  ) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  className?: string;
}

/** 旧账本的临时兼容入口；虚拟滚动与交互统一由 TrajectoryTable 提供。 */
export function TrajectoryLedger({
  onScrollTopChange,
  ...props
}: TrajectoryLedgerProps) {
  return (
    <TrajectoryTable
      {...props}
      ariaLabel="轨迹账本"
      onViewportStateChange={state => {
        if (state.userInitiated) onScrollTopChange?.(state.scrollTop);
      }}
    />
  );
}
