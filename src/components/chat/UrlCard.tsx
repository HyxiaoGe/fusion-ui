'use client';

import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';

interface UrlCardProps {
  url: string;
  title?: string;
  favicon?: string;
}

const UrlCard: React.FC<UrlCardProps> = ({ url, title, favicon }) => {
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors mb-3 no-underline group"
    >
      {favicon ? (
        <img src={favicon} alt="" className="w-5 h-5 rounded shrink-0" />
      ) : (
        <Globe className="w-5 h-5 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {title || url}
        </div>
        <div className="text-xs text-muted-foreground">{domain}</div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </a>
  );
};

export default UrlCard;
