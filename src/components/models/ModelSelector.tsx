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
      <SelectContent className="max-h-[var(--select-dropdown-max-height)] overflow-y-auto p-0">
        {modelsByProvider.map((provider) => (
          <div key={provider.id} className="mb-1 last:mb-0">
            <div className="sticky top-0 z-10 px-3 py-2 font-semibold text-sm bg-secondary border-b border-border flex items-center">
              <ProviderIcon
                providerId={provider.id}
                className="mr-2"
                size={18}
              />
              {provider.name}
            </div>

            {/* 模型列表 - 带轻微缩进和分隔 */}
            <div className="bg-popover py-2">
              {provider.models.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  className="mx-1 my-1 py-2 rounded-md hover:bg-accent focus:bg-accent"
                >
                  <div className="flex justify-between w-full items-center gap-2">
                    <div className="flex flex-col">
                      <span
                        className="truncate max-w-[150px]"
                        title={model.name}
                      >
                        {model.name}
                      </span>

                      {/* 如果是实验性模型，添加标签 */}
                      {model.experimental && (
                        <span className="text-xs text-amber-500">实验性</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {model.capabilities.vision && (
                        <CapabilityIcon type="vision" />
                      )}
                      {model.capabilities.imageGen && (
                        <CapabilityIcon type="imageGen" />
                      )}
                      {model.capabilities.deepThinking && (
                        <CapabilityIcon type="deepThinking" />
                      )}
                      {model.capabilities.fileSupport && (
                        <CapabilityIcon type="fileSupport" />
                      )}
                      <span className="text-xs text-muted-foreground ml-1">
                        {model.contextWindow}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </div>
          </div>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;
