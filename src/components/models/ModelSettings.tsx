'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { updateModelConfig } from '@/redux/slices/modelsSlice';
import React from 'react';

interface ModelSettingsProps {
  modelId: string;
}

const ModelSettings: React.FC<ModelSettingsProps> = ({ modelId }) => {
  const dispatch = useAppDispatch();
  const model = useAppSelector(state => 
    state.models.models.find(m => m.id === modelId)
  );
  
  if (!model) return null;
  
  const handleTemperatureChange = (value: number[]) => {
    dispatch(updateModelConfig({
      modelId,
      config: { temperature: value[0] }
    }));
  };
  
  const handleMaxTokensChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      dispatch(updateModelConfig({
        modelId,
        config: { maxTokens: value }
      }));
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>模型参数设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="temperature">温度 ({model.temperature})</Label>
            <span className="text-sm text-muted-foreground">
              值越低回答越确定，值越高回答越多样化
            </span>
          </div>
          <Slider
            id="temperature"
            min={0}
            max={1}
            step={0.1}
            value={[model.temperature]}
            onValueChange={handleTemperatureChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="max-tokens">最大输出长度</Label>
          <Input
            id="max-tokens"
            type="number"
            value={model.maxTokens}
            onChange={handleMaxTokensChange}
            min={1}
            max={100000}
          />
          <p className="text-sm text-muted-foreground">
            控制AI生成回复的最大长度
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ModelSettings;