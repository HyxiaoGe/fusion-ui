import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp } from 'lucide-react';
import ProviderIcon from './ProviderIcon';
import type { ModelInfo } from '@/lib/config/modelConfig';

interface ModelSelectorTriggerProps {
  model: ModelInfo | null;
  isOpen: boolean;
  disabled: boolean;
  onClick?: () => void;
}

/** 获取模型简称：优先用 name，超过 10 字符截断 */
function getShortName(model: ModelInfo): string {
  const name = model.name;
  return name.length > 10 ? name.slice(0, 10) + '…' : name;
}

const ModelSelectorTrigger = forwardRef<HTMLButtonElement, ModelSelectorTriggerProps>(
  ({ model, isOpen, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors duration-150',
          'text-muted-foreground',
          disabled
            ? 'cursor-default'
            : 'cursor-pointer hover:bg-accent hover:text-accent-foreground',
          isOpen
            ? 'bg-accent border-primary/30'
            : 'border-border',
        )}
        {...props}
      >
        {model ? (
          <>
            <ProviderIcon providerId={model.provider} size={14} />
            <span className="truncate max-w-[100px]">{getShortName(model)}</span>
          </>
        ) : (
          <span>选择模型</span>
        )}
        <ChevronUp
          size={12}
          className={cn(
            'transition-transform duration-150 shrink-0',
            isOpen ? 'rotate-0' : 'rotate-180',
          )}
        />
      </button>
    );
  },
);

ModelSelectorTrigger.displayName = 'ModelSelectorTrigger';

export default ModelSelectorTrigger;
