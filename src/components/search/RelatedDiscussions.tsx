'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setActiveChat } from '@/redux/slices/chatSlice';
import { fetchRelatedDiscussions } from '@/redux/slices/searchSlice';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import React, { useEffect } from 'react';

interface RelatedDiscussionsProps {
  currentQuery: string;
  chatId?: string;
}

const RelatedDiscussions: React.FC<RelatedDiscussionsProps> = ({ currentQuery, chatId }) => {
  const dispatch = useAppDispatch();
  const { searchEnabled, relatedDiscussions, isLoadingRelated } = useAppSelector((state) => state.search);
  
  // 当查询变化时加载相关对话
  useEffect(() => {
    if (searchEnabled && currentQuery && currentQuery.length > 5) {
      dispatch(fetchRelatedDiscussions({ query: currentQuery, conversationId: chatId }));
    }
  }, [searchEnabled, currentQuery, chatId, dispatch]);
  
  // 处理选择对话
  const handleSelectConversation = (conversationId: string) => {
    if (conversationId !== chatId) {
      dispatch(setActiveChat(conversationId));
    }
  };
  
  // 格式化日期
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '未知时间';
    return formatDistanceToNow(new Date(timestamp), {
      addSuffix: true,
      locale: zhCN
    });
  };
  
  // 如果向量搜索功能未启用或没有查询，不显示组件
  if (!searchEnabled || !currentQuery || currentQuery.length <= 5) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>相关讨论</span>
          {isLoadingRelated && <Loader2 className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoadingRelated ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : relatedDiscussions.length > 0 ? (
          <div className="space-y-3">
            {relatedDiscussions.map((discussion) => (
              <div 
                key={discussion.id}
                className={`border rounded-md p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                  discussion.id === chatId ? 'border-primary' : ''
                }`}
                onClick={() => handleSelectConversation(discussion.id)}
              >
                <div className="font-medium line-clamp-1">
                  {discussion.title || '未命名对话'}
                </div>
                <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {discussion.content}
                </div>
                <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                  <span>{discussion.timestamp && formatDate(discussion.timestamp)}</span>
                  <span>相关度: {Math.round(discussion.relevance * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            未找到相关对话
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RelatedDiscussions;