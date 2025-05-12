import React from 'react';
import { Flame, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HotTopic {
  title: string;
  description?: string;
  source?: string;
  link?: string;
  timestamp?: number;
  popularity?: number; // 热度指数
  category?: string;
}

interface HotTopicsDisplayProps {
  topics: HotTopic[];
  date?: string; // 可选日期参数，如果提供则显示"截至xx日热门话题"
}

const HotTopicsDisplay: React.FC<HotTopicsDisplayProps> = ({ topics, date }) => {
  if (!topics || topics.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        <div className="flex items-center">
          <Flame className="w-4 h-4 mr-2 text-orange-500" />
          <span>没有找到热门话题</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
        <Flame className="w-4 h-4 mr-2 text-orange-500" />
        {date ? `截至${date}热门话题` : '当前热门话题'}
      </h3>
      
      <ul className="space-y-2">
        {topics.map((topic, index) => (
          <li 
            key={index} 
            className={cn(
              "p-3 rounded-md transition-colors relative",
              "bg-gradient-to-br from-orange-50 to-yellow-50 hover:from-orange-100 hover:to-yellow-100 border border-orange-100"
            )}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-orange-600">
                <span className={topic.link ? "underline text-blue-600 cursor-pointer" : ""}>
                  {topic.title}
                </span>
              </h4>
              
              {topic.popularity && (
                <span className="text-xs px-2 py-1 bg-orange-100 text-orange-600 rounded-full">
                  热度: {topic.popularity}
                </span>
              )}
            </div>
            
            {topic.description && (
              <p className="text-xs text-gray-600 mt-1">{topic.description}</p>
            )}
            
            <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
              <div className="flex space-x-2">
                {topic.category && <span>{topic.category}</span>}
                {topic.source && <span>来源: {topic.source}</span>}
              </div>
              
              <div className="flex items-center">
                {topic.timestamp && (
                  <span className="mr-2">{new Date(topic.timestamp).toLocaleString()}</span>
                )}
                
                {topic.link && (
                  <a 
                    href={topic.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    阅读更多 <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                )}
              </div>
            </div>
            
            {topic.link && (
              <div 
                className="absolute inset-0 cursor-pointer" 
                onClick={() => {
                  window.open(topic.link, '_blank', 'noopener,noreferrer');
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HotTopicsDisplay; 