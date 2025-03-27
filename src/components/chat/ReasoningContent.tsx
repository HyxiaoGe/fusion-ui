'use client';

import { Button } from '@/components/ui/button';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import React, { useRef, useEffect, useState } from 'react';

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
  
  // 用于存储内容预览
  const [preview, setPreview] = useState('');
  // 用于存储展开内容的高度
  const [contentHeight, setContentHeight] = useState(0);
  // 引用内容容器
  const contentRef = useRef<HTMLDivElement>(null);
  // 引用滚动容器
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 计算内容预览和高度
  useEffect(() => {
    // 生成简短预览（仅第一行文本）
    const firstLine = reasoning.trim().split('\n')[0];
    setPreview(firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine);
    
    // 计算展开内容的高度
    if (contentRef.current && isVisible) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [reasoning, isVisible]);

  // 当推理内容更新时自动滚动到底部
  useEffect(() => {
    if (isStreaming && isVisible && scrollContainerRef.current) {
      // 设置滚动位置到底部
      const scrollContainer = scrollContainerRef.current;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [reasoning, isStreaming, isVisible]);

  return (
    <div className={cn("mb-3 relative border border-border rounded-md", className)}>
      <div className="flex justify-between items-center px-3 py-2">
        <div className="flex items-center text-xs text-muted-foreground">
          <Lightbulb className="h-3 w-3 mr-1 text-amber-400"/>
          <span>思考过程</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onToggleVisibility}
        >
          {isVisible ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>
      
      <div className={cn(
        "overflow-hidden transition-all duration-300",
        isVisible ? "opacity-100" : "opacity-40 max-h-0"
      )}>
        {!isVisible && (
          <div className="px-3 pb-2 text-xs text-muted-foreground italic truncate">
            {preview}
          </div>
        )}
        
        <div 
          ref={scrollContainerRef}
          style={{ maxHeight: isVisible ? `${Math.min(contentHeight || 240, 240)}px` : '0' }}
          className={cn(
            "bg-slate-100 dark:bg-slate-800 p-3 rounded-b-md text-sm overflow-auto transition-all duration-300",
            isStreaming && "animate-pulse"
          )}
        >
          <div ref={contentRef}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={{
                pre: ({ node, ...props }) => (
                  <pre className="bg-slate-200 dark:bg-slate-700 rounded-md overflow-auto p-2 my-2" {...props} />
                ),
                code: ({ node, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-xs" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {reasoning.trim()}
            </ReactMarkdown>
            {isStreaming && (
              <span className="ml-1 inline-block h-4 w-0.5 bg-current animate-pulse"></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReasoningContent;