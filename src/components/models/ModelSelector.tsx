"use client";

import { useMemo, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { setSelectedModel } from "@/redux/slices/modelsSlice";
import { updateConversationModel } from "@/redux/slices/conversationSlice";
import { getPreferredModelId } from "@/lib/models/modelPreference";
import { getRecentModels, addRecentModel } from "@/lib/models/recentModels";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ModelSelectorTrigger from "./ModelSelectorTrigger";
import ModelSelectorPanel from "./ModelSelectorPanel";

interface ModelSelectorProps {
  onChange?: (modelId: string) => void;
  modelId?: string;
  disabled?: boolean;
  className?: string;
  toolbarMode?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onChange, modelId, disabled }) => {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const { models, providers, selectedModelId } = useAppSelector((state) => state.models);
  const chats = useAppSelector((state) => state.conversation.byId);
  const [isOpen, setIsOpen] = useState(false);
  const [recentModelIds, setRecentModelIds] = useState<string[]>(getRecentModels);

  const activeChatId = pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : null;
  const activeChat = activeChatId ? chats[activeChatId] : null;
  const hasMessages = activeChat?.messages?.some((msg) => msg.role === "user") || false;

  const isDisabled = disabled || (!!activeChatId && hasMessages);

  const activeChatModelId = activeChat?.model_id;
  const currentModelId = modelId || activeChatModelId || getPreferredModelId(models, selectedModelId);

  const currentModel = useMemo(
    () => models.find((m) => m.id === currentModelId) ?? null,
    [models, currentModelId],
  );

  const modelsByProvider = useMemo(
    () =>
      [...providers]
        .sort((a, b) => a.order - b.order)
        .map((provider) => ({
          ...provider,
          models: models.filter((m) => m.provider === provider.id && m.enabled !== false),
        }))
        .filter((group) => group.models.length > 0),
    [providers, models],
  );

  const [activeProvider, setActiveProvider] = useState<string>("");
  const effectiveProvider = useMemo(() => {
    if (activeProvider && modelsByProvider.some((g) => g.id === activeProvider)) {
      return activeProvider;
    }
    const currentProvider = currentModel?.provider;
    if (currentProvider && modelsByProvider.some((g) => g.id === currentProvider)) {
      return currentProvider;
    }
    return modelsByProvider[0]?.id || "";
  }, [activeProvider, currentModel, modelsByProvider]);

  const handleModelChange = useCallback(
    (value: string) => {
      dispatch(setSelectedModel(value));

      if (activeChatId && !hasMessages) {
        dispatch(updateConversationModel({ id: activeChatId, model_id: value }));
      }

      addRecentModel(value);
      setRecentModelIds(getRecentModels());

      const selectedModel = models.find((m) => m.id === value);
      if (selectedModel) {
        setActiveProvider(selectedModel.provider);
      }

      onChange?.(value);
      setIsOpen(false);
    },
    [dispatch, activeChatId, hasMessages, onChange, models],
  );

  const handleProviderChange = useCallback((providerId: string) => {
    setActiveProvider(providerId);
  }, []);

  if (models.length === 0) return null;

  return (
    <Popover open={isOpen} onOpenChange={isDisabled ? undefined : setIsOpen}>
      <PopoverTrigger asChild>
        <ModelSelectorTrigger
          model={currentModel}
          providers={providers}
          isOpen={isOpen}
          disabled={isDisabled}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        avoidCollisions={true}
        sideOffset={4}
        className="p-0 w-[calc(100vw-32px)] sm:w-[480px] max-h-[420px] overflow-y-auto"
      >
        <ModelSelectorPanel
          modelsByProvider={modelsByProvider}
          selectedModelId={currentModelId}
          recentModelIds={recentModelIds}
          allModels={models}
          activeProvider={effectiveProvider}
          onSelect={handleModelChange}
          onProviderChange={handleProviderChange}
        />
      </PopoverContent>
    </Popover>
  );
};

export default ModelSelector;
