'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { estimateConversationTokens, MODEL_TOKEN_LIMITS } from '@/lib/utils/tokenizer';

interface TokenCounterProps {
  messages: Array<{role: string, content: string}>;
  modelId: string;
  className?: string;
}

const TokenCounter: React.FC<TokenCounterProps> = ({ messages, modelId, className }) => {
  const tokenCount = estimateConversationTokens(messages);
  const tokenLimit = MODEL_TOKEN_LIMITS[modelId] || 4096;
  const usagePercentage = (tokenCount / tokenLimit) * 100;
  
  // 确定颜色
  let statusColor = 'text-green-500';
  if (usagePercentage > 90) {
    statusColor = 'text-destructive';
  } else if (usagePercentage > 75) {
    statusColor = 'text-amber-500';
  }

  return (
    <div className={`space-y-1 ${className || ''}`}>
      <div className="flex justify-between text-xs">
        <span>Token用量估计</span>
        <span className={statusColor}>
          {tokenCount.toLocaleString()} / {tokenLimit.toLocaleString()} 
          ({Math.round(usagePercentage)}%)
        </span>
      </div>
      <Progress value={usagePercentage} 
        className={`h-1 ${usagePercentage > 90 ? 'bg-red-200 dark:bg-red-950' : usagePercentage > 75 ? 'bg-amber-200 dark:bg-amber-950' : 'bg-muted'}`} 
        indicatorClassName={usagePercentage > 90 ? 'bg-destructive' : usagePercentage > 75 ? 'bg-amber-500' : 'bg-green-500'} 
      />
      <p className="text-xs text-muted-foreground">
        注：此为估算值，实际token数可能有所不同
      </p>
    </div>
  );
};

export default TokenCounter;