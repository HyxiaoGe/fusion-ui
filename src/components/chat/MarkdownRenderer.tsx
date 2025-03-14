'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  return (
    <div className={`prose prose-neutral dark:prose-invert max-w-none ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          pre: ({ node, ...props }) => <div className="relative" {...props} />,
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            return match ? (
              <CodeBlock language={match[1]} value={String(children).replace(/\n$/, '')}>
                {String(children).replace(/\n$/, '')}
              </CodeBlock>
            ) : (
              <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
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
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;