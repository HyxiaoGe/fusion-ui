"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { updateChatModel } from "@/redux/slices/chatSlice";
import { setSelectedModel } from "@/redux/slices/modelsSlice";
import React from "react";
import CapabilityIcon from "./CapabilityIcon";
import ProviderIcon from "./ProviderIcon";

interface ModelSelectorProps {
  onChange?: (modelId: string) => void;
  className?: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onChange, className }) => {
  const dispatch = useAppDispatch();
  const { models, providers, selectedModelId } = useAppSelector(
    (state) => state.models
  );
  const { activeChatId } = useAppSelector((state) => state.chat);
  const { mode } = useAppSelector(state => state.theme);

  // 按提供商分组所有模型
  const modelsByProvider = [...providers]
    .sort((a, b) => a.order - b.order)
    .map((provider) => ({
      ...provider,
      models: models.filter((model) => model.provider === provider.id),
    }))
    .filter((group) => group.models.length > 0);

  const handleModelChange = (value: string) => {
    // 检查选择的模型是否启用
    const selectedModel = models.find(m => m.id === value);
    if (!selectedModel?.enabled) {
      return;
    }

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

  const selectedModel = models.find(
    (model) => model.id === selectedModelId
  );

  // 确定当前模式，用于应用正确的样式
  const isDarkMode = mode === 'dark';

  return (
    <>
      {/* 添加自定义样式 */}
      <style jsx global>{`
        /* 炫光扫过效果 */
        @keyframes shine-effect {
          0% {
            left: -100%;
            opacity: 0;
          }
          20% {
            opacity: 0.6;
          }
          80% {
            opacity: 0.6;
          }
          100% {
            left: 300%;
            opacity: 0;
          }
        }

        /* 光晕脉冲效果 */
        @keyframes glow-pulse {
          0% {
            box-shadow: 0 0 2px rgba(129, 140, 248, 0.1), 
                        0 0 4px rgba(129, 140, 248, 0.1), 
                        0 0 8px rgba(129, 140, 248, 0);
          }
          50% {
            box-shadow: 0 0 2px rgba(129, 140, 248, 0.4), 
                        0 0 8px rgba(129, 140, 248, 0.3), 
                        0 0 12px rgba(129, 140, 248, 0.2);
          }
          100% {
            box-shadow: 0 0 2px rgba(129, 140, 248, 0.1), 
                        0 0 4px rgba(129, 140, 248, 0.1), 
                        0 0 8px rgba(129, 140, 248, 0);
          }
        }

        /* 图标旋转跳动 */
        @keyframes bounce-rotate {
          0%, 100% {
            transform: scale(1) rotate(0deg);
          }
          50% {
            transform: scale(1.3) rotate(5deg);
          }
        }

        /* 边框渐变动画 */
        @keyframes border-flow {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        /* 强调当前选中项 */
        .highlight-selected {
          position: relative;
          z-index: 1;
        }

        .highlight-selected::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 8px;
          padding: 2px;
          background: linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
          -webkit-mask: 
            linear-gradient(#fff 0 0) content-box, 
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          background-size: 300% 300%;
          animation: border-flow 4s linear infinite;
          pointer-events: none;
          z-index: -1;
        }

        /* 炫酷悬停样式 */
        .model-item-ultra {
          position: relative;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); /* 有弹性的动画效果 */
          overflow: hidden;
          background-size: 200% 200%;
          z-index: 1;
        }

        /* 发光边框 */
        .model-item-ultra:hover {
          transform: translateY(-2px) scale(1.02);
          animation: glow-pulse 1.5s infinite;
        }

        /* 炫光扫过效果 */
        .model-item-ultra::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg, 
            transparent, 
            rgba(255, 255, 255, 0.3), 
            transparent
          );
          transform: skewX(-25deg);
          pointer-events: none;
          opacity: 0;
        }

        .model-item-ultra:hover::after {
          animation: shine-effect 1.2s;
        }

        /* 暗色模式特别强调 */
        .dark-mode-glow:hover {
          box-shadow: 0 0 5px rgba(59, 130, 246, 0.5), 
                      0 0 15px rgba(59, 130, 246, 0.3), 
                      0 0 25px rgba(59, 130, 246, 0.1);
        }

        /* 亮色模式特别强调 */
        .light-mode-highlight:hover {
          background-color: rgba(59, 130, 246, 0.15) !important;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        /* 针对图标的动画 */
        .ultra-icon {
          transition: all 0.3s ease;
        }

        .model-item-ultra:hover .ultra-icon {
          animation: bounce-rotate 0.8s ease infinite;
          filter: drop-shadow(0 0 2px rgba(59, 130, 246, 0.6));
        }
        
        /* 选中状态图标永久动画 */
        .selected-item .ultra-icon {
          animation: bounce-rotate 2s ease infinite;
          filter: drop-shadow(0 0 2px rgba(139, 92, 246, 0.6));
        }

        /* 右侧箭头动画 */
        .model-item-ultra .arrow-indicator {
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.3s ease;
        }

        .model-item-ultra:hover .arrow-indicator {
          opacity: 1;
          transform: translateX(0);
        }
      `}</style>

      <Select value={selectedModelId || ""} onValueChange={handleModelChange}>
        <SelectTrigger 
          className={`w-full transition-all duration-300 hover:shadow-lg focus:ring-2 focus:ring-offset-2 
                      ${isDarkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-400'}
                      ${className || ''}`}
        >
          <SelectValue placeholder="选择AI模型">
            {selectedModel && selectedModel.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[var(--select-dropdown-max-height)] overflow-y-auto p-0 bg-background border-border shadow-lg animate-in fade-in-20 zoom-in-95">
          {modelsByProvider.map((provider) => (
            <div key={provider.id} className="py-1 first:pt-2 last:pb-2">
              <div className={cn(
                "mx-1 mb-1 px-3 py-1.5 text-xs font-medium rounded-md flex items-center",
                "bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20"
              )}>
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
                  disabled={!model.enabled}
                  className={cn(
                    "model-item-ultra mx-1 my-1.5 px-3 py-3 rounded-lg",
                    "border border-transparent",
                    "transition-all duration-300 ease-out",
                    "focus:outline-none",
                    isDarkMode ? "dark-mode-glow" : "light-mode-highlight",
                    model.id === selectedModelId 
                      ? "highlight-selected selected-item border-blue-400/30 bg-blue-500/10" 
                      : "hover:border-blue-300/20",
                    "data-[highlighted]:bg-blue-100 dark:data-[highlighted]:bg-blue-900/30",
                    !model.enabled && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col min-w-[120px]">
                      <span className="font-medium truncate" title={model.name}>
                        {model.name}
                      </span>
                      <div className="flex gap-1 items-center mt-0.5">
                        {!model.enabled && (
                          <span className="text-[10px] text-gray-500 font-medium">即将开放</span>
                        )}
                        {model.experimental && (
                          <span className="text-[10px] text-amber-500 font-medium">实验性</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                      <div className="flex items-center gap-2">
                        {model.capabilities.vision && (
                          <CapabilityIcon type="vision" className="ultra-icon h-4 w-4" />
                        )}
                        {model.capabilities.imageGen && (
                          <CapabilityIcon type="imageGen" className="ultra-icon h-4 w-4" />
                        )}
                        {model.capabilities.deepThinking && (
                          <CapabilityIcon type="deepThinking" className="ultra-icon h-4 w-4" />
                        )}
                        {model.capabilities.fileSupport && (
                          <CapabilityIcon type="fileSupport" className="ultra-icon h-4 w-4" />
                        )}
                      </div>
                      <span className="text-xs font-medium min-w-[50px] px-2 py-1 rounded-full bg-blue-100/50 dark:bg-blue-900/30 text-center">
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
    </>
  );
};

export default ModelSelector;