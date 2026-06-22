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
  const actuallyVisible = isStreaming || isVisible;

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

  if (!isStreaming && (!content || !content.trim())) {
    return null;
  }

  const durationText = (() => {
    if (duration) return `${duration} 秒`;
    if (startTime && endTime) {
      const diff = ((endTime - startTime) / 1000);
      if (diff < 0) return null;
      return `${diff.toFixed(1)} 秒`;
    }
    return null;
  })();

  return (
    <div className={cn(
      "rounded-lg border mb-2 overflow-hidden transition-all duration-300",
      isStreaming
        ? "border-info-border bg-info-bg"
        : "border-border/40 bg-transparent"
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 text-xs"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          {isStreaming ? (
            <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse motion-reduce:animate-none" />
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

      {/* 内容区（grid-rows 自适应展开，避免 200px 硬截断） */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          actuallyVisible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className={cn(
            "px-3 pb-3 border-t border-border/30 relative",
            isStreaming && "border-l-2 border-l-info/60 ml-0"
          )}>
            <div
              ref={scrollRef}
              className="pt-2 text-xs text-muted-foreground leading-relaxed max-h-[280px] overflow-y-auto"
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
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {content.trim()}
                </ReactMarkdown>
              ) : (
                <span className="text-muted-foreground animate-pulse motion-reduce:animate-none">AI 正在组织思路...</span>
              )}
            </div>
            {isOverflowing && (
              <div className="absolute bottom-3 left-3 right-3 h-6 bg-gradient-to-t from-muted/80 to-transparent pointer-events-none rounded-b" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReasoningContent;
