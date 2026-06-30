'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import type { SearchSourceSummary } from '@/types/conversation';
import { normalizeBareUrlsForMarkdown } from '@/lib/chat/markdownLinks';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  sources?: SearchSourceSummary[];
  onCitationClick?: (index: number) => void;
}

// 占位符字符对（Unicode 数学角括号，正文中不会出现）
const CITE_OPEN = '\u27E6';   // ⟦
const CITE_CLOSE = '\u27E7';  // ⟧
const CITE_REGEX = /\u27E6(\d+)\u27E7/g;

/**
 * 预处理：将 [n] 替换为 ⟦n⟧ 占位符，避免被 Markdown 解析为链接引用。
 * 用 backtick 切段：偶数 index 是普通文本（替换 [n] 为占位符），奇数 index 是 inline code
 * （跳过替换，避免用户写 `[1]` 时被误转成 `⟦1⟧`）。
 * 对未闭合 backtick / 多行 fenced code 都安全：split 自动按出现次数分段。
 */
function preprocessCitations(text: string): string {
  const segments = text.split('`');
  return segments
    .map((seg, i) =>
      i % 2 === 0
        ? seg.replace(/\[(\d+)\]/g, `${CITE_OPEN}$1${CITE_CLOSE}`)
        : seg
    )
    .join('`');
}

/**
 * 将 ⟦n⟧ 占位符渲染为可交互的引用圆圈。
 */
function renderWithCitations(
  text: string,
  sources: SearchSourceSummary[],
  onCitationClick?: (index: number) => void,
): React.ReactNode[] {
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

      const sharedClass =
        'inline-flex items-center justify-center h-4 w-4 rounded-full bg-info-bg text-info text-[10px] font-medium hover:bg-info/20 transition-colors align-super ml-0.5 no-underline';

      const trigger = onCitationClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onCitationClick(num - 1);
          }}
          className={sharedClass}
          aria-label={`查看参考资料 ${num}：${source.title}`}
          title={`${source.title} · ${domain}`}
        >
          {num}
        </button>
      ) : (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedClass}
          title={`${source.title} · ${domain}`}
        >
          {num}
        </a>
      );

      parts.push(<React.Fragment key={`cite-${match.index}`}>{trigger}</React.Fragment>);
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
function processChildren(
  children: React.ReactNode,
  sources: SearchSourceSummary[],
  onCitationClick?: (index: number) => void,
): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      return <>{renderWithCitations(child, sources, onCitationClick)}</>;
    }
    return child;
  });
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, sources = [], onCitationClick }) => {
  const hasSources = sources.length > 0;

  const processedContent = useMemo(
    () => normalizeBareUrlsForMarkdown(hasSources ? preprocessCitations(content) : content),
    [content, hasSources]
  );

  return (
    <div className={`prose prose-neutral dark:prose-invert max-w-none ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          pre: ({ node, children }) => {
            void node;
            return <>{children}</>;
          },
          code: ({ node, className, children, ...props }) => {
            void node;
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
              <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          // 拦截各种文本容器标签，处理 ⟦n⟧ 引用占位符
          p: ({ node, children, ...props }) => {
            void node;
            if (!hasSources) return <p {...props}>{children}</p>;
            return <p {...props}>{processChildren(children, sources, onCitationClick)}</p>;
          },
          li: ({ node, children, ...props }) => {
            void node;
            if (!hasSources) return <li {...props}>{children}</li>;
            return <li {...props}>{processChildren(children, sources, onCitationClick)}</li>;
          },
          strong: ({ node, children, ...props }) => {
            void node;
            if (!hasSources) return <strong {...props}>{children}</strong>;
            return <strong {...props}>{processChildren(children, sources, onCitationClick)}</strong>;
          },
          em: ({ node, children, ...props }) => {
            void node;
            if (!hasSources) return <em {...props}>{children}</em>;
            return <em {...props}>{processChildren(children, sources, onCitationClick)}</em>;
          },
          h1: ({ node, children, ...props }) => {
            void node;
            if (!hasSources) return <h1 {...props}>{children}</h1>;
            return <h1 {...props}>{processChildren(children, sources, onCitationClick)}</h1>;
          },
          h2: ({ node, children, ...props }) => {
            void node;
            if (!hasSources) return <h2 {...props}>{children}</h2>;
            return <h2 {...props}>{processChildren(children, sources, onCitationClick)}</h2>;
          },
          h3: ({ node, children, ...props }) => {
            void node;
            if (!hasSources) return <h3 {...props}>{children}</h3>;
            return <h3 {...props}>{processChildren(children, sources, onCitationClick)}</h3>;
          },
          table: ({ node, ...props }) => {
            void node;
            return (
              <div className="overflow-x-auto my-4">
                <table className="border-collapse w-full" {...props} />
              </div>
            );
          },
          th: ({ node, ...props }) => {
            void node;
            return <th className="border border-border px-4 py-2 text-left" {...props} />;
          },
          td: ({ node, ...props }) => {
            void node;
            return <td className="border border-border px-4 py-2" {...props} />;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default React.memo(MarkdownRenderer);
