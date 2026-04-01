'use client';

import React from 'react';
import type { SearchSource } from '@/types/conversation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SourcesPanelProps {
  sources: SearchSource[];
}

const SourcesPanel: React.FC<SourcesPanelProps> = ({ sources }) => {
  if (!sources.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {sources.map((source, index) => {
        let domain = '';
        try {
          domain = new URL(source.url).hostname.replace('www.', '');
        } catch {
          domain = source.url;
        }

        return (
          <TooltipProvider key={index} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors max-w-[220px] group"
                >
                  <span className="relative flex items-center justify-center h-5 w-5 shrink-0">
                    {source.favicon ? (
                      <img
                        src={source.favicon}
                        alt=""
                        className="h-4 w-4 rounded-sm object-contain"
                        onError={(e) => {
                          // favicon 加载失败时回退为编号圆圈
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <span className={`flex items-center justify-center h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium ${source.favicon ? 'hidden' : ''}`}>
                      {index + 1}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate group-hover:text-foreground transition-colors">
                      {source.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {domain}
                    </p>
                  </div>
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[360px]">
                <p className="text-xs font-medium">{source.title}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{source.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
};

export default SourcesPanel;
