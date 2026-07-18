'use client';

import { CheckCircle, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useRef, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { normalizeBareUrlsForMarkdown } from '@/lib/chat/markdownLinks';
import { MarkdownPreRenderer, ReasoningCodeRenderer } from './markdownCodeComponents';

interface ReasoningContentProps {
  content: string;
  isStreaming: boolean;
  isVisible: boolean;
  onToggle: () => void;
  duration?: string | null;
  startTime?: number;
  endTime?: number;
}

interface MarkdownSyntaxNode {
  type?: string;
  value?: string;
  children?: MarkdownSyntaxNode[];
}

const TOOL_PROTOCOL_TAG_RE = /<\/?(?:function|functions|function_call|function_calls|tool|tool_call|tool_calls|parameter|parameters|argument|arguments|invoke)\b[^<>]*>/gi;

function escapeHtmlTag(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * reasoning 中的工具协议标记不是页面 HTML。只转义 Markdown AST 的原始 HTML 节点，
 * 因此 fenced/inline code 不受影响，其他受支持的原始 HTML 仍交给 rehypeRaw 渲染。
 */
function remarkEscapeToolProtocolTags() {
  return (tree: MarkdownSyntaxNode) => {
    const pending = [tree];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node) continue;
      if (node.type === 'html' && typeof node.value === 'string') {
        node.value = node.value.replace(TOOL_PROTOCOL_TAG_RE, escapeHtmlTag);
      }
      if (node.children) pending.push(...node.children);
    }
  };
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

  const renderedContent = useMemo(
    () => normalizeBareUrlsForMarkdown(content.trim()),
    [content],
  );

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
                  remarkPlugins={[
                    remarkEscapeToolProtocolTags,
                    [remarkGfm, { singleTilde: false }],
                  ]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    pre: MarkdownPreRenderer,
                    code: ReasoningCodeRenderer,
                  }}
                >
                  {renderedContent}
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
