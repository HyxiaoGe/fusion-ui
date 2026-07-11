import React from 'react';
import CodeBlock from './CodeBlock';

interface MarkdownCodeProps extends React.ComponentPropsWithoutRef<'code'> {
  node?: unknown;
}

interface MarkdownPreProps extends React.ComponentPropsWithoutRef<'pre'> {
  node?: unknown;
}

export const MarkdownPreRenderer = ({ node, children }: MarkdownPreProps) => {
  void node;
  return <>{children}</>;
};

function renderMarkdownCode(
  { node, className, children, ...props }: MarkdownCodeProps,
  options: { showLineNumbers: boolean; maxLines: number; inlineClassName: string },
) {
  void node;
  const match = /language-([^\s]+)/.exec(className || '');
  const codeContent = String(children).replace(/\n$/, '');

  if (match) {
    return (
      <CodeBlock
        language={match[1]}
        value={codeContent}
        showLineNumbers={options.showLineNumbers}
        maxLines={options.maxLines}
      />
    );
  }

  return (
    <code className={options.inlineClassName} {...props}>
      {children}
    </code>
  );
}

/**
 * renderer 必须保持模块级稳定，避免 ReactMarkdown 在流式更新时重挂 CodeBlock。
 */
export const MarkdownCodeRenderer = (props: MarkdownCodeProps) => renderMarkdownCode(props, {
  showLineNumbers: true,
  maxLines: 12,
  inlineClassName: 'bg-muted px-1 py-0.5 rounded text-sm font-mono',
});

export const ReasoningCodeRenderer = (props: MarkdownCodeProps) => renderMarkdownCode(props, {
  showLineNumbers: false,
  maxLines: 10,
  inlineClassName: 'bg-muted px-1 py-0.5 rounded text-xs font-mono',
});
