import type { NextConfig } from 'next'
import { afterEach, describe, expect, it, vi } from 'vitest'

const DEVELOPER_MODE_PACKAGES = [
  '@viscalyx/developer-mode-core',
  '@viscalyx/developer-mode-react',
]

const NOOP_ALIASES = {
  '@viscalyx/developer-mode-core': './lib/runtime/developer-mode-core-noop.ts',
  '@viscalyx/developer-mode-react':
    './lib/runtime/developer-mode-react-noop.tsx',
}
const EXPO_SQLITE_UNAVAILABLE_ALIAS = './lib/runtime/expo-sqlite-unavailable.ts'

const IGNORED_PRODUCTION_WARNING =
  'ENABLE_DEVELOPER_MODE=true was ignored because NODE_ENV=production. ' +
  'Production builds always alias Developer Mode packages to no-op stubs.'

const ENV_KEYS = ['NODE_ENV', 'BUILD_TARGET', 'ENABLE_DEVELOPER_MODE'] as const
type EnvKey = (typeof ENV_KEYS)[number]

const originalEnv = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
) as Record<EnvKey, string | undefined>

type TurbopackAliases = Record<string, string>

function setEnv(env: Partial<Record<EnvKey, string>>) {
  const mutableEnv = process.env as Record<string, string | undefined>
  for (const key of ENV_KEYS) {
    const value = env[key]
    if (value === undefined) delete mutableEnv[key]
    else mutableEnv[key] = value
  }
}

async function loadNextConfig(
  env: Partial<Record<EnvKey, string>>,
): Promise<NextConfig> {
  vi.resetModules()
  vi.doMock('next-intl/plugin', () => ({
    default: () => (config: NextConfig) => config,
  }))
  setEnv(env)

  const module = (await import('../../next.config')) as {
    default: NextConfig
  }
  return module.default
}

function getTurbopackAliases(config: NextConfig): TurbopackAliases {
  const aliases = config.turbopack?.resolveAlias
  expect(aliases).toBeDefined()
  return aliases as TurbopackAliases
}

function expectWebpackBuildUnsupported(config: NextConfig) {
  expect(config.webpack).toBeTypeOf('function')
  const webpack = config.webpack as () => void
  expect(() => webpack()).toThrowError(
    /Webpack builds are unsupported for this app.*@\/lib\/runtime\/build-target.*next build --webpack/,
  )
}

async function getStaticHeaderKeys(config: NextConfig): Promise<string[]> {
  expect(config.headers).toBeTypeOf('function')
  const routes = await config.headers?.()
  const allHeaders = routes?.flatMap(route => route.headers) ?? []
  return allHeaders.map(header => header.key)
}

async function getBeforeFilesRewrites(config: NextConfig) {
  expect(config.rewrites).toBeTypeOf('function')
  const rewrites = await config.rewrites?.()
  expect(Array.isArray(rewrites)).toBe(false)
  if (Array.isArray(rewrites) || rewrites === undefined) return []
  return rewrites.beforeFiles ?? []
}

afterEach(() => {
  setEnv(originalEnv)
  vi.doUnmock('next-intl/plugin')
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('next.config Developer Mode wiring', () => {
  it('ignores ENABLE_DEVELOPER_MODE in production builds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = await loadNextConfig({
      BUILD_TARGET: 'prod',
      ENABLE_DEVELOPER_MODE: 'true',
      NODE_ENV: 'production',
    })

    expect(config.transpilePackages).toEqual([])
    expect(getTurbopackAliases(config)).toMatchObject(NOOP_ALIASES)
    expect(getTurbopackAliases(config)).toMatchObject({
      '@/lib/runtime/build-target': './lib/runtime/build-target.prod.ts',
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(IGNORED_PRODUCTION_WARNING)
  })

  it('keeps Developer Mode automatic in development builds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = await loadNextConfig({
      NODE_ENV: 'development',
    })

    expect(config.transpilePackages).toEqual(DEVELOPER_MODE_PACKAGES)
    expect(getTurbopackAliases(config)).not.toHaveProperty(
      '@viscalyx/developer-mode-core',
    )
    expect(getTurbopackAliases(config)).not.toHaveProperty(
      '@viscalyx/developer-mode-react',
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps Developer Mode disabled for any production build target', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = await loadNextConfig({
      BUILD_TARGET: 'dev',
      NODE_ENV: 'production',
    })

    expect(config.transpilePackages).toEqual([])
    expect(getTurbopackAliases(config)).toMatchObject(NOOP_ALIASES)
    expect(warn).not.toHaveBeenCalled()
  })

  it('allows explicit Developer Mode only outside production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = await loadNextConfig({
      BUILD_TARGET: 'local-prod',
      ENABLE_DEVELOPER_MODE: 'true',
      NODE_ENV: 'test',
    })

    expect(config.transpilePackages).toEqual(DEVELOPER_MODE_PACKAGES)
    expect(getTurbopackAliases(config)).not.toHaveProperty(
      '@viscalyx/developer-mode-core',
    )
    expect(getTurbopackAliases(config)).not.toHaveProperty(
      '@viscalyx/developer-mode-react',
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('rejects Webpack builds with alias restoration guidance', async () => {
    const config = await loadNextConfig({
      BUILD_TARGET: 'prod',
      NODE_ENV: 'production',
    })

    expectWebpackBuildUnsupported(config)
  })
})

describe('next.config console pruning', () => {
  it('preserves structured production log levels in built targets', async () => {
    const config = await loadNextConfig({
      BUILD_TARGET: 'local-prod',
      NODE_ENV: 'production',
    })

    expect(config.compiler?.removeConsole).toEqual({
      exclude: ['error', 'warn', 'info'],
    })
  })

  it('keeps development console output untouched', async () => {
    const config = await loadNextConfig({
      NODE_ENV: 'development',
    })

    expect(config.compiler?.removeConsole).toBe(false)
  })
})

describe('next.config container output', () => {
  it('emits a standalone server bundle for production images', async () => {
    const config = await loadNextConfig({
      BUILD_TARGET: 'prod',
      NODE_ENV: 'production',
    })

    expect(config.output).toBe('standalone')
  })
})

describe('next.config stewardship workspace routing', () => {
  it('maps each public tab URL to an isolated internal route', async () => {
    const config = await loadNextConfig({
      NODE_ENV: 'development',
    })

    const rewrites = (await getBeforeFilesRewrites(config)).filter(
      rewrite => rewrite.source === '/:locale/requirements/stewardship',
    )

    expect(rewrites).toEqual([
      {
        destination: '/:locale/requirements/stewardship/workspaces/packages',
        has: [{ key: 'tab', type: 'query', value: 'packages' }],
        source: '/:locale/requirements/stewardship',
      },
      {
        destination: '/:locale/requirements/stewardship/workspaces/questions',
        has: [{ key: 'tab', type: 'query', value: 'questions' }],
        source: '/:locale/requirements/stewardship',
      },
      {
        destination:
          '/:locale/requirements/stewardship/workspaces/information-requests',
        has: [{ key: 'tab', type: 'query', value: 'information-requests' }],
        source: '/:locale/requirements/stewardship',
      },
      {
        destination: '/:locale/requirements/stewardship/workspaces/norms',
        has: [{ key: 'tab', type: 'query', value: 'norms' }],
        source: '/:locale/requirements/stewardship',
      },
    ])
  })
})

describe('next.config Admin workspace routing', () => {
  it('maps every public tab and the default URL to isolated internal routes', async () => {
    const config = await loadNextConfig({
      NODE_ENV: 'development',
    })

    const rewrites = (await getBeforeFilesRewrites(config)).filter(
      rewrite => rewrite.source === '/:locale/admin',
    )

    expect(rewrites).toEqual([
      {
        destination: '/:locale/admin/workspaces/columns',
        has: [{ key: 'tab', type: 'query', value: 'columns' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/identity',
        has: [{ key: 'tab', type: 'query', value: 'identity' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/settings',
        has: [{ key: 'tab', type: 'query', value: 'settings' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/taxonomy',
        has: [{ key: 'tab', type: 'query', value: 'taxonomy' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/statuses-and-workflows',
        has: [
          {
            key: 'tab',
            type: 'query',
            value: 'statusesAndWorkflows',
          },
        ],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/access-review',
        has: [{ key: 'tab', type: 'query', value: 'accessReview' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/archiving',
        has: [{ key: 'tab', type: 'query', value: 'archiving' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/privacy',
        has: [{ key: 'tab', type: 'query', value: 'privacy' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/action-audit-log',
        has: [{ key: 'tab', type: 'query', value: 'actionAuditLog' }],
        source: '/:locale/admin',
      },
      {
        destination: '/:locale/admin/workspaces/columns',
        missing: [{ key: 'tab', type: 'query' }],
        source: '/:locale/admin',
      },
    ])
  })
})

describe('next.config static security headers', () => {
  it('keeps X-Frame-Options as a static fallback while CSP stays nonce-based', async () => {
    const config = await loadNextConfig({
      BUILD_TARGET: 'prod',
      NODE_ENV: 'production',
    })

    const headerKeys = await getStaticHeaderKeys(config)

    expect(headerKeys).toContain('X-Frame-Options')
    expect(headerKeys).not.toContain('Content-Security-Policy')
  })
})

describe('next.config TypeORM bundling', () => {
  it('keeps TypeORM and the SQL Server driver external to the server bundle', async () => {
    const config = await loadNextConfig({
      BUILD_TARGET: 'prod',
      NODE_ENV: 'production',
    })

    expect(config.serverExternalPackages).toEqual(
      expect.arrayContaining(['mssql', 'typeorm']),
    )
  })

  it('aliases expo-sqlite to a local unavailable stub for Turbopack', async () => {
    const config = await loadNextConfig({
      BUILD_TARGET: 'prod',
      NODE_ENV: 'production',
    })

    expect(getTurbopackAliases(config)).toMatchObject({
      'expo-sqlite': EXPO_SQLITE_UNAVAILABLE_ALIAS,
    })
  })
})
