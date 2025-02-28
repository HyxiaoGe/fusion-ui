'use client';

import React from 'react';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import { setSelectedModel } from '@/redux/slices/modelsSlice';
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
  
  // 只显示启用的模型
  const enabledModels = models.filter(model => model.enabled);
  
  const handleModelChange = (value: string) => {
    dispatch(setSelectedModel(value));
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