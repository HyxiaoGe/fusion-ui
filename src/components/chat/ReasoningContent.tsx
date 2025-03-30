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
  forceShow?: boolean;
}

const ReasoningContent: React.FC<ReasoningContentProps> = ({
  reasoning,
  isVisible,
  onToggleVisibility,
  isStreaming = false,
  className,
  forceShow = false
}) => {
  console.log('ReasoningContent渲染:', {
    hasReasoning: !!reasoning,
    reasoningLength: reasoning ? reasoning.length : 0,
    isVisible,
    isStreaming,
    forceShow
  });

  // 允许在流式生成过程中显示空内容
  // 只有在非流式状态下且内容为空时才不显示
  if (!isStreaming && !forceShow && (!reasoning || reasoning.trim() === '')) {
    console.log('ReasoningContent不显示: 非流式状态且内容为空');
    return null;
  }
  
  // 在流式状态下或forceShow时强制设置为可见
  const actuallyVisible = isStreaming || forceShow ? true : isVisible;
  
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
    if (reasoning && reasoning.trim()) {
      const firstLine = reasoning.trim().split('\n')[0];
      setPreview(firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine);
    } else {
      setPreview('AI正在思考中...');
    }
    
    // 计算展开内容的高度
    if (contentRef.current && actuallyVisible) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [reasoning, actuallyVisible]);

  // 当推理内容更新时自动滚动到底部
  useEffect(() => {
    if (actuallyVisible && scrollContainerRef.current) {
      // 设置滚动位置到底部
      const scrollContainer = scrollContainerRef.current;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [reasoning, actuallyVisible]);

  return (
    <div className={cn("mb-3 relative border border-border rounded-md", className)}>
      <div className="flex justify-between items-center px-3 py-2">
        <div className="flex items-center text-xs text-muted-foreground">
          <Lightbulb className={cn("h-3 w-3 mr-1", isStreaming ? "text-amber-400 animate-pulse" : "text-amber-400")}/>
          <span>思考过程</span>
          {isStreaming && (!reasoning || !reasoning.trim()) && (
            <span className="ml-1 text-amber-400 animate-pulse">实时思考中...</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onToggleVisibility}
        >
          {actuallyVisible ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>
      
      <div className={cn(
        "overflow-hidden transition-all duration-300",
        actuallyVisible ? "opacity-100" : "opacity-40 max-h-0"
      )}>
        {!actuallyVisible && (
          <div className="px-3 pb-2 text-xs text-muted-foreground italic truncate">
            {preview}
          </div>
        )}
        
        <div 
          ref={scrollContainerRef}
          style={{ maxHeight: actuallyVisible ? `${Math.min(contentHeight || 240, 240)}px` : '0' }}
          className={cn(
            "bg-slate-100 dark:bg-slate-800 p-3 rounded-b-md text-sm overflow-auto transition-all duration-300"
          )}
        >
          <div ref={contentRef}>
            {reasoning && reasoning.trim() ? (
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
            ) : isStreaming ? (
              <div className="flex flex-col space-y-2">
                <div className="flex items-center">
                  <span className="mr-2 text-amber-400 font-medium">AI正在组织思路...</span>
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
                <div className="thinking-animation">
                  <div className="line"></div>
                  <div className="line"></div>
                  <div className="line"></div>
                  <div className="line"></div>
                </div>
              </div>
            ) : null}
            
            {isStreaming && reasoning && reasoning.trim() && (
              <div className="h-4 mt-2">
                <span className="inline-block h-3 w-3 bg-amber-400 rounded-full animate-pulse"></span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .typing-indicator {
          display: inline-flex;
          align-items: center;
        }
        
        .typing-indicator span {
          height: 4px;
          width: 4px;
          margin: 0 2px;
          background-color: currentColor;
          border-radius: 50%;
          display: inline-block;
          opacity: 0.6;
        }
        
        .typing-indicator span:nth-child(1) {
          animation: pulse 1.5s infinite ease-in-out;
        }
        
        .typing-indicator span:nth-child(2) {
          animation: pulse 1.5s infinite ease-in-out 0.4s;
        }
        
        .typing-indicator span:nth-child(3) {
          animation: pulse 1.5s infinite ease-in-out 0.8s;
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
          }
        }
        
        .thinking-animation {
          margin-top: 8px;
          padding: 10px;
          background-color: rgba(251, 191, 36, 0.1);
          border-radius: 4px;
        }
        
        .line {
          height: 3px;
          width: 100%;
          margin: 6px 0;
          background: linear-gradient(90deg, 
            rgba(251, 191, 36, 0.2) 0%, 
            rgba(251, 191, 36, 0.5) 30%, 
            rgba(251, 191, 36, 0.2) 60%,
            rgba(251, 191, 36, 0.5) 100%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
          border-radius: 2px;
        }
        
        .line:nth-child(2) {
          animation-delay: 0.2s;
          width: 80%;
        }
        
        .line:nth-child(3) {
          animation-delay: 0.4s;
          width: 90%;
        }
        
        .line:nth-child(4) {
          animation-delay: 0.6s;
          width: 65%;
        }
        
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
};

export default ReasoningContent;