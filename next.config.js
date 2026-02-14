/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
  experimental: {
    // Exclude heavy server-only packages from webpack bundling.
    // These are used in API routes / ingestion scripts only.
    serverComponentsExternalPackages: [
      'cheerio',
      'jsdom',
      'playwright',
      'pdf-parse',
      'sharp',
      '@mozilla/readability',
      '@dqbd/tiktoken',
      'tiktoken',
      'ioredis',
      '@aws-sdk/client-s3',
      '@anthropic-ai/sdk',
      'openai',
      'commander',
    ],
  },
};

module.exports = nextConfig;
