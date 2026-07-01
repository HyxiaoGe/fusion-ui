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
    <span className={cn('rounded text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap', CHIP_TONE_CLASS[label.tone])}>
      {label.text}
    </span>
  );
});

CapabilityChip.displayName = 'CapabilityChip';

interface CapabilityChipListProps {
  labels: CapabilityLabel[];
  maxCount?: number;
}

/** 按优先级渲染能力 chip，最多显示 maxCount 个 */
export const CapabilityChipList = memo(({ labels, maxCount = 3 }: CapabilityChipListProps) => {
  const visible = labels.slice(0, maxCount);

  if (visible.length === 0) return null;

  return (
    <div className="flex gap-1 mt-1.5">
      {visible.map((label) => (
        <CapabilityChip key={label.key} label={label} />
      ))}
    </div>
  );
});

CapabilityChipList.displayName = 'CapabilityChipList';

export default CapabilityChip;
