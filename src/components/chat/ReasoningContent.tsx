import React from 'react';
import { Button } from '@/components/ui/button';
import { BrainCircuit, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReasoningContentProps {
  reasoning: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
  className?: string;
  isStreaming?: boolean;
}

const ReasoningContent: React.FC<ReasoningContentProps> = ({
  reasoning,
  isVisible,
  onToggleVisibility,
  isStreaming = false,
  className
}) => {
  // 检测是否有推理内容
  if (!reasoning || reasoning.trim() === '') {
    return null;
  }

  // 如果推理内容不可见，显示切换按钮
  if (!isVisible) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center text-xs text-muted-foreground"
        onClick={onToggleVisibility}
      >
        <BrainCircuit className="h-3 w-3 mr-1" />
        显示思考过程
      </Button>
    );
  }

  // 不再需要提取和格式化，直接使用推理内容
  const formattedReasoning = reasoning.trim();

  return (
    <div className={cn("mb-3", className)}>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center text-xs text-muted-foreground">
          <BrainCircuit className="h-3 w-3 mr-1" />
          <span>思考过程</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onToggleVisibility}
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
      </div>
      <div className={cn(
        "bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-sm font-mono overflow-auto whitespace-pre-wrap",
        isStreaming && "animate-pulse" // 流式渲染时添加脉动动画
      )}>
        {formattedReasoning}
        {isStreaming && (
          <span className="ml-1 inline-block h-4 w-0.5 bg-current animate-pulse"></span>
        )}
      </div>
    </div>
  );
};

export default ReasoningContent;