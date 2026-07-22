import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSqlServerDatabaseUrl: vi.fn(),
  probeGeneratedOutputTempDirectory: vi.fn(),
  readBuildMetadata: vi.fn(),
}))

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: routeState.getAuthConfig,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/build-metadata', () => ({
  readBuildMetadata: routeState.readBuildMetadata,
}))

vi.mock('@/lib/typeorm/sqlserver-config', () => ({
  getSqlServerDatabaseUrl: routeState.getSqlServerDatabaseUrl,
}))

vi.mock('@/lib/generated-output/spool', () => ({
  probeGeneratedOutputTempDirectory:
    routeState.probeGeneratedOutputTempDirectory,
}))

import * as route from '@/app/api/ready/route'

function setReadyDefaults() {
  const query = vi.fn(
    async (sql: string): Promise<Array<Record<string, unknown>>> => {
      if (sql === 'SELECT 1 AS ready') return [{ ready: 1 }]
      return [{ name: 'InitialSchema1713720000000' }]
    },
  )
  routeState.getAuthConfig.mockReturnValue({
    issuerUrl: 'https://issuer.example.com/realms/test',
  })
  routeState.readBuildMetadata.mockReturnValue({
    builtAt: '2026-05-21T19:00:00.000Z',
    commitSha: 'abc123',
    expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
    imageTag: 'registry.example/app:1.2.3',
    version: '1.2.3',
  })
  routeState.getSqlServerDatabaseUrl.mockReturnValue(
    'mssql://app:secret@db:1433/kravhantering',
  )
  routeState.getRequestSqlServerDataSource.mockResolvedValue({ query })
  routeState.probeGeneratedOutputTempDirectory.mockResolvedValue(undefined)
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.example.com')
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ issuer: 'https://issuer.example.com/realms/test' }),
          { status: 200 },
        ),
      ),
  )
  return { query }
}

async function readJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>
}

describe('GET /api/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns ready when runtime config, SQL Server, and OIDC discovery pass', async () => {
    const { query } = setReadyDefaults()

    const response = await route.GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await readJson(response)).toEqual({ status: 'ready' })
    expect(query).toHaveBeenNthCalledWith(1, 'SELECT 1 AS ready')
    expect(query.mock.calls[1]?.[0]).toContain('FROM [dbo].[migrations]')
    expect(fetch).toHaveBeenCalledWith(
      'https://issuer.example.com/realms/test/.well-known/openid-configuration',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
    )
  })

  it('returns not_ready without leaking details when runtime config is missing', async () => {
    setReadyDefaults()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({
      failedChecks: [
        {
          name: 'runtime_config',
          reason: 'runtime_config_invalid',
        },
      ],
      status: 'not_ready',
    })
    expect(body).not.toContain('NEXT_PUBLIC_SITE_URL')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'runtime_config' }),
    )
    warn.mockRestore()
  })

  it('returns not_ready when SQL Server read check fails', async () => {
    const { query } = setReadyDefaults()
    query.mockRejectedValue(new Error('database unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({
      failedChecks: [
        {
          name: 'sql_server',
          reason: 'sql_server_unavailable',
        },
      ],
      status: 'not_ready',
    })
    expect(body).not.toContain('database unavailable')
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'sql_server' }),
    )
    warn.mockRestore()
  })

  it('identifies a missing SQL Server driver in logs without exposing it publicly', async () => {
    setReadyDefaults()
    const error = new Error(
      'SQL Server package has not been found installed. Please run "npm install mssql".',
    )
    error.name = 'DriverPackageNotInstalledError'
    routeState.getRequestSqlServerDataSource.mockRejectedValueOnce(error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({
      failedChecks: [
        {
          name: 'sql_server',
          reason: 'sql_server_unavailable',
        },
      ],
      status: 'not_ready',
    })
    expect(body).not.toContain('mssql')
    expect(warn).toHaveBeenCalledWith('[readiness] check failed', {
      check: 'sql_server',
      diagnostic: 'sql_server_driver_unavailable',
      error: 'DriverPackageNotInstalledError',
      reason: 'sql_server_unavailable',
    })
    warn.mockRestore()
  })

  it('returns a sanitized temporary-storage readiness failure', async () => {
    setReadyDefaults()
    routeState.probeGeneratedOutputTempDirectory.mockRejectedValueOnce(
      new Error('/private/spool is read only'),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({
      failedChecks: [
        {
          name: 'temporary_storage',
          reason: 'temporary_storage_unavailable',
        },
      ],
      status: 'not_ready',
    })
    expect(body).not.toContain('/private/spool')
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'temporary_storage' }),
    )
    warn.mockRestore()
  })

  it('returns not_ready when the database has no migration head', async () => {
    const { query } = setReadyDefaults()
    query.mockImplementation(async (sql: string) => {
      if (sql === 'SELECT 1 AS ready') return [{ ready: 1 }]
      return [{ name: null }]
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({
      failedChecks: [
        {
          name: 'database_migration_compatibility',
          reason: 'database_schema_version_missing',
        },
      ],
      status: 'not_ready',
    })
    expect(body).not.toContain('InitialSchema1713720000000')
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({
        check: 'database_migration_compatibility',
        reason: 'database_schema_version_missing',
      }),
    )
    warn.mockRestore()
  })

  it('returns not_ready when the database schema version differs from build metadata', async () => {
    const { query } = setReadyDefaults()
    query.mockImplementation(async (sql: string) => {
      if (sql === 'SELECT 1 AS ready') return [{ ready: 1 }]
      return [{ name: 'OlderSchema1713000000000' }]
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({
      failedChecks: [
        {
          name: 'database_migration_compatibility',
          reason: 'database_schema_version_mismatch',
        },
      ],
      status: 'not_ready',
    })
    expect(body).not.toContain('OlderSchema1713000000000')
    expect(body).not.toContain('InitialSchema1713720000000')
    expect(fetch).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns not_ready when OIDC discovery returns non-OK', async () => {
    setReadyDefaults()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 500 })),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({
      failedChecks: [
        {
          name: 'oidc_discovery',
          reason: 'oidc_discovery_unavailable',
        },
      ],
      status: 'not_ready',
    })
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'oidc_discovery' }),
    )
    warn.mockRestore()
  })

  it('returns not_ready when OIDC discovery JSON is invalid', async () => {
    setReadyDefaults()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({
      failedChecks: [
        {
          name: 'oidc_discovery',
          reason: 'oidc_discovery_unavailable',
        },
      ],
      status: 'not_ready',
    })
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'oidc_discovery' }),
    )
    warn.mockRestore()
  })

  it('returns not_ready when OIDC discovery times out', async () => {
    setReadyDefaults()
    const timeout = new Error('timeout')
    timeout.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({
      failedChecks: [
        {
          name: 'oidc_discovery',
          reason: 'oidc_discovery_unavailable',
        },
      ],
      status: 'not_ready',
    })
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({
        check: 'oidc_discovery',
        error: 'TimeoutError',
      }),
    )
    warn.mockRestore()
  })

  it('does not expose POST handler', () => {
    expect((route as { POST?: unknown }).POST).toBeUndefined()
  })
})
