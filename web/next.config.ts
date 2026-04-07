import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Don't fail build on type errors during development
    ignoreBuildErrors: false,
  },
  eslint: {
    // Don't fail build on lint errors during development
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
