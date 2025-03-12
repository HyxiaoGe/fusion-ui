'use client';

import React, { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import {
  toggleContextEnhancement,
  setContextMaxItems,
  loadSearchSettings,
  saveSearchSettings
} from '@/redux/slices/searchSlice';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

const SearchSettings: React.FC = () => {
  const dispatch = useAppDispatch();
  const { contextEnhancementEnabled, contextMaxItems } = useAppSelector(
    (state) => state.search
  );
  
  // 组件挂载时加载设置
  useEffect(() => {
    dispatch(loadSearchSettings());
  }, [dispatch]);
  
  // 保存设置
  const handleSaveSettings = () => {
    dispatch(
      saveSearchSettings({
        contextEnhancementEnabled,
        contextMaxItems
      })
    );
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>搜索设置</CardTitle>
          <CardDescription>
            配置语义搜索和上下文增强相关选项
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="context-enhancement-setting">启用上下文增强</Label>
                <p className="text-sm text-muted-foreground">
                  自动检索相关历史对话，帮助AI更好理解您的问题
                </p>
              </div>
              <Switch
                id="context-enhancement-setting"
                checked={contextEnhancementEnabled}
                onCheckedChange={(checked) => dispatch(toggleContextEnhancement(checked))}
              />
            </div>
            
            {contextEnhancementEnabled && (
              <div className="space-y-3 pt-2">
                <div className="flex justify-between">
                  <Label>上下文数量: {contextMaxItems}</Label>
                </div>
                <Slider
                  value={[contextMaxItems]}
                  min={1}
                  max={5}
                  step={1}
                  onValueChange={(value) => dispatch(setContextMaxItems(value[0]))}
                />
                <p className="text-xs text-muted-foreground">
                  控制自动添加的相关上下文数量，更多上下文可能提供更全面的回答，但也可能稀释焦点
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-medium">语义搜索</h3>
            <p className="text-sm text-muted-foreground">
              基于向量搜索的语义搜索功能可以帮助您找到与当前主题相关的历史对话，即使它们不包含相同的关键词。
            </p>
            <p className="text-sm text-muted-foreground">
              您可以通过顶部导航栏的搜索框来搜索历史对话和消息。
            </p>
          </div>
          
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveSettings}>
              保存设置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SearchSettings;