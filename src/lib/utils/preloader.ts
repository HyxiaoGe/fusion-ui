/**
 * 资源预加载和缓存管理工具
 */

// 预加载状态管理
const preloadedComponents = new Set<string>();
const preloadedResources = new Set<string>();

// 组件预加载函数
export const preloadComponent = async (componentName: string, importFn: () => Promise<any>) => {
  if (preloadedComponents.has(componentName)) {
    return;
  }
  
  try {
    await importFn();
    preloadedComponents.add(componentName);
    console.log(`✅ 组件预加载完成: ${componentName}`);
  } catch (error) {
    console.warn(`❌ 组件预加载失败: ${componentName}`, error);
  }
};

// 预加载关键组件
export const preloadCriticalComponents = async () => {
  const criticalComponents = [
    {
      name: 'ChatMessageList',
      import: () => import('@/components/chat/ChatMessageList')
    },
    {
      name: 'ChatSidebar', 
      import: () => import('@/components/chat/ChatSidebar')
    },
    {
      name: 'ModelSelector',
      import: () => import('@/components/models/ModelSelector')
    }
  ];

  // 并行预加载所有关键组件
  await Promise.allSettled(
    criticalComponents.map(({ name, import: importFn }) => 
      preloadComponent(name, importFn)
    )
  );
};

// 资源预加载
export const preloadResource = (url: string, type: 'script' | 'style' | 'image' = 'script') => {
  if (preloadedResources.has(url)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let element: HTMLElement;
    
    switch (type) {
      case 'script':
        element = document.createElement('link');
        (element as HTMLLinkElement).rel = 'modulepreload';
        (element as HTMLLinkElement).href = url;
        break;
      case 'style':
        element = document.createElement('link');
        (element as HTMLLinkElement).rel = 'preload';
        (element as HTMLLinkElement).as = 'style';
        (element as HTMLLinkElement).href = url;
        break;
      case 'image':
        element = document.createElement('link');
        (element as HTMLLinkElement).rel = 'preload';
        (element as HTMLLinkElement).as = 'image';
        (element as HTMLLinkElement).href = url;
        break;
    }

    element.onload = () => {
      preloadedResources.add(url);
      resolve();
    };
    element.onerror = reject;
    
    document.head.appendChild(element);
  });
};

// 智能预加载策略
export const intelligentPreload = () => {
  // 检测网络质量
  const connection = (navigator as any).connection;
  const isSlowConnection = connection && (
    connection.effectiveType === 'slow-2g' || 
    connection.effectiveType === '2g' ||
    connection.saveData
  );

  // 如果是慢网络，只预加载最关键的组件
  if (isSlowConnection) {
    preloadComponent('ChatMessageList', () => import('@/components/chat/ChatMessageList'));
    return;
  }

  // 快网络情况下预加载更多组件
  setTimeout(() => {
    preloadCriticalComponents();
  }, 1000); // 延迟1秒执行，避免阻塞首次渲染
};

// 内存缓存管理
class MemoryCache<T> {
  private cache = new Map<string, { data: T; timestamp: number; ttl: number }>();
  
  set(key: string, data: T, ttl: number = 300000) { // 默认5分钟TTL
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    
    // 清理过期缓存
    this.cleanup();
  }
  
  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  has(key: string): boolean {
    return this.get(key) !== null;
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }
  
  // 获取缓存统计
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 导出缓存实例
export const componentCache = new MemoryCache();
export const apiCache = new MemoryCache();

// 清理缓存的工具函数
export const clearAllCaches = () => {
  componentCache.clear();
  apiCache.clear();
  preloadedComponents.clear();
  preloadedResources.clear();
  console.log('🧹 所有缓存已清理');
}; 