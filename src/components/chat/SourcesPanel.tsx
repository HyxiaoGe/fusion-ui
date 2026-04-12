'use client';

import React from 'react';
import type { SearchSourceSummary } from '@/types/conversation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SourcesPanelProps {
  sources: SearchSourceSummary[];
}

const SourcesPanel: React.FC<SourcesPanelProps> = ({ sources }) => {
  if (!sources.length) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-3">
      <span className="text-[10px] text-muted-foreground/60 mr-0.5">来源</span>
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
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {source.favicon ? (
                    <img
                      src={source.favicon}
                      alt=""
                      className="h-3.5 w-3.5 rounded-sm object-contain shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="flex items-center justify-center h-3.5 w-3.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-medium shrink-0">
                      {index + 1}
                    </span>
                  )}
                  <span className="truncate max-w-[100px]">{domain}</span>
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px]">
                <p className="text-xs font-medium line-clamp-2">{source.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{domain}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
};

export default SourcesPanel;
