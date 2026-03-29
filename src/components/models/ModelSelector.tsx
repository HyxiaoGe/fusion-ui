"use client";

import { useMemo, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { setSelectedModel } from "@/redux/slices/modelsSlice";
import { updateConversationModel } from "@/redux/slices/conversationSlice";
import { getDefaultModelId, getPreferredModelId } from "@/lib/models/modelPreference";
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

const ModelSelector: React.FC<ModelSelectorProps> = ({
  onChange,
  modelId,
  disabled,
}) => {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const { models, providers, selectedModelId } = useAppSelector((state) => state.models);
  const chats = useAppSelector((state) => state.conversation.byId);
  const [isOpen, setIsOpen] = useState(false);

  const activeChatId = pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : null;
  const activeChat = activeChatId ? chats[activeChatId] : null;
  const hasMessages = activeChat?.messages?.some((msg) => msg.role === "user") || false;

  // 有消息的会话不可切换模型
  const isDisabled = disabled || (!!activeChatId && hasMessages);

  // 当前模型 ID
  const activeChatModelId = activeChat?.model_id;
  const currentModelId =
    modelId ||
    activeChatModelId ||
    getPreferredModelId(models, selectedModelId);

  // 当前模型对象
  const currentModel = useMemo(
    () => models.find((m) => m.id === currentModelId) ?? null,
    [models, currentModelId],
  );

  // 只显示 enabled 的模型，按 provider 分组
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

  const handleModelChange = useCallback(
    (value: string) => {
      dispatch(setSelectedModel(value));

      if (activeChatId && !hasMessages) {
        dispatch(updateConversationModel({ id: activeChatId, model_id: value }));
      }

      onChange?.(value);
      setIsOpen(false);
    },
    [dispatch, activeChatId, hasMessages, onChange],
  );

  // 模型还没加载时不渲染
  if (models.length === 0) return null;

  return (
    <Popover open={isOpen} onOpenChange={isDisabled ? undefined : setIsOpen}>
      <PopoverTrigger asChild>
        <ModelSelectorTrigger
          model={currentModel}
          isOpen={isOpen}
          disabled={isDisabled}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        avoidCollisions={true}
        sideOffset={4}
        className="p-0 w-[calc(100vw-32px)] sm:w-[360px] max-h-[420px] overflow-y-auto"
      >
        <ModelSelectorPanel
          modelsByProvider={modelsByProvider}
          selectedModelId={currentModelId}
          allModels={models}
          onSelect={handleModelChange}
        />
      </PopoverContent>
    </Popover>
  );
};

export default ModelSelector;
