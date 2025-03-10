/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: '.next',
  // Allow building outside of the src directory
  webpack: (config, { isServer }) => {
    // Important to enable correct path resolution for renderer
    config.resolve.symlinks = false;
    return config;
  },
  // Make Next.js aware we're running in Electron
  experimental: {
    images: {
      unoptimized: true,
    },
  },
  // We need to reference the static files from the build directory
  assetPrefix: './',
};

module.exports = nextConfig; 