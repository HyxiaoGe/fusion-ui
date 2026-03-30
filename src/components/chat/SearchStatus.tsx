'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface SearchStatusProps {
  query: string;
}

const SearchStatus: React.FC<SearchStatusProps> = ({ query }) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-400/30 bg-blue-500/5 mb-3 text-sm text-muted-foreground">
      <Search className="h-4 w-4 text-blue-500 shrink-0" />
      <span className="truncate">正在搜索: {query}</span>
      <span className="flex gap-0.5 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
};

export default SearchStatus;
