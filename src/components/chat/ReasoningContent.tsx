'use client';

import { Button } from '@/components/ui/button';
import { Lightbulb, ChevronDown, ChevronUp, Clock, Copy, Check } from 'lucide-react';
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
  startTime?: number;
  endTime?: number;
}

const ReasoningContent: React.FC<ReasoningContentProps> = ({
  reasoning,
  isVisible,
  onToggleVisibility,
  isStreaming = false,
  className,
  forceShow = false,
  startTime,
  endTime
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
  
  // 在流式思考状态下，确保组件立即加载并显示内容
  useEffect(() => {
    if (isStreaming && !reasoning && startTime) {
      console.log('流式思考启动，但内容尚未生成');
    }
  }, [isStreaming, reasoning, startTime]);
  
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
    if (contentRef.current) {
      const newHeight = contentRef.current.scrollHeight;
      if (newHeight !== contentHeight) {
        setContentHeight(newHeight);
      }
    }
  }, [reasoning, actuallyVisible]);

  // 当内容变化时重新计算高度
  useEffect(() => {
    const updateHeight = () => {
      if (contentRef.current && actuallyVisible) {
        const newHeight = contentRef.current.scrollHeight;
        if (newHeight !== contentHeight) {
          setContentHeight(newHeight);
        }
      }
    };

    // 初始更新
    updateHeight();

    // 监听窗口大小变化
    window.addEventListener('resize', updateHeight);
    
    return () => {
      window.removeEventListener('resize', updateHeight);
    };
  }, [reasoning, actuallyVisible, contentHeight]);

  // 当推理内容更新时自动滚动到底部
  useEffect(() => {
    if (actuallyVisible && scrollContainerRef.current) {
      // 设置滚动位置到底部
      const scrollContainer = scrollContainerRef.current;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [reasoning, actuallyVisible]);

  // 计算思考时间
  const [thinkingDuration, setThinkingDuration] = useState<string>('');
  const [liveTime, setLiveTime] = useState<number>(0);
  const timerRef = useRef<HTMLSpanElement>(null);
  const lastTimeRef = useRef<string>('');
  
  // 在组件挂载时或startTime/endTime变化时计算思考时间
  useEffect(() => {
    if (!startTime) {
      setLiveTime(0);
      return;
    }

    // 立即设置初始时间
    const initialElapsed = endTime ? (endTime - startTime) : (Date.now() - startTime);
    setLiveTime(initialElapsed);

    // 如果还在思考中（没有结束时间），则启动计时器
    if (!endTime) {
      const timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setLiveTime(elapsed);
      }, 100);
      
      return () => clearInterval(timerInterval);
    }
  }, [startTime, endTime]);
  
  // 格式化思考时间
  useEffect(() => {
    if (liveTime > 0) {
      const seconds = Math.floor(liveTime / 1000);
      const ms = liveTime % 1000;
      
      let newTime = '';
      if (seconds < 60) {
        newTime = `${seconds}.${ms.toString().padStart(3, '0').substring(0, 2)}秒`;
      } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        newTime = `${minutes}分${remainingSeconds}.${ms.toString().padStart(3, '0').substring(0, 2)}秒`;
      }
      
      // 检测时间是否变化
      if (newTime !== lastTimeRef.current && timerRef.current && !endTime) {
        // 添加动画效果
        timerRef.current.classList.add('updated');
        setTimeout(() => {
          if (timerRef.current) {
            timerRef.current.classList.remove('updated');
          }
        }, 200);
      }
      
      lastTimeRef.current = newTime;
      setThinkingDuration(newTime);
    } else {
      setThinkingDuration('0.00秒');
    }
  }, [liveTime, endTime]);

  // 复制成功状态
  const [isCopied, setIsCopied] = useState(false);
  
  // 处理复制功能
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard && reasoning) {
      navigator.clipboard.writeText(reasoning.trim())
        .then(() => {
          // 设置复制成功状态
          setIsCopied(true);
          
          // 2秒后重置状态
          setTimeout(() => {
            setIsCopied(false);
          }, 2000);
        })
        .catch(err => {
          console.error('复制失败:', err);
        });
    }
  };

  return (
    <div className={cn("mb-3 relative border border-border rounded-md shadow-sm", className)}>
      <div 
        className="flex justify-between items-center px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors relative group/header"
        onClick={onToggleVisibility}
        title={actuallyVisible ? "点击隐藏思考过程" : "点击显示思考过程"}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center text-xs text-muted-foreground">
            <Lightbulb className={cn("h-4 w-4 mr-1", !endTime ? "text-amber-400 animate-pulse" : "text-amber-400")}/>
            <span className="font-medium">思考过程</span>
            {!endTime && (!reasoning || !reasoning.trim()) && (
              <span className="ml-1 text-amber-400 animate-pulse">实时思考中...</span>
            )}
          </div>
          
          {/* 思考时间显示 */}
          <div className={cn(
            "text-xs px-2 py-0.5 rounded-full transition-all duration-150",
            !endTime 
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" 
              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          )}>
            <span className={cn(
              "flex items-center gap-1",
              !endTime && "animate-pulse-slow"
            )}>
              <Clock className={cn("h-3 w-3", !endTime && "animate-spin-slow")} />
              <span className="font-mono">
                思考用时: 
                <span className={cn(
                  "inline-block min-w-[4em] text-right ml-1",
                  !endTime && "timer-digits"
                )}
                ref={timerRef}>
                  {thinkingDuration}
                </span>
              </span>
            </span>
          </div>
        </div>
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          {actuallyVisible && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-6 w-6 p-0 transition-all duration-200",
                isCopied 
                  ? "text-green-600 border-green-600 dark:text-green-400 dark:border-green-400" 
                  : "text-muted-foreground"
              )}
              onClick={handleCopy}
              title={isCopied ? "已复制" : "复制思考过程"}
            >
              {isCopied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            title={actuallyVisible ? "隐藏思考过程" : "显示思考过程"}
          >
            {actuallyVisible ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
        
        {/* 点击提示覆盖层 - 仅在鼠标悬停时显示 */}
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/header:opacity-100 pointer-events-none transition-opacity flex items-center justify-center">
          <span className="text-xs text-muted-foreground/70 font-medium tracking-wider">
            {actuallyVisible ? "点击隐藏" : "点击显示"}
          </span>
        </div>
      </div>
      
      <div className={cn(
        "overflow-hidden transition-all duration-500 ease-in-out",
        actuallyVisible ? "opacity-100" : "opacity-40 max-h-0"
      )}>
        {!actuallyVisible && (
          <div className="px-3 pb-2 text-xs text-muted-foreground italic truncate">
            {preview}
          </div>
        )}
        
        <div 
          ref={scrollContainerRef}
          style={{ 
            maxHeight: actuallyVisible ? `${Math.max(contentHeight, 200)}px` : '0',
            transition: 'max-height 0.5s ease-in-out'
          }}
          className={cn(
            "bg-slate-50 dark:bg-slate-900 p-3 rounded-b-md text-sm overflow-auto"
          )}
        >
          <div ref={contentRef}>
            {isStreaming ? (
              <>
                {reasoning && reasoning.trim() ? (
                  <>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeHighlight]}
                      components={{
                        pre: ({ node, ...props }) => (
                          <pre className="bg-slate-100 dark:bg-slate-800 rounded-md overflow-auto p-2 my-2" {...props} />
                        ),
                        code: ({ node, className, children, ...props }) => {
                          const match = /language-(\w+)/.exec(className || '');
                          return match ? (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          ) : (
                            <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-xs" {...props}>
                              {children}
                            </code>
                          );
                        },
                        h1: ({ node, ...props }) => (
                          <h1 className="text-lg font-bold mt-3 mb-2" {...props} />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2 className="text-md font-bold mt-3 mb-2" {...props} />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3 className="text-sm font-bold mt-2 mb-1" {...props} />
                        ),
                        p: ({ node, ...props }) => (
                          <p className="my-1.5" {...props} />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul className="list-disc pl-5 my-1.5" {...props} />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol className="list-decimal pl-5 my-1.5" {...props} />
                        ),
                        li: ({ node, ...props }) => (
                          <li className="my-0.5" {...props} />
                        ),
                      }}
                    >
                      {reasoning.trim()}
                    </ReactMarkdown>
                    
                    <div className="h-4 mt-2">
                      <span className="inline-block h-3 w-3 bg-amber-400 rounded-full animate-pulse"></span>
                    </div>
                  </>
                ) : (
                  <div className="py-2">
                    <div className="thinking-animation">
                      <div className="flex items-center mb-2">
                        <span className="mr-2 text-amber-500 font-medium">AI正在组织思路...</span>
                        <div className="typing-indicator">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>
                      <div className="thought-bubbles">
                        <div className="bubble"></div>
                        <div className="bubble"></div>
                        <div className="bubble"></div>
                      </div>
                      <div className="thought-lines">
                        <div className="line"></div>
                        <div className="line"></div>
                        <div className="line"></div>
                        <div className="line"></div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              reasoning && reasoning.trim() && (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, rehypeHighlight]}
                  components={{
                    pre: ({ node, ...props }) => (
                      <pre className="bg-slate-100 dark:bg-slate-800 rounded-md overflow-auto p-2 my-2" {...props} />
                    ),
                    code: ({ node, className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      return match ? (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-xs" {...props}>
                          {children}
                        </code>
                      );
                    },
                    h1: ({ node, ...props }) => (
                      <h1 className="text-lg font-bold mt-3 mb-2" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2 className="text-md font-bold mt-3 mb-2" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3 className="text-sm font-bold mt-2 mb-1" {...props} />
                    ),
                    p: ({ node, ...props }) => (
                      <p className="my-1.5" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul className="list-disc pl-5 my-1.5" {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol className="list-decimal pl-5 my-1.5" {...props} />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="my-0.5" {...props} />
                    ),
                  }}
                >
                  {reasoning.trim()}
                </ReactMarkdown>
              )
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
        
        .thought-bubbles {
          display: flex;
          justify-content: space-between;
          margin: 10px 0;
        }
        
        .bubble {
          width: 30%;
          height: 6px;
          background: rgba(251, 191, 36, 0.2);
          border-radius: 10px;
          margin-bottom: 6px;
          position: relative;
          animation: bubble-pulse 2s infinite ease-in-out;
        }
        
        .bubble:nth-child(2) {
          animation-delay: 0.3s;
        }
        
        .bubble:nth-child(3) {
          animation-delay: 0.6s;
        }
        
        .thought-lines {
          margin-top: 10px;
          padding: 8px;
          background-color: rgba(251, 191, 36, 0.1);
          border-radius: 8px;
        }
        
        .line {
          height: 4px;
          width: 100%;
          margin: 8px 0;
          background: linear-gradient(90deg, 
            rgba(251, 191, 36, 0.2) 0%, 
            rgba(251, 191, 36, 0.5) 30%, 
            rgba(251, 191, 36, 0.2) 60%,
            rgba(251, 191, 36, 0.5) 100%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
          border-radius: 4px;
        }
        
        .line:nth-child(2) {
          animation-delay: 0.2s;
          width: 85%;
        }
        
        .line:nth-child(3) {
          animation-delay: 0.4s;
          width: 92%;
        }
        
        .line:nth-child(4) {
          animation-delay: 0.6s;
          width: 78%;
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
        
        @keyframes bubble-pulse {
          0%, 100% {
            opacity: 0.4;
            transform: scale(0.95);
          }
          50% {
            opacity: 0.8;
            transform: scale(1);
          }
        }
        
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.9;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }
        
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        @keyframes digit-flip {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        
        .timer-digits {
          transition: all 0.1s ease-in-out;
        }
        
        .timer-digits:global(.updated) {
          animation: digit-flip 0.2s ease-in-out;
          color: rgb(251, 191, 36);
        }
        
        :global(.animate-pulse-slow) {
          animation: pulse-slow 2s infinite ease-in-out;
        }
        
        :global(.animate-spin-slow) {
          animation: spin-slow 4s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default ReasoningContent;