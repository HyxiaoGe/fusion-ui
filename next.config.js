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
  webpack: (config, { dev }) => {
    // 仅在开发环境启用轮询，避免覆盖 Next 生产构建的 chunk 规划
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
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
  // 输出配置 - Railway 暂时不使用 standalone 模式
  // output: 'standalone',
  // 压缩配置
  compress: true,
  // 生成源映射（开发环境）
  productionBrowserSourceMaps: false,

  // skip Next.js 默认对 page 路径的 trailing-slash 308 strip
  skipTrailingSlashRedirect: true,

  // 同源代理：/api/* → fusion-api。注意 :path* 捕获不含末尾斜杠，
  // 所以必须用两条规则分别匹配有/无斜杠，否则代理出去的 URL 会丢掉斜杠，
  // 触发 FastAPI 307 → Location 头泄漏 docker 内部 hostname → 浏览器 Mixed Content
  // API_BACKEND_URL 在 build 时烤进 routes-manifest（rewrites destination 是 static 的）
  async rewrites() {
    const backend = process.env.API_BACKEND_URL || 'http://localhost:8000'
    return [
      {
        source: '/api/:path*/',
        destination: `${backend}/api/:path*/`,
      },
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ]
  },
}

module.exports = withBundleAnalyzer(nextConfig)
