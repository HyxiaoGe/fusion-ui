import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronUp } from "lucide-react";
import { buildModelCapabilityLabels } from "@/lib/models/modelCapabilityPresentation";
import { CapabilityChipList } from "./CapabilityChip";
import ProviderIcon from "./ProviderIcon";
import type { ModelInfo, ProviderInfo } from "@/lib/config/modelConfig";

interface ModelSelectorTriggerProps {
  model: ModelInfo | null;
  providers: ProviderInfo[];
  isOpen: boolean;
  disabled: boolean;
  title?: string;
  onClick?: () => void;
}

const ModelSelectorTrigger = forwardRef<HTMLButtonElement, ModelSelectorTriggerProps>(
  ({ model, providers, isOpen, disabled, ...props }, ref) => {
    const providerName = model
      ? providers.find((p) => p.id === model.provider)?.name || model.provider
      : "";
    const capabilityLabels = model ? buildModelCapabilityLabels(model) : [];

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-bg-elevated hover:bg-muted text-sm text-foreground transition-colors duration-fast",
          disabled && "cursor-default opacity-60",
          !disabled && "cursor-pointer",
          isOpen && "bg-muted",
        )}
        {...props}
      >
        {model ? (
          <>
            <ProviderIcon providerId={model.provider} size={16} className="rounded-md" />
            <div className="flex flex-col items-start leading-tight">
              <span className="font-semibold text-sm truncate max-w-[140px]">{model.name}</span>
              <span className="text-[9px] text-muted-foreground">{providerName}</span>
              <CapabilityChipList labels={capabilityLabels} maxCount={4} />
            </div>
          </>
        ) : (
          <span className="px-1 text-sm">选择模型</span>
        )}
        <ChevronUp
          className={cn(
            "w-3 h-3 text-muted-foreground transition-transform duration-fast shrink-0",
            isOpen ? "rotate-0" : "rotate-180",
          )}
        />
      </button>
    );
  },
);

ModelSelectorTrigger.displayName = "ModelSelectorTrigger";

export default ModelSelectorTrigger;
