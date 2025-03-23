import React from 'react';
import { Button } from '@/components/ui/button';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

interface ReasoningContentProps {
  reasoning: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
  className?: string;
  isStreaming?: boolean;
}

const ReasoningContent: React.FC<ReasoningContentProps> = ({
  reasoning,
  isVisible,
  onToggleVisibility,
  isStreaming = false,
  className
}) => {
  // 检测是否有推理内容
  if (!reasoning || reasoning.trim() === '') {
    return null;
  }

  return (
    <div className={cn("mb-3 relative", className)}>
      {isVisible ? (
        <>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center text-xs text-muted-foreground">
              <Lightbulb className="h-3 w-3 mr-1 text-amber-400"/>
              <span>思考过程</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onToggleVisibility}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
          </div>
          <div className={cn(
            "bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-sm overflow-auto",
            "max-h-60",
            isStreaming && "animate-pulse"
          )}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={{
                pre: ({ node, ...props }) => (
                  <pre className="bg-slate-200 dark:bg-slate-700 rounded-md overflow-auto p-2 my-2" {...props} />
                ),
                code: ({ node, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-xs" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {reasoning.trim()}
            </ReactMarkdown>
            {isStreaming && (
              <span className="ml-1 inline-block h-4 w-0.5 bg-current animate-pulse"></span>
            )}
          </div>
        </>
      ) : (
        <div className="flex justify-between items-center">
          <div className="flex items-center text-xs text-muted-foreground">
            <Lightbulb className="h-3 w-3 mr-1 text-amber-400" />
            <span>思考过程</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggleVisibility}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReasoningContent;