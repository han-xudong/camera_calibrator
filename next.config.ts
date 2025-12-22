import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'camera_calibrator';

// When running locally in production mode (npm run build && npm run start), 
// we shouldn't use the repo name as base path unless we are actually deploying to GH Pages.
// Usually, 'isProd' checks if it's a production build, but for local preview we might want root.
// However, if the goal is to test the GH Pages build locally, we must serve it under /camera_calibrator/
// or handle the mismatch.

// Better approach for GH Pages:
// Only use the repo name if we are in a GH Actions environment or explicitly told to.
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const basePath = isGithubActions ? `/${repoName}` : '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
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
