// src/components/models/CapabilityIcon.tsx
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { BrainCircuit, Eye, FileText, ImageIcon } from "lucide-react";
import React from "react";

interface CapabilityIconProps {
  type: "vision" | "fileSupport" | "deepThinking" | "imageGen";
  className?: string;
  showTooltip?: boolean;
}

const CapabilityIcon: React.FC<CapabilityIconProps> = ({
  type,
  className = "h-4 w-4",
  showTooltip = true,
}) => {
  const iconMap = {
    vision: {
      icon: <Eye className={`${className} text-blue-500`} />,
      tooltip: "支持视觉识别",
    },
    fileSupport: {
      icon: <FileText className={`${className} text-green-500`} />,
      tooltip: "支持文件处理",
    },
    deepThinking: {
      icon: <BrainCircuit className={`${className} text-amber-500`} />,
      tooltip: "支持深度思考",
    },
    imageGen: {
      icon: <ImageIcon className={`${className} text-purple-500`} />,
      tooltip: "支持图像生成",
    },
  };

  const { icon, tooltip } = iconMap[type];

  if (!showTooltip) return icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{icon}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default CapabilityIcon;
