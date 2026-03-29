import { memo } from 'react';
import { cn } from '@/lib/utils';
import { CapabilityChipList } from './CapabilityChip';
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
          {/* 分隔线（第一个 provider 不显示） */}
          {providerIndex > 0 && <div className="border-t border-border mx-2" />}

          {/* Provider 标题 */}
          <div className="text-xs text-muted-foreground font-medium px-3 pt-3 pb-1.5">
            {provider.name}
          </div>

          {/* 模型卡片网格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2 pb-1">
            {provider.models.map((model) => {
              const isSelected = model.id === selectedModelId;
              return (
                <button
                  key={model.id}
                  onClick={() => onSelect(model.id)}
                  className={cn(
                    'text-left p-3 rounded-lg border transition-colors duration-100',
                    isSelected
                      ? 'bg-primary/8 border-primary/30'
                      : 'border-transparent hover:bg-accent hover:border-border',
                  )}
                >
                  <div className={cn('text-sm truncate', isSelected ? 'font-semibold' : 'font-medium')}>
                    {model.name}
                  </div>

                  {/* 推荐标签 或 描述 */}
                  {model.id === recommendedId ? (
                    <span className="inline-block mt-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      推荐
                    </span>
                  ) : model.description ? (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {model.description}
                    </div>
                  ) : null}

                  {/* 能力 chip */}
                  <CapabilityChipList capabilities={model.capabilities} maxCount={3} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

ModelSelectorPanel.displayName = 'ModelSelectorPanel';

export default ModelSelectorPanel;
