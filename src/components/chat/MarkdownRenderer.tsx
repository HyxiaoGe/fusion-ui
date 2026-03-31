'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import type { SearchSource } from '@/types/conversation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  sources?: SearchSource[];
}

/**
 * 预处理：将 [n] 引用标记替换为 <cite data-ref="n"></cite> HTML 标签，
 * 避免被 ReactMarkdown 解析为 Markdown 链接引用语法。
 */
function preprocessCitations(text: string): string {
  return text.replace(/\[(\d+)\]/g, '<cite data-ref="$1"></cite>');
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, sources = [] }) => {
  const hasSources = sources.length > 0;

  // 有搜索来源时，预处理引用标记
  const processedContent = useMemo(
    () => hasSources ? preprocessCitations(content) : content,
    [content, hasSources]
  );

  return (
    <div className={`prose prose-neutral dark:prose-invert max-w-none ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          pre: ({ node, children, ...props }) => {
            return <>{children}</>;
          },
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeContent = String(children).replace(/\n$/, '');

            if (match && codeContent.includes('\n')) {
              return (
                <CodeBlock
                  language={match[1]}
                  value={codeContent}
                  showLineNumbers={true}
                  maxLines={12}
                />
              );
            }

            return (
              <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          // 拦截 <cite data-ref="n"> 标签，渲染为可交互的引用圆圈
          cite: ({ node, ...props }: { node?: unknown; [key: string]: unknown }) => {
            const ref = (props as { 'data-ref'?: string })['data-ref'];
            if (!ref || !hasSources) return null;

            const num = parseInt(ref, 10);
            const source = sources[num - 1];
            if (!source) return <sup className="text-xs text-muted-foreground">[{num}]</sup>;

            let domain = '';
            try {
              domain = new URL(source.url).hostname.replace('www.', '');
            } catch {
              domain = source.url;
            }

            return (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium hover:bg-blue-500/20 transition-colors align-super ml-0.5 no-underline"
                    >
                      {num}
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[280px]">
                    <p className="text-xs font-medium">{source.title}</p>
                    <p className="text-[10px] text-muted-foreground">{domain}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="border-collapse w-full" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-slate-300 dark:border-slate-700 px-4 py-2 text-left" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-slate-300 dark:border-slate-700 px-4 py-2" {...props} />
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
