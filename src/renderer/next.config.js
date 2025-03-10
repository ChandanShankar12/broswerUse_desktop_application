/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'export',
  distDir: '.next',
  images: {
    unoptimized: true,
  },
  assetPrefix: '/',
};

module.exports = nextConfig; 