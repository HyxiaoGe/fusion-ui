'use client';

import { CheckCircle, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useRef, useEffect } from 'react';
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

  // 流式期间强制展开
  const actuallyVisible = isStreaming || isVisible;

  // 计算用时显示
  const durationText = (() => {
    if (duration) return `${duration} 秒`;
    if (startTime && endTime) {
      return `${((endTime - startTime) / 1000).toFixed(1)} 秒`;
    }
    return null;
  })();

  // 流式期间自动滚到底部
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isStreaming && actuallyVisible && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isStreaming, actuallyVisible]);

  return (
    <div className={cn(
      "rounded-xl border mb-3 overflow-hidden transition-colors",
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
          "h-3.5 w-3.5 text-muted-foreground transition-transform",
          !actuallyVisible && "rotate-180"
        )} />
      </button>

      {/* 内容区（可折叠） */}
      {actuallyVisible && (
        <div className={cn(
          "px-3 pb-3 border-t border-border/30",
          isStreaming && "border-l-2 border-l-blue-400/60 ml-0"
        )}>
          <div
            ref={scrollRef}
            className="pt-2 text-xs text-muted-foreground leading-relaxed max-h-60 overflow-y-auto"
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
        </div>
      )}
    </div>
  );
};

export default ReasoningContent;
