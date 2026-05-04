import { memo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { CapabilityChipList } from "./CapabilityChip";
import ProviderIcon from "./ProviderIcon";
import type { ModelInfo, ProviderInfo } from "@/lib/config/modelConfig";

/* ---------- types ---------- */

interface ProviderGroup extends ProviderInfo {
  models: ModelInfo[];
}

interface ModelSelectorPanelProps {
  modelsByProvider: ProviderGroup[];
  selectedModelId: string | null;
  recentModelIds: string[];
  allModels: ModelInfo[];
  activeProvider: string;
  onSelect: (modelId: string) => void;
  onProviderChange: (providerId: string) => void;
}

/* ---------- RecentModels ---------- */

const RecentModels = memo(
  ({
    modelIds,
    allModels,
    selectedModelId,
    providers,
    onSelect,
  }: {
    modelIds: string[];
    allModels: ModelInfo[];
    selectedModelId: string | null;
    providers: ProviderGroup[];
    onSelect: (id: string) => void;
  }) => {
    const offlineProviderIds = new Set(
      providers.filter((p) => p.status === "offline").map((p) => p.id),
    );
    const recentModels = modelIds
      .map((id) => allModels.find((m) => m.id === id))
      .filter((m): m is ModelInfo => m != null && m.enabled !== false);

    if (recentModels.length === 0) return null;

    return (
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
          最近使用
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {recentModels.map((model) => {
            const isOffline = offlineProviderIds.has(model.provider);
            const offlineProvider = providers.find((p) => p.id === model.provider);
            return (
              <button
                key={model.id}
                onClick={isOffline ? undefined : () => onSelect(model.id)}
                disabled={isOffline}
                title={
                  isOffline
                    ? `${offlineProvider?.name ?? model.provider} 当前不可用：${offlineProvider?.offline_reason ?? "未知"}`
                    : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-md border text-[11px] transition-colors",
                  model.id === selectedModelId
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-muted/50 border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  isOffline &&
                    "opacity-50 cursor-not-allowed hover:bg-muted/50 hover:text-muted-foreground",
                )}
              >
                <ProviderIcon providerId={model.provider} size={18} className="rounded" />
                {isOffline && <span className="text-muted-foreground">⊘</span>}
                {model.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
RecentModels.displayName = "RecentModels";

/* ---------- ProviderTabs ---------- */

const ProviderTabs = memo(
  ({
    providers,
    activeProvider,
    onProviderChange,
  }: {
    providers: ProviderGroup[];
    activeProvider: string;
    onProviderChange: (id: string) => void;
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>, providerId: string, idx: number) => {
        onProviderChange(providerId);

        const container = containerRef.current;
        if (!container) return;

        // 滚动到前一个标签的位置，使点击的标签及后续标签完整可见
        const buttons = container.querySelectorAll("button");
        const targetIdx = Math.max(0, idx - 1);
        const targetBtn = buttons[targetIdx];
        if (targetBtn) {
          container.scrollTo({
            left: (targetBtn as HTMLElement).offsetLeft,
            behavior: "smooth",
          });
        }
      },
      [onProviderChange],
    );

    return (
      <div ref={containerRef} className="flex border-y border-border bg-muted/30 overflow-x-auto scrollbar-hide">
        {providers.map((provider, idx) => {
          const isOffline = provider.status === "offline";
          return (
            <button
              key={provider.id}
              onClick={(e) => handleClick(e, provider.id, idx)}
              title={
                isOffline
                  ? `${provider.name} 当前不可用：${provider.offline_reason ?? "未知原因"}`
                  : undefined
              }
              className={cn(
                "px-3 py-2 text-[11px] whitespace-nowrap transition-colors shrink-0",
                idx === providers.length - 1 && "pr-6",
                provider.id === activeProvider
                  ? "text-primary font-semibold border-b-2 border-primary bg-popover -mb-px"
                  : "text-muted-foreground hover:text-foreground",
                isOffline && "opacity-50",
              )}
            >
              {isOffline && <span className="mr-1">⊘</span>}
              {provider.name}
            </button>
          );
        })}
      </div>
    );
  },
);
ProviderTabs.displayName = "ProviderTabs";

/* ---------- ModelCard ---------- */

const ModelCard = memo(
  ({
    model,
    isSelected,
    onSelect,
    disabled,
    disabledReason,
  }: {
    model: ModelInfo;
    isSelected: boolean;
    onSelect: () => void;
    disabled?: boolean;
    disabledReason?: string;
  }) => (
    <button
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={cn(
        "text-left p-2.5 rounded-lg border transition-colors duration-100 w-full",
        isSelected
          ? "bg-primary/5 border-primary/40"
          : "border-border/60 hover:bg-accent hover:border-border",
        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:border-border/60",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={cn("text-sm truncate", isSelected ? "font-semibold" : "font-medium")}>
          {disabled && <span className="mr-1 text-muted-foreground">⊘</span>}
          {model.name}
        </span>
        {isSelected && <Check size={14} className="shrink-0 text-primary" />}
      </div>
      <CapabilityChipList capabilities={model.capabilities} maxCount={4} />
    </button>
  ),
);
ModelCard.displayName = "ModelCard";

/* ---------- ModelSelectorPanel ---------- */

const ModelSelectorPanel = memo(
  ({
    modelsByProvider,
    selectedModelId,
    recentModelIds,
    allModels,
    activeProvider,
    onSelect,
    onProviderChange,
  }: ModelSelectorPanelProps) => {
    const activeGroup = modelsByProvider.find((g) => g.id === activeProvider);
    const filteredModels = activeGroup?.models || [];
    const groupOffline = activeGroup?.status === "offline";
    const groupDisabledReason = groupOffline
      ? `${activeGroup?.name} 当前不可用：${activeGroup?.offline_reason ?? "未知原因"}`
      : undefined;

    return (
      <div>
        <RecentModels
          modelIds={recentModelIds}
          allModels={allModels}
          selectedModelId={selectedModelId}
          providers={modelsByProvider}
          onSelect={onSelect}
        />
        <ProviderTabs
          providers={modelsByProvider}
          activeProvider={activeProvider}
          onProviderChange={onProviderChange}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 min-h-[240px] content-start">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isSelected={model.id === selectedModelId}
              onSelect={() => onSelect(model.id)}
              disabled={groupOffline}
              disabledReason={groupDisabledReason}
            />
          ))}
        </div>
      </div>
    );
  },
);
ModelSelectorPanel.displayName = "ModelSelectorPanel";

export default ModelSelectorPanel;
