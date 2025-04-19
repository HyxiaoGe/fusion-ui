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
    <Card className={!model.enabled ? 'opacity-60' : ''}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle>{model.name}</CardTitle>
          <div className="flex gap-2">
            {!model.enabled && (
              <Badge variant="outline" className="text-gray-500 border-gray-500">
                即将开放
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 mt-2">
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
