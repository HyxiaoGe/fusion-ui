'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  clearEnhancedContext,
  fetchEnhancedContext,
  loadSearchSettings,
  setContextMaxItems,
  toggleContextEnhancement
} from '@/redux/slices/searchSlice';
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface ContextEnhancementControlProps {
  currentQuery?: string;
  chatId?: string;
}

const ContextEnhancementControl: React.FC<ContextEnhancementControlProps> = ({
  currentQuery = '',
  chatId,
}) => {
  const dispatch = useAppDispatch();
  const {
    searchEnabled,
    contextEnhancementEnabled,
    contextMaxItems,
    enhancedContext,
    contextSummary,
    isLoadingContext,
  } = useAppSelector((state) => state.search);
  
  const [showContext, setShowContext] = useState(false);
  
  // 组件挂载时加载设置
  useEffect(() => {
    dispatch(loadSearchSettings());
  }, [dispatch]);
  
  // 处理开关状态变化
  const handleToggleSwitch = (checked: boolean) => {
    dispatch(toggleContextEnhancement(checked));
  };
  
  // 处理上下文数量变化
  const handleMaxItemsChange = (value: number[]) => {
    dispatch(setContextMaxItems(value[0]));
  };
  
  // 手动刷新上下文
  const handleRefreshContext = () => {
    if (currentQuery && contextEnhancementEnabled) {
      dispatch(clearEnhancedContext());
      dispatch(fetchEnhancedContext({ query: currentQuery, conversationId: chatId }));
    }
  };
  
  // 格式化上下文源
  const formatSourceName = (source: string) => {
    // 假设source格式为"conversation:123456:timestamp"
    const parts = source.split(':');
    if (parts[0] === 'conversation') {
      return `对话 (${new Date(Number(parts[2] || 0)).toLocaleDateString()})`;
    }
    return source;
  };
  
  // 如果向量搜索功能未启用，不显示此组件
  if (!searchEnabled) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>上下文增强</span>
          {isLoadingContext && <Loader2 className="h-4 w-4 animate-spin" />}
        </CardTitle>
        <CardDescription>
          使用历史相关对话增强当前上下文，提升 AI 回复质量
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="context-enhancement">启用上下文增强</Label>
            <p className="text-sm text-muted-foreground">
              自动检索相关历史对话，帮助AI更好理解您的问题
            </p>
          </div>
          <Switch
            id="context-enhancement"
            checked={contextEnhancementEnabled}
            onCheckedChange={handleToggleSwitch}
          />
        </div>
        
        {contextEnhancementEnabled && (
          <>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label htmlFor="context-max-items">上下文数量: {contextMaxItems}</Label>
              </div>
              <Slider
                id="context-max-items"
                value={[contextMaxItems]}
                min={1}
                max={5}
                step={1}
                onValueChange={handleMaxItemsChange}
                disabled={!contextEnhancementEnabled}
              />
              <p className="text-xs text-muted-foreground">
                控制自动添加的相关上下文数量，更多上下文可能提供更全面的回答，但也可能稀释焦点
              </p>
            </div>
            
            <div className="border-t pt-4">
              <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowContext(!showContext)}>
                <h3 className="text-sm font-medium flex items-center">
                  当前上下文增强
                  {enhancedContext && enhancedContext.length > 0 && (
                    <Badge className="ml-2" variant="secondary">
                      {enhancedContext.length}
                    </Badge>
                  )}
                </h3>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => {
                  e.stopPropagation();
                  handleRefreshContext();
                }}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                {showContext ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              
              {showContext && (
                <div className="mt-2 space-y-2">
                  {contextSummary && (
                    <div className="text-sm bg-muted p-3 rounded-md">
                      <p className="font-medium mb-1">摘要</p>
                      <p>{contextSummary}</p>
                    </div>
                  )}
                  
                  {enhancedContext && enhancedContext.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {enhancedContext.map((item) => (
                        <div
                          key={item.id}
                          className="text-sm bg-muted p-3 rounded-md"
                        >
                          <div className="flex justify-between mb-1">
                            <span className="font-medium">
                              {formatSourceName(item.source)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              相关度: {Math.round(item.relevance * 100)}%
                            </span>
                          </div>
                          <p className="text-xs line-clamp-3">{item.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : currentQuery ? (
                    <div className="py-3 text-center text-sm text-muted-foreground">
                      {isLoadingContext ? '正在加载相关上下文...' : '没有找到相关上下文'}
                    </div>
                  ) : (
                    <div className="py-3 text-center text-sm text-muted-foreground">
                      发送消息后将自动检索相关上下文
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ContextEnhancementControl;