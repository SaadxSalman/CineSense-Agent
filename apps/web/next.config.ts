import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Silence multi-lockfile workspace-root inference (root has its own lockfile)
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
