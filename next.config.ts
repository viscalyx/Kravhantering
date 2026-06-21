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

const BUILD_TARGETS = ['dev', 'local-prod', 'prod'] as const
type BuildTarget = (typeof BUILD_TARGETS)[number]
const isBuildTarget = (value: string | undefined): value is BuildTarget =>
  value !== undefined && (BUILD_TARGETS as readonly string[]).includes(value)

if (!isBuildTarget(buildTarget)) {
  throw new Error(
    `Unknown BUILD_TARGET=${buildTarget}. Valid values: ${BUILD_TARGETS.join(', ')}`,
  )
}
const resolvedBuildTarget: BuildTarget = buildTarget
const buildTargetSuffix =
  resolvedBuildTarget === 'dev' ? '' : `.${resolvedBuildTarget}`
// Turbopack's `resolveAlias` interprets a leading `/` as project-root-
// relative, so absolute paths like `/workspace/...` get resolved against
// the project root and 404. Use a project-relative path with `./` prefix.
const buildTargetModulePathRelative = `./lib/runtime/build-target${buildTargetSuffix}.ts`

const explicitDeveloperModeEnabled =
  process.env.ENABLE_DEVELOPER_MODE === 'true'
const enableDeveloperMode =
  !isProduction &&
  (resolvedBuildTarget === 'dev' || explicitDeveloperModeEnabled)

if (explicitDeveloperModeEnabled && isProduction) {
  console.warn(
    'ENABLE_DEVELOPER_MODE=true was ignored because NODE_ENV=production. ' +
      'Production builds always alias Developer Mode packages to no-op stubs.',
  )
}
// When developer mode is disabled, swap the `@viscalyx/developer-mode-*`
// packages for first-party stubs in `lib/runtime/`. This deliberately avoids
// pointing the alias at the published package's own `/noop` subpath so that
// production builds (and the production runtime they produce) contain zero
// references to the developer-mode packages — they can be pruned with
// `npm prune --omit=dev` without breaking the build. Turbopack treats a
// leading `/` as project-root-relative, so aliases use `./`-prefixed paths.
const developerModeCoreNoopPathRelative =
  './lib/runtime/developer-mode-core-noop.ts'
const developerModeReactNoopPathRelative =
  './lib/runtime/developer-mode-react-noop.tsx'
const expoSqliteUnavailablePathRelative =
  './lib/runtime/expo-sqlite-unavailable.ts'

const UNSUPPORTED_WEBPACK_BUILD_MESSAGE = [
  'Webpack builds are unsupported for this app.',
  'Use the Turbopack build path via npm run build or npm run build:local-prod.',
  'If Webpack support is required, add explicit webpack(config) aliases matching',
  'the Turbopack resolveAlias entries for @/lib/runtime/build-target,',
  '@viscalyx/developer-mode-core, @viscalyx/developer-mode-react, and expo-sqlite.',
  'Then add a CI-backed next build --webpack check and unit coverage that proves',
  'the Webpack aliases stay in sync.',
].join(' ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  transpilePackages: enableDeveloperMode
    ? ['@viscalyx/developer-mode-core', '@viscalyx/developer-mode-react']
    : [],
  compiler: {
    removeConsole:
      resolvedBuildTarget !== 'dev'
        ? { exclude: ['error', 'warn', 'info'] }
        : false,
  },
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  // TypeORM v1 imports its driver factory eagerly. Keep the package external
  // on the server and alias the unused Expo SQLite dependency below so
  // Turbopack does not require the Expo-only optional package for this SQL
  // Server application.
  serverExternalPackages: ['mermaid', 'typeorm'],
  allowedDevOrigins: ['0.0.0.0', '127.0.0.1'],
  // Next.js 16 production builds use Turbopack for this app. These aliases
  // swap in the right `build-target.*.ts` and developer-mode no-op modules.
  turbopack: {
    resolveAlias: {
      'expo-sqlite': expoSqliteUnavailablePathRelative,
      ...(resolvedBuildTarget !== 'dev'
        ? { '@/lib/runtime/build-target': buildTargetModulePathRelative }
        : {}),
      ...(!enableDeveloperMode
        ? {
            '@viscalyx/developer-mode-core': developerModeCoreNoopPathRelative,
            '@viscalyx/developer-mode-react':
              developerModeReactNoopPathRelative,
          }
        : {}),
    },
  },
  webpack() {
    throw new Error(UNSUPPORTED_WEBPACK_BUILD_MESSAGE)
  },
  // CSP is set per-request in middleware.ts (nonce-based).
  // Only static security headers are defined here.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
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
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            // `credentialless` satisfies ZAP rule 90004 without requiring
            // every embedded resource to advertise CORP (as `require-corp`
            // would). All current sources are same-origin, so the
            // credential-stripping behaviour for any future cross-origin
            // no-cors load has no effect on the app today. Issue #112.
            value: 'credentialless',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
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
