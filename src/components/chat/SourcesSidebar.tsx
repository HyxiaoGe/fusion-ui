'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { SearchSourceSummary } from '@/types/conversation';

interface SourcesSidebarProps {
  sources: SearchSourceSummary[];
  isOpen: boolean;
  onClose: () => void;
}

const SourcesSidebar: React.FC<SourcesSidebarProps> = ({ sources, isOpen, onClose }) => {
  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  return (
    <>
      {/* 背景遮罩 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* 侧边栏 */}
      <div className={`fixed top-0 right-0 h-full w-[360px] bg-background border-l border-border z-50 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">参考资料</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* 来源列表 */}
        <div className="overflow-y-auto h-[calc(100%-49px)]">
          {sources.map((source, index) => {
            let domain = '';
            try {
              domain = new URL(source.url).hostname.replace('www.', '');
            } catch {
              domain = source.url;
            }

            return (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {source.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {source.favicon && (
                      <img
                        src={source.favicon}
                        alt=""
                        className="h-3.5 w-3.5 rounded-sm object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <span className="text-[10px] text-muted-foreground">{domain}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground/50 shrink-0 mt-0.5">{index + 1}</span>
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default SourcesSidebar;
