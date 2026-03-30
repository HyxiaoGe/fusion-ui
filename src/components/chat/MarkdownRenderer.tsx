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
 * 将 [n] 引用标记替换为可交互的引用组件。
 * 仅当 sources 有值时激活。
 */
function renderWithCitations(text: string, sources: SearchSource[]): React.ReactNode[] {
  if (!sources.length) return [text];

  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 添加匹配前的文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const num = parseInt(match[1], 10);
    const source = sources[num - 1];

    if (source) {
      let domain = '';
      try {
        domain = new URL(source.url).hostname.replace('www.', '');
      } catch {
        domain = source.url;
      }

      parts.push(
        <TooltipProvider key={`cite-${match.index}`} delayDuration={200}>
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
    } else {
      // 引用编号超出范围，保留原始文本
      parts.push(match[0]);
    }

    lastIndex = regex.lastIndex;
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, sources = [] }) => {
  const hasSources = sources.length > 0;

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
          // 拦截文本节点，处理 [n] 引用标记
          p: ({ node, children, ...props }) => {
            if (!hasSources) return <p {...props}>{children}</p>;

            const processed = React.Children.map(children, child => {
              if (typeof child === 'string') {
                return <>{renderWithCitations(child, sources)}</>;
              }
              return child;
            });
            return <p {...props}>{processed}</p>;
          },
          li: ({ node, children, ...props }) => {
            if (!hasSources) return <li {...props}>{children}</li>;

            const processed = React.Children.map(children, child => {
              if (typeof child === 'string') {
                return <>{renderWithCitations(child, sources)}</>;
              }
              return child;
            });
            return <li {...props}>{processed}</li>;
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
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
