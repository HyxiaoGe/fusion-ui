import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HelpCircle, MessageSquare, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { useToast } from '@/components/ui/toast';

interface SuggestedQuestionsProps {
  questions: string[];
  isLoading: boolean;
  onSelectQuestion: (question: string) => void;
  onRefresh?: () => void; // 添加刷新回调函数
  className?: string;
}

const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ 
  questions, 
  isLoading,
  onSelectQuestion,
  onRefresh,
  className
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { toast } = useToast();

  // 如果没有问题且没有在加载中，则不显示组件
  if (questions.length === 0 && !isLoading) return null;

  // 处理问题选择的函数，添加登录检查
  const handleQuestionSelect = (question: string) => {
    // 检查登录状态
    if (!isAuthenticated) {
      toast({
        message: "请先登录后再使用聊天功能",
        type: "warning",
        duration: 3000
      });
      if ((globalThis as any).triggerLoginDialog) {
        (globalThis as any).triggerLoginDialog();
      }
      return;
    }
    
    onSelectQuestion(question);
  };
  
  // 处理刷新按钮点击
  const handleRefresh = () => {
    if (onRefresh && !isLoading) {
      setIsRefreshing(true);
      onRefresh();
      // 添加动画效果，0.5秒后重置
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };
  
  return (
    <div className={cn("mt-6 w-full max-w-full", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center text-xs text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5 mr-1.5 text-primary/70" />
          <p>你可能想问：</p>
        </div>
        
        {/* 添加换一批按钮 */}
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw 
              className={cn(
                "h-3 w-3 transition-transform duration-500", 
                isRefreshing && "rotate-180"
              )} 
            />
            <span>换一批</span>
          </Button>
        )}
      </div>
      
      <div className="flex flex-col space-y-2">
        {/* 显示推荐问题列表 */}
        {questions.map((question, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className={cn(
              "w-full text-left justify-start h-auto py-2.5 px-3",
              "text-sm font-normal hover:bg-primary/5 hover:text-primary",
              "border-muted transition-all duration-200",
              "flex items-center gap-2",
              hoveredIndex === index ? [
                "border-primary/50",
                "bg-primary/5",
                "shadow-md",
                "translate-y-[-1px]",
                "scale-[1.01]"
              ] : ""
            )}
            onClick={() => handleQuestionSelect(question)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <MessageSquare className={cn(
              "h-3.5 w-3.5 flex-shrink-0", 
              hoveredIndex === index ? "text-primary" : "text-muted-foreground"
            )} />
            <span>{question}</span>
          </Button>
        ))}
        
        {/* 加载状态显示 */}
        {isLoading && (
          <div className="text-xs text-muted-foreground flex items-center py-3">
            <div className="flex space-x-1 mr-2">
              <div className="h-1.5 w-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="h-1.5 w-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="h-1.5 w-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            <span>加载推荐问题中...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuggestedQuestions;