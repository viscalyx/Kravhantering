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

const IGNORED_PRODUCTION_WARNING =
  'ENABLE_DEVELOPER_MODE=true was ignored because NODE_ENV=production. ' +
  'Production builds always alias Developer Mode packages to no-op stubs.'

const ENV_KEYS = ['NODE_ENV', 'BUILD_TARGET', 'ENABLE_DEVELOPER_MODE'] as const
type EnvKey = (typeof ENV_KEYS)[number]

const originalEnv = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
) as Record<EnvKey, string | undefined>

type TurbopackAliases = Record<string, string>
type WebpackConfig = {
  resolve: {
    alias: Record<string, string>
  }
}
type WebpackHook = (config: WebpackConfig, context: unknown) => WebpackConfig

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

function getWebpackAliases(config: NextConfig): Record<string, string> {
  expect(config.webpack).toBeTypeOf('function')
  const webpackConfig: WebpackConfig = { resolve: { alias: {} } }
  const result = (config.webpack as WebpackHook)(webpackConfig, {})
  return result.resolve.alias
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
    expect(getWebpackAliases(config)).toMatchObject({
      '@viscalyx/developer-mode-core': expect.stringMatching(
        /lib\/runtime\/developer-mode-core-noop\.ts$/,
      ),
      '@viscalyx/developer-mode-react': expect.stringMatching(
        /lib\/runtime\/developer-mode-react-noop\.tsx$/,
      ),
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
    expect(getWebpackAliases(config)).toMatchObject({
      '@viscalyx/developer-mode-core': expect.stringMatching(
        /lib\/runtime\/developer-mode-core-noop\.ts$/,
      ),
      '@viscalyx/developer-mode-react': expect.stringMatching(
        /lib\/runtime\/developer-mode-react-noop\.tsx$/,
      ),
    })
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
})
