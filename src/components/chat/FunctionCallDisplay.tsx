import React, { useEffect } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { AlertTriangle, Loader2, Search } from 'lucide-react';
import HotTopicsDisplay from './HotTopicsDisplay';

// 用于显示 Web 搜索结果的子组件 (稍后填充具体实现)
interface WebSearchResultItem {
  title: string;
  link?: string; // 根据截图，link 可能没有，但我们先定义上
  snippet?: string; // 根据截图，snippet 可能没有
  timestamp?: string; // 根据截图，有 timestamp
  // 根据实际从 functionCallData.results 获取到的字段来调整
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
      {query && <h3 className="text-sm font-semibold text-gray-700 mb-2">Search results for: "{query}"</h3>}
      <ul className="space-y-2">
        {results.map((item, index) => (
          <li key={index} className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
            <h4 className="text-sm font-medium text-blue-600 hover:underline">
              {item.link ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </h4>
            {item.snippet && <p className="text-xs text-gray-600 mt-1 truncate">{item.snippet}</p>}
            {item.timestamp && <p className="text-xs text-gray-400 mt-1">{new Date(item.timestamp).toLocaleString()}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
};

const FunctionCallDisplay: React.FC = () => {
  const {
    activeChatId,
    chats,
    // 全局的函数调用进行中状态，用于显示当前操作的loading
    isFunctionCallInProgress: globalIsFunctionCallInProgress,
    functionCallType: globalFunctionCallType,
  } = useAppSelector((state) => state.chat);

  const activeChat = chats.find(chat => chat.id === activeChatId);
  const functionCallOutput = activeChat?.functionCallOutput;

  // 添加调试日志，记录组件每次渲染时的状态
  console.log('FunctionCallDisplay 渲染：', {
    activeChatId,
    'activeChat?.id': activeChat?.id,
    'functionCallOutput': functionCallOutput,
    globalIsFunctionCallInProgress,
    functionCallType: globalFunctionCallType,
    date: new Date().toISOString(),
  });

  // 使用useEffect监控状态变化
  useEffect(() => {
    console.log('FunctionCallOutput 改变：', {
      functionCallOutput,
      date: new Date().toISOString()
    });
  }, [functionCallOutput]);

  // 优先显示全局正在进行的函数调用loading状态
  if (globalIsFunctionCallInProgress && !functionCallOutput) {
    console.log('显示加载状态', {date: new Date().toISOString()});
    return (
      <div className="p-4 flex flex-col items-center justify-center text-sm text-gray-500 h-full">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <span>Executing function: {globalFunctionCallType || 'loading'}...</span>
      </div>
    );
  }

  // 如果没有活动的函数调用输出，则不显示任何内容
  if (!functionCallOutput) {
    console.log('没有函数调用输出，不显示面板', {date: new Date().toISOString()});
    return null;
  }

  const { type, data, error, query, timestamp } = functionCallOutput;
  console.log('有函数调用输出，准备显示：', {type, query, error, date: new Date().toISOString()});

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