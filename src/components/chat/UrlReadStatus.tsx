'use client';

import React from 'react';
import { Globe } from 'lucide-react';

interface UrlReadStatusProps {
  url: string | null;
}

const UrlReadStatus: React.FC<UrlReadStatusProps> = ({ url }) => {
  let domain = '';
  if (url) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-400/30 bg-emerald-500/5 mb-3 text-sm text-muted-foreground">
      <Globe className="h-4 w-4 text-emerald-500 shrink-0" />
      <span className="truncate">
        正在读取网页{domain ? `... ${domain}` : '...'}
      </span>
      <span className="flex gap-0.5 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
};

export default UrlReadStatus;
