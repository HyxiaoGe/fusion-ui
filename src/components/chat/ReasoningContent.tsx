'use client';

import { CheckCircle, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

interface ReasoningContentProps {
  content: string;
  isStreaming: boolean;
  isVisible: boolean;
  onToggle: () => void;
  duration?: string | null;
  startTime?: number;
  endTime?: number;
}

const ReasoningContent: React.FC<ReasoningContentProps> = ({
  content,
  isStreaming,
  isVisible,
  onToggle,
  duration,
  startTime,
  endTime,
}) => {
  if (!isStreaming && (!content || !content.trim())) {
    return null;
  }

  const actuallyVisible = isStreaming || isVisible;

  const durationText = (() => {
    if (duration) return `${duration} 秒`;
    if (startTime && endTime) {
      const diff = ((endTime - startTime) / 1000);
      if (diff < 0) return null;
      return `${diff.toFixed(1)} 秒`;
    }
    return null;
  })();

  // 检测内容是否溢出（需要滚动）
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      setIsOverflowing(scrollRef.current.scrollHeight > scrollRef.current.clientHeight);
    }
  }, [content, actuallyVisible]);

  // 流式期间自动滚到底部
  useEffect(() => {
    if (isStreaming && actuallyVisible && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isStreaming, actuallyVisible]);

  return (
    <div className={cn(
      "rounded-xl border mb-3 overflow-hidden transition-all duration-300",
      isStreaming
        ? "border-blue-400/30 bg-blue-500/5"
        : "border-border/50 bg-muted/30"
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 text-xs"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          {isStreaming ? (
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5" />
          )}
          <span>
            {isStreaming
              ? '正在深度思考...'
              : `已深度思考${durationText ? `（用时 ${durationText}）` : ''}`
            }
          </span>
        </div>
        <ChevronUp className={cn(
          "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
          !actuallyVisible && "rotate-180"
        )} />
      </button>

      {/* 内容区（可折叠，带过渡动画） */}
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden",
        actuallyVisible ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className={cn(
          "px-3 pb-3 border-t border-border/30 relative",
          isStreaming && "border-l-2 border-l-blue-400/60 ml-0"
        )}>
          <div
            ref={scrollRef}
            className="pt-2 text-xs text-muted-foreground leading-relaxed max-h-[160px] overflow-y-auto"
          >
            {content && content.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeContent = String(children).replace(/\n$/, '');
                    if (match && codeContent.includes('\n')) {
                      return (
                        <CodeBlock
                          language={match[1]}
                          value={codeContent}
                          showLineNumbers={false}
                          maxLines={10}
                        />
                      );
                    }
                    return (
                      <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-xs font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {content.trim()}
              </ReactMarkdown>
            ) : (
              <span className="text-muted-foreground animate-pulse">AI 正在组织思路...</span>
            )}
          </div>
          {/* 底部渐变提示可滚动 */}
          {isOverflowing && (
            <div className="absolute bottom-3 left-3 right-3 h-6 bg-gradient-to-t from-muted/80 to-transparent pointer-events-none rounded-b" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ReasoningContent;
