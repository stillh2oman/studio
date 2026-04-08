/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Native addons + pdf.js worker — keep out of webpack on the server bundle. */
  serverExternalPackages: ['canvas', 'pdf-to-img', 'pdfjs-dist'],
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '40mb',
    },
  },
  /**
   * Dev: large app + first compile can exceed default chunk fetch timeout → ChunkLoadError on app/layout.js.
   * Does not apply when using `next dev --turbo`.
   */
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.output = { ...config.output, chunkLoadTimeout: 300000 };
    }
    return config;
  },
  /** Common typos / old links → correct Plan Review API (POST body preserved). */
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/api/paln-review-run', destination: '/api/plan-review/run' },
        { source: '/api/plan-review-run', destination: '/api/plan-review/run' },
      ],
    };
  },
  /** Reduces stale HTML / chunks after deploys/hot reload (old shell → ChunkLoadError). */
  async headers() {
    return [
      {
        source: '/',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
  images: {
    // Firebase/Cloud Run deployments can intermittently fail Next's image optimizer.
    // Using unoptimized ensures external (Dropbox) images render reliably.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.dropbox.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'dl.dropboxusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
