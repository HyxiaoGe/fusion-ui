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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/40 bg-bg-subtle hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast"
                >
                  {source.favicon ? (
                    <img
                      src={source.favicon}
                      alt=""
                      className="w-3 h-3 rounded-sm object-contain shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="flex items-center justify-center h-3.5 w-3.5 rounded-full bg-info/10 text-[9px] font-bold text-info shrink-0">
                      {index + 1}
                    </span>
                  )}
                  <span className="truncate max-w-[100px] text-fg-secondary">{domain}</span>
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
