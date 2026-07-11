'use client';

import React, { useContext, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import type { SearchSourceSummary } from '@/types/conversation';
import { normalizeBareUrlsForMarkdown } from '@/lib/chat/markdownLinks';
import { MarkdownCodeRenderer, MarkdownPreRenderer } from './markdownCodeComponents';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  sources?: SearchSourceSummary[];
  onCitationClick?: (index: number) => void;
}

interface CitationRenderContextValue {
  hasSources: boolean;
  sources: SearchSourceSummary[];
  onCitationClick?: (index: number) => void;
}

const EMPTY_CITATION_CONTEXT: CitationRenderContextValue = {
  hasSources: false,
  sources: [],
};

const CitationRenderContext = React.createContext<CitationRenderContextValue>(EMPTY_CITATION_CONTEXT);

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

type MarkdownElementProps<Tag extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<Tag> & { node?: unknown };

function useCitationChildren(children: React.ReactNode): React.ReactNode {
  const { hasSources, sources, onCitationClick } = useContext(CitationRenderContext);
  return hasSources ? processChildren(children, sources, onCitationClick) : children;
}

const MarkdownParagraphRenderer = ({ node, children, ...props }: MarkdownElementProps<'p'>) => {
  void node;
  return <p {...props}>{useCitationChildren(children)}</p>;
};

const MarkdownListItemRenderer = ({ node, children, ...props }: MarkdownElementProps<'li'>) => {
  void node;
  return <li {...props}>{useCitationChildren(children)}</li>;
};

const MarkdownStrongRenderer = ({ node, children, ...props }: MarkdownElementProps<'strong'>) => {
  void node;
  return <strong {...props}>{useCitationChildren(children)}</strong>;
};

const MarkdownEmphasisRenderer = ({ node, children, ...props }: MarkdownElementProps<'em'>) => {
  void node;
  return <em {...props}>{useCitationChildren(children)}</em>;
};

const MarkdownHeading1Renderer = ({ node, children, ...props }: MarkdownElementProps<'h1'>) => {
  void node;
  return <h1 {...props}>{useCitationChildren(children)}</h1>;
};

const MarkdownHeading2Renderer = ({ node, children, ...props }: MarkdownElementProps<'h2'>) => {
  void node;
  return <h2 {...props}>{useCitationChildren(children)}</h2>;
};

const MarkdownHeading3Renderer = ({ node, children, ...props }: MarkdownElementProps<'h3'>) => {
  void node;
  return <h3 {...props}>{useCitationChildren(children)}</h3>;
};

const MarkdownTableRenderer = ({ node, ...props }: MarkdownElementProps<'table'>) => {
  void node;
  return (
    <div className="overflow-x-auto my-4">
      <table className="border-collapse w-full" {...props} />
    </div>
  );
};

const MarkdownTableHeaderRenderer = ({ node, ...props }: MarkdownElementProps<'th'>) => {
  void node;
  return <th className="border border-border px-4 py-2 text-left" {...props} />;
};

const MarkdownTableCellRenderer = ({ node, ...props }: MarkdownElementProps<'td'>) => {
  void node;
  return <td className="border border-border px-4 py-2" {...props} />;
};

const MARKDOWN_COMPONENTS: Components = {
  pre: MarkdownPreRenderer,
  code: MarkdownCodeRenderer,
  p: MarkdownParagraphRenderer,
  li: MarkdownListItemRenderer,
  strong: MarkdownStrongRenderer,
  em: MarkdownEmphasisRenderer,
  h1: MarkdownHeading1Renderer,
  h2: MarkdownHeading2Renderer,
  h3: MarkdownHeading3Renderer,
  table: MarkdownTableRenderer,
  th: MarkdownTableHeaderRenderer,
  td: MarkdownTableCellRenderer,
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, sources = [], onCitationClick }) => {
  const hasSources = sources.length > 0;

  const processedContent = useMemo(
    () => normalizeBareUrlsForMarkdown(hasSources ? preprocessCitations(content) : content),
    [content, hasSources]
  );
  const citationContextValue = useMemo<CitationRenderContextValue>(
    () => hasSources ? { hasSources, sources, onCitationClick } : EMPTY_CITATION_CONTEXT,
    [hasSources, onCitationClick, sources],
  );

  return (
    <div className={`prose prose-neutral dark:prose-invert max-w-none ${className || ''}`}>
      <CitationRenderContext.Provider value={citationContextValue}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={MARKDOWN_COMPONENTS}
        >
          {processedContent}
        </ReactMarkdown>
      </CitationRenderContext.Provider>
    </div>
  );
};

export default React.memo(MarkdownRenderer);
