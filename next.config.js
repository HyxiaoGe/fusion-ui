/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 恢复原始配置，不需要distDir
  images: {
    domains: ['localhost'],
  },
  eslint: {
    // 禁用生产构建时的ESLint检查
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 允许TypeScript错误时依然进行构建
    ignoreBuildErrors: true,
  },
  // 为Docker环境添加热重载支持
  webpack: (config, { isServer }) => {
    // 启用轮询模式以在Docker中支持热重载
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src * 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; font-src * data:; style-src * 'unsafe-inline';"
          }
        ],
      },
    ]
  },
}

module.exports = nextConfig