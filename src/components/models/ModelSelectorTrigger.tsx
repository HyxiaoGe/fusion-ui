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
  toolbarMode?: boolean;
  placeholderLabel?: string;
  onClick?: () => void;
}

const ModelSelectorTrigger = forwardRef<HTMLButtonElement, ModelSelectorTriggerProps>(
  ({
    model,
    providers,
    isOpen,
    disabled,
    toolbarMode = false,
    placeholderLabel = "选择模型",
    ...props
  }, ref) => {
    const providerName = model
      ? providers.find((p) => p.id === model.provider)?.name || model.provider
      : "";
    const capabilityLabels = model ? buildModelCapabilityLabels(model) : [];

    return (
      <button
        ref={ref}
        disabled={disabled}
        data-testid="model-selector-trigger"
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-bg-elevated hover:bg-muted text-sm text-foreground transition-colors duration-fast",
          toolbarMode && "h-8 w-[112px] max-w-[112px] justify-between px-1.5 sm:h-[66px] sm:w-64 sm:max-w-none sm:px-2.5",
          disabled && "cursor-default opacity-60",
          !disabled && "cursor-pointer",
          isOpen && "bg-muted",
        )}
        {...props}
      >
        {model ? (
          <>
            <ProviderIcon providerId={model.provider} size={16} className="rounded-md" />
            <div className="flex min-w-0 flex-col items-start leading-tight">
              <span className={cn(
                "truncate text-sm font-semibold",
                toolbarMode ? "max-w-[64px] sm:max-w-[140px]" : "max-w-[140px]",
              )}>{model.name}</span>
              <span
                data-testid="model-selector-provider"
                className={cn(
                  "text-[9px] text-muted-foreground",
                  toolbarMode && "hidden sm:block",
                )}
              >
                {providerName}
              </span>
              <div
                data-testid="model-selector-capabilities"
                className={cn(toolbarMode && "hidden sm:block")}
              >
                <CapabilityChipList labels={capabilityLabels} maxCount={4} />
              </div>
            </div>
          </>
        ) : (
          <span className="truncate px-1 text-sm">{placeholderLabel}</span>
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
