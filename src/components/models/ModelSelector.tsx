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
import React, { useState, useRef, useEffect } from "react";
import CapabilityIcon from "./CapabilityIcon";
import ProviderIcon from "./ProviderIcon";

interface ModelSelectorProps {
  onChange?: (modelId: string) => void;
  modelId?: string;
  disabled?: boolean;
  className?: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onChange, modelId, disabled, className }) => {
  const dispatch = useAppDispatch();
  const { models, providers, selectedModelId } = useAppSelector(
    (state) => state.models
  );
  const { activeChatId } = useAppSelector((state) => state.chat);
  const { mode } = useAppSelector(state => state.theme);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 确保当下拉框关闭时，重置悬停状态
  useEffect(() => {
    const handleClickOutside = () => {
      setHoveredModel(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
    (model) => model.id === (modelId || selectedModelId)
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
          border: 1px solid transparent;
          transition: border-color 0.2s;
        }

        /* 发光边框 */
        .model-item-ultra:hover {
          transform: translateY(-2px) scale(1.02);
          animation: glow-pulse 1.5s infinite;
          border-color: rgba(59, 130, 246, 0.3);
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

        /* 隐藏选中指示器 */
        [data-slot="select-item"] span.absolute.right-2,
        [data-slot="select-item-indicator"],
        .select-item-indicator {
          display: none !important;
        }
        
        /* 修改选中项样式 */
        [data-slot="select-item"] {
          padding-right: 8px !important;
          display: flex !important;
          align-items: center !important;
          position: relative !important;
        }
        
        /* 专门处理128K等元素居右 */
        .context-window-badge {
          position: absolute !important;
          right: 8px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        }
        
        /* 处理能力图标靠右排列 */
        .capability-icons {
          position: absolute !important;
          right: 60px !important; /* 确保在上下文窗口标签左侧 */
          top: 50% !important;
          transform: translateY(-50%) !important;
          display: flex !important;
          gap: 4px !important;
        }

        /* 模型描述悬停提示 */
        .model-tooltip {
          position: fixed;
          z-index: 9999;
          width: 280px;
          padding: 12px;
          border-radius: 8px;
          background-color: var(--popover-bg, rgba(255, 255, 255, 0.98));
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          font-size: 13px;
          line-height: 1.5;
          color: var(--popover-fg, #333);
          pointer-events: none;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.2s, transform 0.2s;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .dark .model-tooltip {
          background-color: rgba(30, 30, 30, 0.98);
          color: #eee;
          border-color: rgba(255, 255, 255, 0.1);
        }

        .model-tooltip.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .model-tooltip-header {
          font-weight: 600;
          margin-bottom: 5px;
          padding-bottom: 5px;
          border-bottom: 1px solid rgba(128, 128, 128, 0.2);
        }

        .model-tooltip-content {
          font-size: 12px;
          color: var(--popover-fg-muted, #666);
        }

        .dark .model-tooltip-content {
          color: #aaa;
        }

        .model-tooltip-footer {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(128, 128, 128, 0.2);
          font-size: 11px;
          color: var(--popover-fg-muted, #666);
        }

        .dark .model-tooltip-footer {
          color: #999;
        }
      `}</style>

      <Select value={modelId || selectedModelId || ""} onValueChange={handleModelChange} disabled={disabled}>
        <SelectTrigger 
          className={`w-[300px] transition-all duration-300 hover:shadow-lg focus:ring-2 focus:ring-offset-2 
                      ${isDarkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-400'}
                      ${className || ''}`}
        >
          <SelectValue placeholder="选择AI模型">
            {selectedModel && selectedModel.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent 
          ref={dropdownRef}
          className="max-h-[var(--select-dropdown-max-height)] w-[300px] overflow-y-auto p-0 bg-background border-border shadow-lg animate-in fade-in-20 zoom-in-95">
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
                  disabled={!model.enabled || disabled}
                  className={cn(
                    "model-item-ultra mx-1 my-1.5 px-3 py-3 rounded-lg",
                    "border border-transparent",
                    "transition-all duration-300 ease-out",
                    "focus:outline-none",
                    isDarkMode ? "dark-mode-glow" : "light-mode-highlight",
                    model.id === (modelId || selectedModelId) 
                      ? "highlight-selected selected-item border-blue-400/30 bg-blue-500/10" 
                      : "hover:border-blue-300/20",
                    "data-[highlighted]:bg-blue-100 dark:data-[highlighted]:bg-blue-900/30",
                    !model.enabled && "opacity-60 cursor-not-allowed"
                  )}
                  onMouseEnter={(e) => {
                    setHoveredModel(model.id);
                    // 计算提示框位置
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltipPosition({
                      x: rect.left + rect.width + 10,
                      y: rect.top + rect.height / 2
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredModel(null);
                  }}
                >
                  {/* 对整个布局进行重新设计，确保窗口大小在最右，能力图标紧靠左侧 */}
                  <div className="flex items-center w-full pr-20">
                    <div className="flex-grow overflow-hidden">
                      <div className="font-medium truncate" title={model.name}>
                        {model.name}
                      </div>
                      <div className="flex gap-1 items-center mt-0.5">
                        {!model.enabled && (
                          <span className="text-[10px] text-gray-500 font-medium">即将开放</span>
                        )}
                        {model.experimental && (
                          <span className="text-[10px] text-amber-500 font-medium">实验性</span>
                        )}
                      </div>
                    </div>
                    
                    {/* 能力图标组放在右侧 */}
                    <div className="capability-icons">
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
                    
                    {/* 上下文窗口大小放在最右侧 */}
                    <span className="context-window-badge text-xs font-medium px-2 py-1 rounded-full bg-blue-100/50 dark:bg-blue-900/30 text-center">
                      {model.contextWindow} 
                    </span>
                  </div>
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>

      {/* 模型悬停提示（移动到组件外部，使用fixed定位） */}
      {hoveredModel && (() => {
        const model = models.find(m => m.id === hoveredModel);
        if (!model) return null;
        
        return (
          <div 
            className={`model-tooltip visible ${isDarkMode ? 'dark' : ''}`}
            style={{ 
              left: `${tooltipPosition.x}px`, 
              top: `${tooltipPosition.y}px`,
              transform: 'translate(0, -50%)'
            }}
          >
            <div className="model-tooltip-header">{model.name}</div>
            <div className="model-tooltip-content">
              {model.description || '暂无详细描述'}
              
              <div className="flex flex-wrap gap-2 mt-2">
                {model.capabilities.vision && (
                  <div className="flex items-center text-xs bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                    <CapabilityIcon type="vision" className="h-3 w-3 mr-1" />
                    视觉能力
                  </div>
                )}
                {model.capabilities.imageGen && (
                  <div className="flex items-center text-xs bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                    <CapabilityIcon type="imageGen" className="h-3 w-3 mr-1" />
                    图像生成
                  </div>
                )}
                {model.capabilities.deepThinking && (
                  <div className="flex items-center text-xs bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded-full">
                    <CapabilityIcon type="deepThinking" className="h-3 w-3 mr-1" />
                    思考过程
                  </div>
                )}
                {model.capabilities.fileSupport && (
                  <div className="flex items-center text-xs bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded-full">
                    <CapabilityIcon type="fileSupport" className="h-3 w-3 mr-1" />
                    文件支持
                  </div>
                )}
              </div>
            </div>
            <div className="model-tooltip-footer">
              <span>最大Tokens: {model.maxTokens.toLocaleString()}</span>
              <span>上下文窗口: {model.contextWindow}</span>
            </div>
          </div>
        );
      })()}
    </>
  );
};

export default ModelSelector;