import './globals.css';
import { Providers } from '@/redux/providers';
import ClientLayout from './ClientLayout';
import { cn } from '@/lib/utils';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fusion UI - 智能聊天界面',
  description: '基于Next.js构建的现代化聊天应用',
  viewport: 'width=device-width, initial-scale=1',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
  // 性能优化的meta标签
  robots: 'index,follow',
  icons: {
    icon: '/favicon.ico',
  },
  // 预连接到可能的外部资源
  other: {
    'dns-prefetch': '//fonts.googleapis.com',
    'preconnect': 'https://fonts.gstatic.com',
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 预加载关键字体 */}
        <link
          rel="preload"
          href="/fonts/inter-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* DNS预解析和预连接 */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* 关键资源提示 */}
        <link rel="preload" href="/api/models" as="fetch" crossOrigin="anonymous" />
      </head>
      <body className={cn(
        "min-h-screen bg-background font-sans antialiased",
        "transition-colors duration-200"
      )}>
        <Providers>
          <ClientLayout>
            {children}
          </ClientLayout>
        </Providers>
      </body>
    </html>
  );
}