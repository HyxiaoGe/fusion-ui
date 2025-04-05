/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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