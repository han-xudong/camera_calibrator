import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
