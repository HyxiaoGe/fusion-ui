import React, { useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { AlertTriangle, Loader2, Search } from 'lucide-react';
import HotTopicsDisplay from './HotTopicsDisplay';
import { cn } from '@/lib/utils';

// 用于显示 Web 搜索结果的子组件
interface WebSearchResultItem {
  title: string;
  link?: string; 
  snippet?: string; 
  timestamp?: string;
  source?: string; // 新增 source 字段
}

interface WebSearchResultsProps {
  query: string | null;
  results: WebSearchResultItem[];
}

const WebSearchResultsDisplay: React.FC<WebSearchResultsProps> = ({ query, results }) => {
  if (!results || results.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        <div className="flex items-center">
          <Search className="w-4 h-4 mr-2" />
          <span>No search results for "{query || 'your query'}".</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {query && (
        <div className="flex items-center mb-3">
          <Search className="w-4 h-4 mr-2 text-blue-500" />
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">"{query}"</h3>
        </div>
      )}
      <ul className="space-y-3">
        {results.map((item, index) => (
          <li 
            key={index} 
            className={cn(
              "p-3 rounded-md transition-colors relative border shadow-sm",
              "bg-gradient-to-br from-blue-50 via-gray-50 to-blue-50 dark:from-gray-800/30 dark:via-gray-800/10 dark:to-gray-800/30", 
              "hover:from-blue-100 hover:via-gray-100 hover:to-blue-100 dark:hover:from-gray-700/50 dark:hover:via-gray-700/30 dark:hover:to-gray-700/50",
              "border-blue-100 dark:border-gray-700"
            )}
          >
            <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-1">
              {item.link ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="break-words">
                  {item.title}
                </a>
              ) : (
                <span className="break-words">{item.title}</span>
              )}
            </h4>
            {item.snippet && <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 mb-1 break-words">{item.snippet}</p>}
            <div className="flex items-center justify-end text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              <span>{item.source || 'Unknown source'}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const FunctionCallDisplay: React.FC<{ chatId: string }> = ({ chatId }) => {
  const functionCallOutput = useAppSelector(state => 
    state.chat.chats.find(c => c.id === chatId)?.functionCallOutput
  );
  const globalFunctionCallType = useAppSelector(state => state.chat.functionCallType);
  const globalIsFunctionCallInProgress = useAppSelector(state => state.chat.isFunctionCallInProgress);
  const functionCallStepContent = useAppSelector(state => state.chat.functionCallStepContent); // 获取步骤内容

  // 使用useEffect监控状态变化
  useEffect(() => {
  }, [functionCallOutput]);

  // 优先显示全局正在进行的函数调用loading状态
  if (globalIsFunctionCallInProgress && !functionCallOutput) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-sm text-gray-500 h-full">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <span>{functionCallStepContent || `正在执行 ${globalFunctionCallType || '函数'}...`}</span>
      </div>
    );
  }

  // 如果没有活动的函数调用输出，则不显示任何内容
  if (!functionCallOutput) {
    return null;
  }

  const { type, data, error, query, timestamp } = functionCallOutput;

  // 如果有错误信息，显示错误
  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-sm text-red-600 h-full">
        <AlertTriangle className="w-6 h-6 mb-2" />
        <span>Error: {error}</span>
        {type && <span className="text-xs text-gray-400">(Function: {type})</span>}
      </div>
    );
  }

  // 如果没有数据（但也没有错误），可能是一个旧的清除状态或者不完整的数据
  if (!data) {
      // 可以选择返回null，或者一个占位符，或者一个基于类型的特定消息
      // 如果 type 存在但 data 不存在且没error，可能意味着函数调用未产生有效数据或被清除了
      // 对于已完成且无错误的调用，我们期望有 data
      return null; 
  }

  // 根据类型渲染不同的组件
  switch (type) {
    case 'web_search':
      if (Array.isArray(data.results)) {
        return <WebSearchResultsDisplay query={query || data.query || null} results={data.results} />;
      } else {
        return (
          <div className="p-4 text-sm text-red-500">
            <AlertTriangle className="w-4 h-4 mr-2 inline-block" />
            Invalid data structure for web_search.
          </div>
        );
      }
    case 'hot_topics':
      if (Array.isArray(data.topics)) {
        return <HotTopicsDisplay topics={data.topics} date={data.date} />;
      } else {
        return (
          <div className="p-4 text-sm text-red-500">
            <AlertTriangle className="w-4 h-4 mr-2 inline-block" />
            Invalid data structure for hot_topics.
          </div>
        );
      }
    // 在这里可以为其他 functionCallType 添加 case
    // case 'get_stock_price':
    //   return <StockPriceDisplay data={functionCallData} />;
    default:
      return (
        <div className="p-4 text-sm text-yellow-600">
          <AlertTriangle className="w-4 h-4 mr-2 inline-block" />
          Unsupported function call type: {type}
        </div>
      );
  }
};

export default FunctionCallDisplay; 