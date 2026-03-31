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

// 占位符字符对（Unicode 数学角括号，正文中不会出现）
const CITE_OPEN = '\u27E6';   // ⟦
const CITE_CLOSE = '\u27E7';  // ⟧
const CITE_REGEX = /\u27E6(\d+)\u27E7/g;

/**
 * 预处理：将 [n] 替换为 ⟦n⟧ 占位符，避免被 Markdown 解析为链接引用。
 */
function preprocessCitations(text: string): string {
  return text.replace(/\[(\d+)\]/g, `${CITE_OPEN}$1${CITE_CLOSE}`);
}

/**
 * 将 ⟦n⟧ 占位符渲染为可交互的引用圆圈。
 */
function renderWithCitations(text: string, sources: SearchSource[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CITE_REGEX.lastIndex = 0;
  while ((match = CITE_REGEX.exec(text)) !== null) {
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
      parts.push(`[${num}]`);
    }

    lastIndex = CITE_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * 通用的子节点引用处理：遍历 children，对字符串子节点做引用替换。
 */
function processChildren(children: React.ReactNode, sources: SearchSource[]): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      return <>{renderWithCitations(child, sources)}</>;
    }
    return child;
  });
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, sources = [] }) => {
  const hasSources = sources.length > 0;

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
          // 拦截各种文本容器标签，处理 ⟦n⟧ 引用占位符
          p: ({ node, children, ...props }) => {
            if (!hasSources) return <p {...props}>{children}</p>;
            return <p {...props}>{processChildren(children, sources)}</p>;
          },
          li: ({ node, children, ...props }) => {
            if (!hasSources) return <li {...props}>{children}</li>;
            return <li {...props}>{processChildren(children, sources)}</li>;
          },
          strong: ({ node, children, ...props }) => {
            if (!hasSources) return <strong {...props}>{children}</strong>;
            return <strong {...props}>{processChildren(children, sources)}</strong>;
          },
          em: ({ node, children, ...props }) => {
            if (!hasSources) return <em {...props}>{children}</em>;
            return <em {...props}>{processChildren(children, sources)}</em>;
          },
          h1: ({ node, children, ...props }) => {
            if (!hasSources) return <h1 {...props}>{children}</h1>;
            return <h1 {...props}>{processChildren(children, sources)}</h1>;
          },
          h2: ({ node, children, ...props }) => {
            if (!hasSources) return <h2 {...props}>{children}</h2>;
            return <h2 {...props}>{processChildren(children, sources)}</h2>;
          },
          h3: ({ node, children, ...props }) => {
            if (!hasSources) return <h3 {...props}>{children}</h3>;
            return <h3 {...props}>{processChildren(children, sources)}</h3>;
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
