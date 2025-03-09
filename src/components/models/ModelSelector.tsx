'use client';

import React from 'react';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import { setSelectedModel } from '@/redux/slices/modelsSlice';
import { updateChatModel } from '@/redux/slices/chatSlice'; // 添加这个新动作
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface ModelSelectorProps {
  onChange?: (modelId: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onChange }) => {
  const dispatch = useAppDispatch();
  const { models, selectedModelId } = useAppSelector(state => state.models);
  const { activeChatId } = useAppSelector(state => state.chat); // 获取当前活动聊天ID
  
  // 只显示启用的模型
  const enabledModels = models.filter(model => model.enabled);
  
  const handleModelChange = (value: string) => {
    dispatch(setSelectedModel(value));
    
    // 如果有活动聊天，同时更新聊天的模型ID
    if (activeChatId) {
      dispatch(updateChatModel({
        chatId: activeChatId,
        modelId: value
      }));
    }
    
    if (onChange) {
      onChange(value);
    }
  };
  
  return (
    <Select
      value={selectedModelId || ''}
      onValueChange={handleModelChange}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="选择AI模型" />
      </SelectTrigger>
      <SelectContent>
        {enabledModels.map(model => (
          <SelectItem key={model.id} value={model.id}>
            {model.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;