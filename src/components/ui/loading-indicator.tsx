'use client';

import React from 'react';

interface LoadingIndicatorProps {
  text?: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ text = 'AI 正在思考...' }) => {
  return (
    <div className="flex items-center gap-2 py-4 text-muted-foreground">
      <div className="animate-pulse flex space-x-2">
        <div className="h-2 w-2 rounded-full bg-current"></div>
        <div className="h-2 w-2 rounded-full bg-current"></div>
        <div className="h-2 w-2 rounded-full bg-current"></div>
      </div>
      <span>{text}</span>
    </div>
  );
};

export default LoadingIndicator;