/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
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