import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'camera_calibrator';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isProd ? `/${repoName}` : '',
  assetPrefix: isProd ? `/${repoName}/` : '',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? `/${repoName}` : '',
  },
  webpack: (config) => {
    // Enable WebAssembly and Top Level Await support
    config.experiments = { 
      ...config.experiments, 
      asyncWebAssembly: true, 
      topLevelAwait: true,
      layers: true // Needed for some WASM setups
    };
    return config;
  },
  turbopack: {
    // Empty config to satisfy Next.js 16 requirement when webpack config is present
  },
};

export default nextConfig;
