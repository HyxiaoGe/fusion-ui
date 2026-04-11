import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronUp } from "lucide-react";
import ProviderIcon from "./ProviderIcon";
import type { ModelInfo, ProviderInfo } from "@/lib/config/modelConfig";

interface ModelSelectorTriggerProps {
  model: ModelInfo | null;
  providers: ProviderInfo[];
  isOpen: boolean;
  disabled: boolean;
  onClick?: () => void;
}

const ModelSelectorTrigger = forwardRef<HTMLButtonElement, ModelSelectorTriggerProps>(
  ({ model, providers, isOpen, disabled, ...props }, ref) => {
    const providerName = model
      ? providers.find((p) => p.id === model.provider)?.name || model.provider
      : "";

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-lg border text-xs transition-colors duration-150",
          "text-foreground",
          disabled
            ? "cursor-default opacity-60"
            : "cursor-pointer hover:bg-accent",
          isOpen ? "bg-accent border-primary/30" : "border-border",
        )}
        {...props}
      >
        {model ? (
          <>
            <ProviderIcon providerId={model.provider} size={22} className="rounded-md" />
            <div className="flex flex-col items-start leading-tight">
              <span className="font-semibold text-xs truncate max-w-[140px]">{model.name}</span>
              <span className="text-[9px] text-muted-foreground">{providerName}</span>
            </div>
          </>
        ) : (
          <span className="px-1">选择模型</span>
        )}
        <ChevronUp
          size={12}
          className={cn(
            "transition-transform duration-150 shrink-0 text-muted-foreground",
            isOpen ? "rotate-0" : "rotate-180",
          )}
        />
      </button>
    );
  },
);

ModelSelectorTrigger.displayName = "ModelSelectorTrigger";

export default ModelSelectorTrigger;
