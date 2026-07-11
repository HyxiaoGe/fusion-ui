'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ClipboardCopy, FileText, Hash, ChevronDown, ChevronUp } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import hljs from 'highlight.js';

interface CodeBlockProps {
  language: string;
  value: string;
  showLineNumbers?: boolean;
  className?: string;
  maxLines?: number; // 最大显示行数，超过则可折叠
}

const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  html: 'xml',
  vue: 'xml',
  svelte: 'xml',
};

const DISPLAY_LANGUAGE_MAP: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  csharp: 'C#',
  php: 'PHP',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  swift: 'Swift',
  kotlin: 'Kotlin',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'LESS',
  xml: 'XML',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
  bash: 'Bash',
  shell: 'Shell',
  powershell: 'PowerShell',
  sql: 'SQL',
  markdown: 'Markdown',
  text: 'Plain Text',
  plaintext: 'Plain Text',
};

function getDisplayLanguage(language: string): string {
  return DISPLAY_LANGUAGE_MAP[language.toLowerCase()] || language.toUpperCase();
}

function highlightCode(value: string, language: string): string {
  const actualLanguage = LANGUAGE_MAP[language.toLowerCase()] || language.toLowerCase();

  try {
    if (hljs.getLanguage(actualLanguage)) {
      return hljs.highlight(value, { language: actualLanguage }).value;
    }
    return hljs.highlightAuto(value).value;
  } catch {
    return hljs.highlight(value, { language: 'plaintext' }).value;
  }
}

const CodeBlock: React.FC<CodeBlockProps> = ({ 
  language, 
  value, 
  showLineNumbers = true,
  className,
  maxLines = 15 // 默认最大显示15行
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  // 生成行号
  const generateLineNumbers = (code: string): string[] => {
    return code.split('\n').map((_, index) => (index + 1).toString());
  };

  const lineNumbers = useMemo(() => generateLineNumbers(value), [value]);
  const maxLineNumberWidth = lineNumbers.length.toString().length;
  const totalLines = lineNumbers.length;
  const shouldShowCollapse = totalLines > maxLines;
  const isCollapsed = shouldShowCollapse && !isExpanded;
  const displayValue = useMemo(
    () => isCollapsed ? value.split('\n').slice(0, maxLines).join('\n') : value,
    [isCollapsed, maxLines, value],
  );
  const displayCode = useMemo(
    () => highlightCode(displayValue, language),
    [displayValue, language],
  );
  const displayLineNumbers = isCollapsed ? lineNumbers.slice(0, maxLines) : lineNumbers;

  return (
    <div className={cn("relative group my-4", className)}>
      {/* 代码块头部 */}
      <div className="bg-slate-100 dark:bg-slate-800 rounded-t-md py-2 px-4 text-xs font-mono border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <FileText className="h-3 w-3 text-slate-500" />
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            {getDisplayLanguage(language)}
          </span>
          {showLineNumbers && (
            <div className="flex items-center space-x-1 text-slate-500">
              <Hash className="h-3 w-3" />
              <span>
                {isCollapsed && shouldShowCollapse 
                  ? `${maxLines}/${totalLines} 行` 
                  : `${totalLines} 行`
                }
              </span>
            </div>
          )}
          {shouldShowCollapse && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              onClick={() => setIsExpanded(isCollapsed)}
              title={isCollapsed ? "展开代码" : "折叠代码"}
            >
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-60 hover:opacity-100 transition-opacity"
          onClick={handleCopy}
          title="复制代码"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
          <span className="sr-only">复制代码</span>
        </Button>
      </div>

      {/* 代码内容 */}
      <div className="bg-[#f8fafc] dark:bg-[#0f172a] rounded-b-md overflow-hidden border border-slate-200 dark:border-slate-700 border-t-0">
        <div className="overflow-x-auto">
          <div className="flex min-w-full">
            {/* 行号列 */}
            {showLineNumbers && (
              <div 
                className="flex-shrink-0 select-none bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs leading-6 text-right border-r border-slate-200 dark:border-slate-700"
                style={{ width: `${Math.max(maxLineNumberWidth * 0.6 + 1, 2.5)}rem` }}
              >
                {displayLineNumbers.map((lineNum, index) => (
                  <div 
                    key={index} 
                    className="px-3 py-0 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {lineNum}
                  </div>
                ))}
              </div>
            )}

            {/* 代码列 */}
            <div className="flex-1 min-w-0">
              <pre className="text-sm leading-6 text-slate-700 dark:text-slate-300 p-4 m-0 font-mono overflow-visible">
                <code 
                  className={cn(
                    "block min-w-full",
                    `language-${language}`
                  )}
                  dangerouslySetInnerHTML={{ __html: displayCode }}
                />
              </pre>
              
              {/* 折叠时显示的省略提示 */}
              {isCollapsed && shouldShowCollapse && (
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-center border-t border-slate-200 dark:border-slate-700 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 text-sm text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500 transition-all"
                      onClick={() => setIsExpanded(true)}
                    >
                      <ChevronDown className="h-4 w-4 mr-2" />
                      显示剩余 {totalLines - maxLines} 行代码
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 复制成功提示 */}
      {copied && (
        <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded shadow-lg animate-fade-in">
          已复制
        </div>
      )}
    </div>
  );
};

export default CodeBlock;
