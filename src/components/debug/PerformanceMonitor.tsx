'use client';

import React, { useEffect, useState, useRef } from 'react';
import { componentCache, apiCache } from '@/lib/utils/preloader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Monitor, 
  Clock, 
  Database, 
  Trash2, 
  RefreshCw,
  BarChart3,
  TrendingUp,
  Activity
} from 'lucide-react';

interface PerformanceMetrics {
  pageLoadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  componentRenderTimes: Record<string, number>;
  cacheHitRate: number;
  memoryUsage: number;
}

const PerformanceMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    pageLoadTime: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    componentRenderTimes: {},
    cacheHitRate: 0,
    memoryUsage: 0
  });
  
  const [isVisible, setIsVisible] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 收集性能指标
  const collectMetrics = () => {
    // 页面性能指标
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintEntries = performance.getEntriesByType('paint');
    
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    const lcpEntry = lcpEntries[lcpEntries.length - 1];

    // 缓存统计
    const componentCacheStats = componentCache.getStats();
    const apiCacheStats = apiCache.getStats();
    
    // 内存使用（如果可用）
    const memoryInfo = (performance as any).memory;

    setMetrics({
      pageLoadTime: navigation ? navigation.loadEventEnd - navigation.loadEventStart : 0,
      firstContentfulPaint: fcpEntry ? fcpEntry.startTime : 0,
      largestContentfulPaint: lcpEntry ? lcpEntry.startTime : 0,
      componentRenderTimes: getComponentRenderTimes(),
      cacheHitRate: calculateCacheHitRate(),
      memoryUsage: memoryInfo ? memoryInfo.usedJSHeapSize / 1024 / 1024 : 0
    });
  };

  // 获取组件渲染时间（模拟数据，实际需要使用React Profiler）
  const getComponentRenderTimes = (): Record<string, number> => {
    const measures = performance.getEntriesByType('measure');
    const componentTimes: Record<string, number> = {};
    
    measures.forEach(measure => {
      if (measure.name.startsWith('⚛️')) {
        componentTimes[measure.name] = measure.duration;
      }
    });
    
    return componentTimes;
  };

  // 计算缓存命中率
  const calculateCacheHitRate = (): number => {
    // 这里需要根据实际的缓存统计来计算
    // 暂时返回模拟数据
    return Math.random() * 100;
  };

  // 清理所有缓存
  const clearCaches = () => {
    componentCache.clear();
    apiCache.clear();
    
    // 清理localStorage中的缓存
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('suggested_questions_') || key.startsWith('cache_')) {
        localStorage.removeItem(key);
      }
    });
    
    collectMetrics();
  };

  // 格式化时间
  const formatTime = (time: number): string => {
    if (time < 1000) {
      return `${time.toFixed(1)}ms`;
    }
    return `${(time / 1000).toFixed(2)}s`;
  };

  // 格式化内存大小
  const formatMemory = (bytes: number): string => {
    return `${bytes.toFixed(1)}MB`;
  };

  // 启动自动刷新
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(collectMetrics, 2000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  // 初始收集指标
  useEffect(() => {
    collectMetrics();
  }, []);

  // 键盘快捷键切换显示
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'P') {
        setIsVisible(!isVisible);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isVisible]);

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-50 opacity-50 hover:opacity-100"
        onClick={() => setIsVisible(true)}
      >
        <Monitor className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-80 max-h-96 overflow-y-auto z-50 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            性能监控
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'text-green-600' : ''}
            >
              <RefreshCw className={`h-3 w-3 ${autoRefresh ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(false)}
            >
              ×
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 text-xs">
        {/* 页面性能 */}
        <div>
          <h4 className="font-semibold flex items-center gap-1 mb-1">
            <Clock className="h-3 w-3" />
            页面性能
          </h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>页面加载:</span>
              <span className="font-mono">{formatTime(metrics.pageLoadTime)}</span>
            </div>
            <div className="flex justify-between">
              <span>首次内容绘制:</span>
              <span className="font-mono">{formatTime(metrics.firstContentfulPaint)}</span>
            </div>
            <div className="flex justify-between">
              <span>最大内容绘制:</span>
              <span className="font-mono">{formatTime(metrics.largestContentfulPaint)}</span>
            </div>
          </div>
        </div>

        {/* 缓存状态 */}
        <div>
          <h4 className="font-semibold flex items-center gap-1 mb-1">
            <Database className="h-3 w-3" />
            缓存状态
          </h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>组件缓存:</span>
              <span className="font-mono">{componentCache.getStats().size}项</span>
            </div>
            <div className="flex justify-between">
              <span>API缓存:</span>
              <span className="font-mono">{apiCache.getStats().size}项</span>
            </div>
            <div className="flex justify-between">
              <span>命中率:</span>
              <span className="font-mono">{metrics.cacheHitRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* 内存使用 */}
        {metrics.memoryUsage > 0 && (
          <div>
            <h4 className="font-semibold flex items-center gap-1 mb-1">
              <BarChart3 className="h-3 w-3" />
              内存使用
            </h4>
            <div className="flex justify-between text-xs">
              <span>JS堆内存:</span>
              <span className="font-mono">{formatMemory(metrics.memoryUsage)}</span>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={collectMetrics}
            className="flex-1 h-7 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearCaches}
            className="flex-1 h-7 text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            清理缓存
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          快捷键: Ctrl+Shift+P
        </div>
      </CardContent>
    </Card>
  );
};

export default PerformanceMonitor; 