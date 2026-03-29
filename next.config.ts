import path from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
const enableDeveloperMode =
  process.env.ENABLE_DEVELOPER_MODE === 'true' ||
  process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  transpilePackages: [
    '@viscalyx/developer-mode-core',
    '@viscalyx/developer-mode-react',
  ],
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  serverExternalPackages: ['mermaid'],
  allowedDevOrigins: ['0.0.0.0', '127.0.0.1'],
  webpack(config) {
    if (!enableDeveloperMode) {
      config.resolve.alias['@viscalyx/developer-mode-core'] = path.resolve(
        process.cwd(),
        'packages/developer-mode-core/src/noop.ts',
      )
      config.resolve.alias['@viscalyx/developer-mode-react'] = path.resolve(
        process.cwd(),
        'packages/developer-mode-react/src/noop.tsx',
      )
    }

    return config
  },
  // CSP is set per-request in middleware.ts (nonce-based).
  // Only static security headers are defined here.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: [
              'accelerometer=()',
              'autoplay=()',
              'camera=()',
              'cross-origin-isolated=()',
              'display-capture=()',
              'encrypted-media=()',
              'fullscreen=()',
              'geolocation=()',
              'gyroscope=()',
              'idle-detection=()',
              'magnetometer=()',
              'microphone=()',
              'midi=()',
              'payment=()',
              'picture-in-picture=()',
              'publickey-credentials-get=()',
              'screen-wake-lock=()',
              'serial=()',
              'usb=()',
              'web-share=()',
              'xr-spatial-tracking=()',
            ].join(', '),
          },
        ],
      },
    ]
  },
}

// Conditionally initialize OpenNext Cloudflare dev bindings
if (process.env.NODE_ENV === 'development') {
  import('@opennextjs/cloudflare')
    .then(({ initOpenNextCloudflareForDev }) => initOpenNextCloudflareForDev())
    .catch((error: unknown) => {
      console.error(
        'Failed to initialize OpenNext Cloudflare dev bindings:',
        error instanceof Error ? error.message : error,
      )
    })
}

export default withNextIntl(nextConfig)
