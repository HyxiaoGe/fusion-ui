"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { updateChatModel } from "@/redux/slices/chatSlice";
import { setSelectedModel } from "@/redux/slices/modelsSlice";
import React from "react";
import CapabilityIcon from "./CapabilityIcon";
import ProviderIcon from "./ProviderIcon";

interface ModelSelectorProps {
  onChange?: (modelId: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onChange }) => {
  const dispatch = useAppDispatch();
  const { models, providers, selectedModelId } = useAppSelector(
    (state) => state.models
  );
  const { activeChatId } = useAppSelector((state) => state.chat);

  // 只显示启用的模型
  const enabledModels = models.filter((model) => model.enabled);

  // 按提供商分组模型
  const modelsByProvider = [...providers]
    .sort((a, b) => a.order - b.order)
    .map((provider) => ({
      ...provider,
      models: enabledModels.filter((model) => model.provider === provider.id),
    }))
    .filter((group) => group.models.length > 0);

  const handleModelChange = (value: string) => {
    dispatch(setSelectedModel(value));

    // 如果有活动聊天，同时更新聊天的模型ID
    if (activeChatId) {
      dispatch(
        updateChatModel({
          chatId: activeChatId,
          modelId: value,
        })
      );
    }

    if (onChange) {
      onChange(value);
    }
  };

  const selectedModel = enabledModels.find(
    (model) => model.id === selectedModelId
  );

  return (
    <Select value={selectedModelId || ""} onValueChange={handleModelChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="选择AI模型">
          {selectedModel && selectedModel.name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[var(--select-dropdown-max-height)] overflow-y-auto p-0 bg-background border-border shadow-lg">
        {modelsByProvider.map((provider) => (
          <div key={provider.id} className="py-1 first:pt-2 last:pb-2">
            <div className="mx-1 mb-1 px-3 py-1.5 text-xs font-medium bg-primary/10 rounded-md flex items-center">
              <ProviderIcon
                providerId={provider.id}
                className="mr-1.5"
                size={14}
              />
              {provider.name}
            </div>
            {provider.models.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                className="mx-1 my-0.5 px-3 py-2 rounded-md hover:bg-accent/50 focus:bg-accent/50 border border-transparent hover:border-primary/20 bg-transparent"
              >
                <div className="flex justify-between w-full items-center gap-2">
                  <div className="flex flex-col min-w-[120px]">
                    <span className="font-medium truncate" title={model.name}>
                      {model.name}
                    </span>
                    {model.experimental && (
                      <span className="text-[10px] text-amber-500 font-medium">实验性</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="flex items-center gap-1">
                      {model.capabilities.vision && (
                        <CapabilityIcon type="vision" className="h-3.5 w-3.5" />
                      )}
                      {model.capabilities.imageGen && (
                        <CapabilityIcon type="imageGen" className="h-3.5 w-3.5" />
                      )}
                      {model.capabilities.deepThinking && (
                        <CapabilityIcon type="deepThinking" className="h-3.5 w-3.5" />
                      )}
                      {model.capabilities.fileSupport && (
                        <CapabilityIcon type="fileSupport" className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-medium min-w-[40px] text-right">
                      {model.contextWindow}
                    </span>
                  </div>
                </div>
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
