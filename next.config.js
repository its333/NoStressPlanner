/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Re-enable ESLint during builds with lenient config
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Re-enable TypeScript errors during builds
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;
