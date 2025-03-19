// src/components/models/ModelSettings.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { updateModelConfig } from "@/redux/slices/modelsSlice";
import React from "react";
import CapabilityIcon from "./CapabilityIcon";

interface ModelSettingsProps {
  modelId: string;
}

const ModelSettings: React.FC<ModelSettingsProps> = ({ modelId }) => {
  const dispatch = useAppDispatch();
  const model = useAppSelector((state) =>
    state.models.models.find((m) => m.id === modelId)
  );

  if (!model) return null;

  const handleTemperatureChange = (value: number[]) => {
    dispatch(
      updateModelConfig({
        modelId,
        config: { temperature: value[0] },
      })
    );
  };

  const handleMaxTokensChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      dispatch(
        updateModelConfig({
          modelId,
          config: { maxTokens: value },
        })
      );
    }
  };

  const handleCapabilityChange = (
    capability: keyof typeof model.capabilities,
    value: boolean
  ) => {
    dispatch(
      updateModelConfig({
        modelId,
        config: {
          capabilities: {
            ...model.capabilities,
            [capability]: value,
          },
        },
      })
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>模型参数设置 - {model.name}</CardTitle>
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

        <div className="space-y-2 pt-4 border-t">
          <Label>模型能力</Label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CapabilityIcon type="vision" />
                <div className="space-y-0.5">
                  <Label htmlFor="vision-capability">视觉识别</Label>
                  <p className="text-xs text-muted-foreground">
                    允许模型处理和理解图像
                  </p>
                </div>
              </div>
              <Switch
                id="vision-capability"
                checked={model.capabilities.vision || false}
                onCheckedChange={(checked) =>
                  handleCapabilityChange("vision", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CapabilityIcon type="fileSupport" />
                <div className="space-y-0.5">
                  <Label htmlFor="file-support">文件处理</Label>
                  <p className="text-xs text-muted-foreground">
                    允许模型处理上传的文件
                  </p>
                </div>
              </div>
              <Switch
                id="file-support"
                checked={model.capabilities.fileSupport || false}
                onCheckedChange={(checked) =>
                  handleCapabilityChange("fileSupport", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CapabilityIcon type="deepThinking" />
                <div className="space-y-0.5">
                  <Label htmlFor="deep-thinking">深度思考</Label>
                  <p className="text-xs text-muted-foreground">
                    增强模型的推理和问题解决能力
                  </p>
                </div>
              </div>
              <Switch
                id="deep-thinking"
                checked={model.capabilities.deepThinking || false}
                onCheckedChange={(checked) =>
                  handleCapabilityChange("deepThinking", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CapabilityIcon type="imageGen" />
                <div className="space-y-0.5">
                  <Label htmlFor="image-gen">图像生成</Label>
                  <p className="text-xs text-muted-foreground">
                    允许模型生成图像
                  </p>
                </div>
              </div>
              <Switch
                id="image-gen"
                checked={model.capabilities.imageGen || false}
                onCheckedChange={(checked) =>
                  handleCapabilityChange("imageGen", checked)
                }
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ModelSettings;
