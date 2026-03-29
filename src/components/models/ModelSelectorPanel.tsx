import { memo } from 'react';
import { cn } from '@/lib/utils';
import { CapabilityChipList } from './CapabilityChip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ModelInfo, ProviderInfo } from '@/lib/config/modelConfig';
import { getDefaultModelId } from '@/lib/models/modelPreference';

interface ProviderGroup extends ProviderInfo {
  models: ModelInfo[];
}

interface ModelSelectorPanelProps {
  modelsByProvider: ProviderGroup[];
  selectedModelId: string | null;
  allModels: ModelInfo[];
  onSelect: (modelId: string) => void;
}

const ModelCard = memo(({
  model,
  isSelected,
  isRecommended,
  onSelect,
}: {
  model: ModelInfo;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) => {
  const card = (
    <button
      onClick={onSelect}
      className={cn(
        'text-left p-3 rounded-lg border transition-colors duration-100 w-full',
        isSelected
          ? 'bg-primary/8 border-primary/30'
          : 'border-transparent hover:bg-accent hover:border-border',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('text-sm truncate', isSelected ? 'font-semibold' : 'font-medium')}>
          {model.name}
        </span>
        {isRecommended && (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            推荐
          </span>
        )}
      </div>
      <CapabilityChipList capabilities={model.capabilities} maxCount={3} />
    </button>
  );

  if (model.description) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{card}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px] text-xs">
            {model.description}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return card;
});

ModelCard.displayName = 'ModelCard';

const ModelSelectorPanel = memo(({
  modelsByProvider,
  selectedModelId,
  allModels,
  onSelect,
}: ModelSelectorPanelProps) => {
  const recommendedId = getDefaultModelId(allModels);

  return (
    <div className="py-1">
      {modelsByProvider.map((provider, providerIndex) => (
        <div key={provider.id}>
          {providerIndex > 0 && <div className="border-t border-border mx-2" />}

          <div className="text-xs text-muted-foreground font-medium px-3 pt-3 pb-1.5">
            {provider.name}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2 pb-1">
            {provider.models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                isSelected={model.id === selectedModelId}
                isRecommended={model.id === recommendedId}
                onSelect={() => onSelect(model.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

ModelSelectorPanel.displayName = 'ModelSelectorPanel';

export default ModelSelectorPanel;
