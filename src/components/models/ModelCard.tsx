import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Model } from "@/redux/slices/modelsSlice";
import React from "react";
import CapabilityIcon from "./CapabilityIcon";

interface ModelCardProps {
  model: Model;
}

const ModelCard: React.FC<ModelCardProps> = ({ model }) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle>{model.name}</CardTitle>
          {model.experimental && (
            <Badge
              variant="outline"
              className="text-amber-500 border-amber-500"
            >
              实验性
            </Badge>
          )}
        </div>
        <CardDescription>
          上下文窗口: {model.contextWindow || `${model.maxTokens / 1000}K`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>最大Token数: {model.maxTokens.toLocaleString()}</div>
            <div>默认温度: {model.temperature}</div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {model.capabilities.vision && (
              <Badge variant="secondary" className="gap-1">
                <CapabilityIcon type="vision" showTooltip={false} />
                视觉识别
              </Badge>
            )}
            {model.capabilities.imageGen && (
              <Badge variant="secondary" className="gap-1">
                <CapabilityIcon type="imageGen" showTooltip={false} />
                图像生成
              </Badge>
            )}
            {model.capabilities.deepThinking && (
              <Badge variant="secondary" className="gap-1">
                <CapabilityIcon type="deepThinking" showTooltip={false} />
                深度思考
              </Badge>
            )}
            {model.capabilities.fileSupport && (
              <Badge variant="secondary" className="gap-1">
                <CapabilityIcon type="fileSupport" showTooltip={false} />
                文件处理
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ModelCard;
