import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AdminSafeMarkdownProps {
  content: string;
  className?: string;
}

const COMPONENTS: Components = {
  a: ({ node, children, href, ...props }) => {
    void node;
    if (!isSafeHttpUrl(href)) {
      return <span>{children}</span>;
    }
    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  img: ({ node, alt }) => {
    void node;
    return <span className="text-muted-foreground">[图片已隐藏{alt ? `：${alt}` : ''}]</span>;
  },
  pre: ({ node, ...props }) => {
    void node;
    return <pre {...props} className="overflow-auto rounded-md bg-muted/30 p-3 text-xs" />;
  },
  code: ({ node, ...props }: ComponentPropsWithoutRef<'code'> & { node?: unknown }) => {
    void node;
    return <code {...props} className="rounded bg-muted/30 px-1 py-0.5 text-xs" />;
  },
};

/** 管理端专用 Markdown：不启用 rehypeRaw，禁止任何用户内容触发隐式外部资源请求。 */
export default function AdminSafeMarkdown({ content, className = '' }: AdminSafeMarkdownProps) {
  return (
    <div className={`prose prose-neutral dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function isSafeHttpUrl(href: string | undefined): href is string {
  if (!href) return false;
  try {
    const url = new URL(href, 'https://fusion.invalid');
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
