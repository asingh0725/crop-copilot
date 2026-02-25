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
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    // sharp is a native binary — keep it out of the webpack bundle.
    serverComponentsExternalPackages: ['sharp'],
  },
};

module.exports = nextConfig;
