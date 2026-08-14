import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  getMcpAuthConfig: vi.fn(),
  getHsaPersonLookupConfig: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSqlServerDatabaseUrl: vi.fn(),
  hsaPersonLookupConfigDiagnostic: vi.fn(),
  probeGeneratedOutputTempDirectory: vi.fn(),
  readBuildMetadata: vi.fn(),
}))

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: routeState.getAuthConfig,
  getMcpAuthConfig: routeState.getMcpAuthConfig,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/hsa/person-lookup', () => ({
  getHsaPersonLookupConfig: routeState.getHsaPersonLookupConfig,
  hsaPersonLookupConfigDiagnostic: routeState.hsaPersonLookupConfigDiagnostic,
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

const request = (init?: RequestInit) =>
  new Request('http://localhost/api/ready', init)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

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
  routeState.getMcpAuthConfig.mockReturnValue(null)
  routeState.getHsaPersonLookupConfig.mockReturnValue(null)
  routeState.hsaPersonLookupConfigDiagnostic.mockReturnValue(null)
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
    vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            issuer: 'https://issuer.example.com/realms/test',
          }),
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
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    route.__resetReadinessStateForTests()
  })

  it('returns ready when runtime config, SQL Server, and OIDC discovery pass', async () => {
    const { query } = setReadyDefaults()

    const response = await route.GET(request())

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

    const response = await route.GET(
      request({
        headers: {
          'X-Correlation-Id': 'readiness-correlation',
          'X-Request-Id': 'readiness-request',
        },
      }),
    )
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
    expect(body).not.toContain('NEXT_PUBLIC_SITE_URL')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'runtime_config' }),
    )
    warn.mockRestore()
  })

  it('fails readiness for invalid enabled MCP configuration before database work', async () => {
    setReadyDefaults()
    routeState.getMcpAuthConfig.mockImplementation(() => {
      throw new Error('AUTH_MCP_REQUIRED_SCOPES contains private detail')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET(request())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
    expect(body).not.toMatch(/AUTH_MCP|required|private/i)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'runtime_config' }),
    )
  })

  it('preserves readiness for valid enabled MCP configuration', async () => {
    setReadyDefaults()
    routeState.getMcpAuthConfig.mockReturnValue({
      clientId: 'kravhantering-mcp',
      requiredScopes: ['kravhantering:mcp'],
      rolesClaim: 'roles',
      tokenMaxAgeSeconds: 300,
    })

    const response = await route.GET(request())

    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ status: 'ready' })
  })

  it('returns not_ready for invalid optional HSA configuration without making a network call', async () => {
    setReadyDefaults()
    const configError = new Error(
      'HSA_PERSON_LOOKUP_URL=https://private.example contains a private endpoint',
    )
    routeState.getHsaPersonLookupConfig.mockImplementation(() => {
      throw configError
    })
    routeState.hsaPersonLookupConfigDiagnostic.mockReturnValue(
      'hsa_lookup_url_https_required',
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET(request())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
    expect(body).not.toContain('HSA_PERSON_LOOKUP_URL')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({
        check: 'runtime_config',
        diagnostic: 'hsa_lookup_url_https_required',
      }),
    )
    expect(routeState.hsaPersonLookupConfigDiagnostic).toHaveBeenCalledWith(
      configError,
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private.example')
    warn.mockRestore()
  })

  it('returns not_ready when SQL Server read check fails', async () => {
    const { query } = setReadyDefaults()
    query.mockRejectedValue(new Error('database unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET(
      request({
        headers: {
          'X-Correlation-Id': 'readiness-correlation',
          'X-Request-Id': 'readiness-request',
        },
      }),
    )
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
    expect(body).not.toContain('database unavailable')
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[readiness] check failed', {
      check: 'sql_server',
      correlation_id: 'readiness-correlation',
      diagnostic: 'check_failed',
      reason: 'sql_server_unavailable',
      request_id: 'readiness-request',
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      'database unavailable',
    )
    warn.mockRestore()
  })

  it('redacts URL-shaped correlation metadata from readiness warnings', async () => {
    const { query } = setReadyDefaults()
    query.mockRejectedValue(new Error('database unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await route.GET(
      request({
        headers: {
          'X-Correlation-Id': 'https://secret.example/private',
          'X-Request-Id': 'https://secret.example/request',
        },
      }),
    )

    expect(warn).toHaveBeenCalledWith('[readiness] check failed', {
      check: 'sql_server',
      correlation_id: 'redacted',
      diagnostic: 'check_failed',
      reason: 'sql_server_unavailable',
      request_id: 'redacted',
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret.example')
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

    const response = await route.GET(request())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
    expect(body).not.toContain('mssql')
    expect(warn).toHaveBeenCalledWith('[readiness] check failed', {
      check: 'sql_server',
      correlation_id: expect.any(String),
      diagnostic: 'sql_server_driver_unavailable',
      reason: 'sql_server_unavailable',
      request_id: expect.any(String),
    })
    warn.mockRestore()
  })

  it('returns a sanitized temporary-storage readiness failure', async () => {
    setReadyDefaults()
    routeState.probeGeneratedOutputTempDirectory.mockRejectedValueOnce(
      new Error('/private/spool is read only'),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET(request())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
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

    const response = await route.GET(request())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
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

    const response = await route.GET(request())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
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

    const response = await route.GET(request())

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({ status: 'not_ready' })
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

    const response = await route.GET(request())

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({ status: 'not_ready' })
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

    const response = await route.GET(request())

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({ status: 'not_ready' })
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({
        check: 'oidc_discovery',
        diagnostic: 'check_failed',
      }),
    )
    warn.mockRestore()
  })

  it('coalesces concurrent route requests into one complete evaluation', async () => {
    const { query } = setReadyDefaults()
    const databaseGate = deferred<void>()
    routeState.getRequestSqlServerDataSource.mockImplementation(async () => {
      await databaseGate.promise
      return { query }
    })

    const first = route.GET(request())
    const joined = route.GET(request())
    await vi.waitFor(() => {
      expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledOnce()
    })

    databaseGate.resolve()

    await expect(first.then(readJson)).resolves.toEqual({ status: 'ready' })
    await expect(joined.then(readJson)).resolves.toEqual({ status: 'ready' })
    expect(query).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('caches successful and failed results for five seconds from completion', async () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    setReadyDefaults()

    await expect(route.GET(request()).then(readJson)).resolves.toEqual({
      status: 'ready',
    })
    now = 5_099
    await expect(route.GET(request()).then(readJson)).resolves.toEqual({
      status: 'ready',
    })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(2)

    now = 5_100
    await expect(route.GET(request()).then(readJson)).resolves.toEqual({
      status: 'ready',
    })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(4)

    route.__resetReadinessStateForTests()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    routeState.getRequestSqlServerDataSource.mockRejectedValueOnce(
      new Error('database secret'),
    )
    await expect(route.GET(request()).then(readJson)).resolves.toEqual({
      status: 'not_ready',
    })
    routeState.getRequestSqlServerDataSource.mockResolvedValue({
      query: vi.fn(),
    })
    await expect(route.GET(request()).then(readJson)).resolves.toEqual({
      status: 'not_ready',
    })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('keeps shared evaluation running when the initiating caller disconnects', async () => {
    const { query } = setReadyDefaults()
    const databaseGate = deferred<void>()
    routeState.getRequestSqlServerDataSource.mockImplementation(async () => {
      await databaseGate.promise
      return { query }
    })
    const controller = new AbortController()

    const first = route.GET(request({ signal: controller.signal }))
    controller.abort()
    const joined = route.GET(request())
    databaseGate.resolve()

    await expect(first.then(readJson)).resolves.toEqual({ status: 'ready' })
    await expect(joined.then(readJson)).resolves.toEqual({ status: 'ready' })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(2)
  })

  it('does not expose POST handler', () => {
    expect((route as { POST?: unknown }).POST).toBeUndefined()
  })
})
