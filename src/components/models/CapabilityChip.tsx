import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { CapabilityLabel, CapabilityTone } from '@/lib/models/modelCapabilityPresentation';

const CHIP_TONE_CLASS: Record<CapabilityTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  muted: 'bg-muted text-muted-foreground',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
};

interface CapabilityChipProps {
  label: CapabilityLabel;
}

const CapabilityChip = memo(({ label }: CapabilityChipProps) => {
  return (
    <span className={cn('inline-flex max-w-full min-w-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none', CHIP_TONE_CLASS[label.tone])}>
      <span className="truncate">{label.text}</span>
    </span>
  );
});

CapabilityChip.displayName = 'CapabilityChip';

interface CapabilityChipListProps {
  labels: CapabilityLabel[];
  maxCount?: number;
  className?: string;
}

/** 按优先级渲染能力 chip，最多显示 maxCount 个 */
export const CapabilityChipList = memo(({ labels, maxCount = 3, className }: CapabilityChipListProps) => {
  const visible = labels.slice(0, maxCount);

  if (visible.length === 0) return null;

  return (
    <div className={cn("mt-1.5 flex min-w-0 flex-wrap gap-1", className)}>
      {visible.map((label) => (
        <CapabilityChip key={label.key} label={label} />
      ))}
    </div>
  );
});

CapabilityChipList.displayName = 'CapabilityChipList';

export default CapabilityChip;
