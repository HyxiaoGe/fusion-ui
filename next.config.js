/** @type {import('next').NextConfig} */
// 只在需要分析时加载 bundle analyzer
const withBundleAnalyzer = process.env.ANALYZE === 'true' 
  ? require('@next/bundle-analyzer')({
      enabled: true,
    })
  : (config) => config

const nextConfig = {
  reactStrictMode: true,
  // 实验性功能 - 移除不支持的选项
  experimental: {
    // 移除 appDir, optimizeFonts, isrMemoryCacheSize - 这些在当前版本不支持
  },
  // 编译器优化
  compiler: {
    // 移除console.log在生产环境
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
  },
  // 图像优化
  images: {
    domains: ['localhost'],
    // 启用图像优化
    formats: ['image/webp', 'image/avif'],
    // 优化图像大小
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // 构建优化
  eslint: {
    // 禁用生产构建时的ESLint检查
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 允许TypeScript错误时依然进行构建
    ignoreBuildErrors: true,
  },
  // Webpack配置优化
  webpack: (config, { isServer, dev }) => {
    // 启用轮询模式以在Docker中支持热重载
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };

    // 生产环境优化
    if (!dev && !isServer) {
      // 代码分割优化
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // 第三方库单独打包
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            // UI组件库单独打包
            ui: {
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react)[\\/]/,
              name: 'ui-libs',
              chunks: 'all',
              priority: 20,
            },
            // React相关库
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              name: 'react-libs',
              chunks: 'all',
              priority: 20,
            },
            // 工具库
            utils: {
              test: /[\\/]node_modules[\\/](lodash|date-fns|uuid)[\\/]/,
              name: 'utils-libs',
              chunks: 'all',
              priority: 15,
            },
          },
        },
      };
    }

    return config;
  },
  // 性能优化的HTTP头部设置
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src * 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; font-src * data:; style-src * 'unsafe-inline';"
          },
          // 启用压缩
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // DNS预解析
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          }
        ],
      },
      // 静态资源缓存策略
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ],
      },
      // API缓存策略
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=300'
          }
        ],
      }
    ]
  },
  // 输出配置
  output: 'standalone',
  // 压缩配置
  compress: true,
  // 生成源映射（开发环境）
  productionBrowserSourceMaps: false,

  // 在开发环境中将API请求代理到后端
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://192.168.31.98:8000'}/api/:path*`,
      },
    ]
  },
}

module.exports = withBundleAnalyzer(nextConfig)