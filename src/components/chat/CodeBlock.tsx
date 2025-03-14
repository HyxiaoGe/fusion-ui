'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ClipboardCopy } from 'lucide-react';
import React, { useState } from 'react';

interface CodeBlockProps {
  language: string;
  value: string;
  children: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, value, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="bg-slate-100 dark:bg-slate-800 rounded-t-md py-2 px-4 text-xs font-mono border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <span>{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <ClipboardCopy className="h-4 w-4" />
          )}
          <span className="sr-only">复制代码</span>
        </Button>
      </div>
      <pre className={cn(
        "bg-slate-100 dark:bg-slate-800 rounded-b-md p-4 overflow-x-auto",
        `language-${language}`
      )}>
        <code className={`language-${language}`}>{children}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;