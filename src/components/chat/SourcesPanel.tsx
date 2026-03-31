'use client';

import React from 'react';
import type { SearchSource } from '@/types/conversation';

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
          <a
            key={index}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors max-w-[220px] group"
          >
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium shrink-0">
              {index + 1}
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
        );
      })}
    </div>
  );
};

export default SourcesPanel;
