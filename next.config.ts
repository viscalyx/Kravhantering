import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// ---------------------------------------------------------------------------
// Build target — controls which lib/runtime/build-target.*.ts is aliased in.
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production'
// Treat empty / whitespace-only BUILD_TARGET as unset so the validation below
// catches it instead of silently producing `lib/runtime/build-target..ts`.
const rawBuildTarget = process.env.BUILD_TARGET?.trim()
const buildTarget =
  rawBuildTarget && rawBuildTarget.length > 0
    ? rawBuildTarget
    : isProduction
      ? undefined
      : 'dev'

if (isProduction && buildTarget === undefined) {
  throw new Error(
    'BUILD_TARGET must be set when NODE_ENV=production. ' +
      "Use 'prod' for real deployments or 'local-prod' for local prodlike runs. " +
      'Example: BUILD_TARGET=prod npm run build',
  )
}

if (
  buildTarget !== undefined &&
  !['dev', 'local-prod', 'prod'].includes(buildTarget)
) {
  throw new Error(
    `Unknown BUILD_TARGET=${buildTarget}. Valid values: dev, local-prod, prod`,
  )
}

const resolvedBuildTarget = buildTarget as 'dev' | 'local-prod' | 'prod'
const buildTargetSuffix =
  resolvedBuildTarget === 'dev' ? '' : `.${resolvedBuildTarget}`
const buildTargetModulePath = fileURLToPath(
  new URL(`./lib/runtime/build-target${buildTargetSuffix}.ts`, import.meta.url),
)

const enableDeveloperMode =
  process.env.ENABLE_DEVELOPER_MODE === 'true' || resolvedBuildTarget === 'dev'
const developerModeCoreNoopPath = fileURLToPath(
  new URL('./packages/developer-mode-core/src/noop.ts', import.meta.url),
)
const developerModeReactNoopPath = fileURLToPath(
  new URL('./packages/developer-mode-react/src/noop.tsx', import.meta.url),
)

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
      resolvedBuildTarget !== 'dev' ? { exclude: ['error'] } : false,
  },
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  serverExternalPackages: ['better-sqlite3', 'mermaid'],
  allowedDevOrigins: ['0.0.0.0', '127.0.0.1'],
  webpack(config) {
    // Build-target module swap: alias @/lib/runtime/build-target to the
    // concrete implementation for this build target. Applied for both server
    // and client bundles so production builds are uniformly frozen.
    if (resolvedBuildTarget !== 'dev') {
      config.resolve.alias['@/lib/runtime/build-target'] = buildTargetModulePath
    }

    if (!enableDeveloperMode) {
      config.resolve.alias['@viscalyx/developer-mode-core'] =
        developerModeCoreNoopPath
      config.resolve.alias['@viscalyx/developer-mode-react'] =
        developerModeReactNoopPath
    }

    return config
  },
  // CSP is set per-request in proxy.ts (nonce-based).
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

export default withNextIntl(nextConfig)
