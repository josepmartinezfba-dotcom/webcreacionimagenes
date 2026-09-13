/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb'
    }
  }
};

module.exports = nextConfig;
