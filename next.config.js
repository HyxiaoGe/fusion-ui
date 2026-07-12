/* eslint-disable @typescript-eslint/no-require-imports */
/** @type {import('next').NextConfig} */
// 只在需要分析时加载 bundle analyzer
const withBundleAnalyzer = process.env.ANALYZE === 'true' 
  ? require('@next/bundle-analyzer')({
      enabled: true,
    })
  : (config) => config

const baseContentSecurityPolicy = "default-src * 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; font-src * data:; style-src * 'unsafe-inline';"

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
            value: baseContentSecurityPolicy
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
      // 管理中心包含跨用户敏感数据与压测导入，禁止第三方页面通过 iframe 点击劫持。
      // 此规则放在全局规则之后，并带完整 CSP，避免同名响应头覆盖时丢失既有指令。
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `${baseContentSecurityPolicy} frame-ancestors 'none';`
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Cache-Control',
            value: 'private, no-store'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
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
      // API缓存策略：只给只读列表类端点用边缘缓存。
      // 排除 chat 等流式/写入端点 — 之前用 `/api/:path*` 一刀切，会把 SSE 也标成
      // 可缓存（s-maxage=60），CF 会顺手缓存+缓冲。
      {
        source: '/api/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=300'
          }
        ],
      },
      // SSE / 长连接端点显式禁缓存禁中转压缩，避免任何中间环节缓冲。
      {
        source: '/api/chat/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      }
    ]
  },
  // 输出配置 - Railway 暂时不使用 standalone 模式
  // output: 'standalone',
  // 关闭 Next.js 自带 gzip：SSE (`/api/chat/send`) 走 rewrites 代理 fusion-api，
  // 一旦命中 compressible MIME，Next 会用 gzip stream 包一层 → 必须填满压缩块才 flush，
  // reasoning_content 增量被攒成一坨在末尾抵达。CF 在前面会重新做压缩，这里关掉无损耗。
  compress: false,
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
