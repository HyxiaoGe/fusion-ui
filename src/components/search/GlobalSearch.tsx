'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setActiveChat } from '@/redux/slices/chatSlice';
import {
  clearError,
  clearSearchResults,
  fetchConversationResults,
  fetchMessageResults,
  setActiveTab,
  setQuery
} from '@/redux/slices/searchSlice';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Loader2, MessageCircle, MessageSquare, Search as SearchIcon, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

const GlobalSearch: React.FC = () => {
  const dispatch = useAppDispatch();
  const {
    searchEnabled,
    query,
    activeTab,
    isSearching,
    conversationResults,
    messageResults,
    error
  } = useAppSelector(state => state.search);
  
  const [open, setOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const debouncedQuery = useDebounce(localQuery, 500);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 监听输入变化
  useEffect(() => {
    if (debouncedQuery) {
      dispatch(setQuery(debouncedQuery));
      if (activeTab === 'conversations') {
        dispatch(fetchConversationResults(debouncedQuery));
      } else {
        dispatch(fetchMessageResults({ query: debouncedQuery }));
      }
    }
  }, [debouncedQuery, activeTab, dispatch]);
  
  // 打开对话框时自动聚焦搜索框
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);
  
  // 切换标签页时重新搜索
  const handleTabChange = (tab: 'conversations' | 'messages') => {
    dispatch(setActiveTab(tab));
    if (query) {
      if (tab === 'conversations') {
        dispatch(fetchConversationResults(query));
      } else {
        dispatch(fetchMessageResults({ query }));
      }
    }
  };
  
  // 清空搜索结果并关闭对话框
  const handleClear = () => {
    setLocalQuery('');
    dispatch(clearSearchResults());
    setOpen(false);
  };
  
  // 处理选择对话
  const handleSelectConversation = (conversationId: string) => {
    dispatch(setActiveChat(conversationId));
    setOpen(false);
  };
  
  // 格式化搜索结果中的日期
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '未知时间';
    return formatDistanceToNow(new Date(timestamp), {
      addSuffix: true,
      locale: zhCN
    });
  };
  
  // 如果功能未启用，显示禁用状态的搜索框
  if (!searchEnabled) {
    return (
      <Button 
        variant="outline" 
        className="gap-2 w-full md:w-64 opacity-70 cursor-not-allowed"
        disabled={true}
      >
        <SearchIcon className="h-4 w-4" />
        <span className="text-muted-foreground">向量搜索功能已关闭</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="gap-2 w-full md:w-64"
          onClick={() => dispatch(clearError())}
        >
          <SearchIcon className="h-4 w-4" />
          <span className="text-muted-foreground">搜索历史对话...</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>搜索历史对话和消息</DialogTitle>
        </DialogHeader>
        
        <div className="flex items-center border rounded-md mt-4">
          <SearchIcon className="h-4 w-4 mx-2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="输入关键词、问题或主题..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {isSearching ? (
            <Loader2 className="h-4 w-4 mx-2 animate-spin text-muted-foreground" />
          ) : localQuery ? (
            <Button 
              variant="ghost" 
              className="p-2 h-8 w-8" 
              onClick={() => setLocalQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        
        {error && (
          <div className="text-destructive text-sm mt-2">
            {error}
          </div>
        )}
        
        <Tabs 
          defaultValue="conversations" 
          value={activeTab} 
          onValueChange={(val) => handleTabChange(val as 'conversations' | 'messages')}
          className="mt-2"
        >
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="conversations" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span>对话</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span>消息</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="conversations" className="max-h-80 overflow-y-auto">
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2">正在搜索...</span>
              </div>
            ) : conversationResults.length > 0 ? (
              <div className="space-y-2 py-2">
                {conversationResults.map((result) => (
                  <div 
                    key={result.id}
                    className="border rounded-md p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => handleSelectConversation(result.id)}
                  >
                    <div className="flex justify-between">
                      <div className="font-medium">
                        {result.title || '未命名对话'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        相关度: {Math.round(result.similarity * 100)}%
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {result.content}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {result.timestamp && formatDate(result.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            ) : query ? (
              <div className="text-center py-8 text-muted-foreground">
                未找到匹配的对话
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                输入关键词开始搜索
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="messages" className="max-h-80 overflow-y-auto">
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2">正在搜索...</span>
              </div>
            ) : messageResults.length > 0 ? (
              <div className="space-y-2 py-2">
                {messageResults.map((result) => (
                  <div 
                    key={result.id}
                    className="border rounded-md p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => result.conversationId && handleSelectConversation(result.conversationId)}
                  >
                    <div className="flex justify-between">
                      <div className="font-medium">
                        {result.title || '对话片段'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        相关度: {Math.round(result.similarity * 100)}%
                      </div>
                    </div>
                    <div className="text-sm line-clamp-2 mt-1">
                      {result.content}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {result.timestamp && formatDate(result.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            ) : query ? (
              <div className="text-center py-8 text-muted-foreground">
                未找到匹配的消息
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                输入关键词开始搜索
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end mt-2">
          <Button variant="outline" onClick={handleClear}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GlobalSearch;