import { memo } from 'react';
import { cn } from '@/lib/utils';

const CHIP_CONFIG: Record<string, { label: string; className: string }> = {
  deepThinking: { label: '思考', className: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400' },
  fileSupport: { label: '文件', className: 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400' },
  functionCalling: { label: '工具', className: 'bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400' },
  imageGen: { label: '画图', className: 'bg-pink-50 text-pink-600 dark:bg-pink-950/30 dark:text-pink-400' },
};

// 优先级顺序：思考 > 工具 > 文件 > 画图
const PRIORITY_ORDER = ['deepThinking', 'functionCalling', 'fileSupport', 'imageGen'];

interface CapabilityChipProps {
  type: string;
}

const CapabilityChip = memo(({ type }: CapabilityChipProps) => {
  const config = CHIP_CONFIG[type];
  if (!config) return null;

  return (
    <span className={cn('rounded text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap', config.className)}>
      {config.label}
    </span>
  );
});

CapabilityChip.displayName = 'CapabilityChip';

interface CapabilityChipListProps {
  capabilities: Record<string, boolean | undefined>;
  maxCount?: number;
}

/** 按优先级渲染能力 chip，最多显示 maxCount 个 */
export const CapabilityChipList = memo(({ capabilities, maxCount = 3 }: CapabilityChipListProps) => {
  const active = PRIORITY_ORDER.filter((key) => capabilities[key]);
  const visible = active.slice(0, maxCount);

  if (visible.length === 0) return null;

  return (
    <div className="flex gap-1 mt-1.5">
      {visible.map((key) => (
        <CapabilityChip key={key} type={key} />
      ))}
    </div>
  );
});

CapabilityChipList.displayName = 'CapabilityChipList';

export default CapabilityChip;
