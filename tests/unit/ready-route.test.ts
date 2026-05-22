import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSqlServerDatabaseUrl: vi.fn(),
}))

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: routeState.getAuthConfig,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/typeorm/sqlserver-config', () => ({
  getSqlServerDatabaseUrl: routeState.getSqlServerDatabaseUrl,
}))

import * as route from '@/app/api/ready/route'

function setReadyDefaults() {
  const query = vi.fn().mockResolvedValue([{ ready: 1 }])
  routeState.getAuthConfig.mockReturnValue({
    issuerUrl: 'https://issuer.example.com/realms/test',
  })
  routeState.getSqlServerDatabaseUrl.mockReturnValue(
    'mssql://app:secret@db:1433/kravhantering',
  )
  routeState.getRequestSqlServerDataSource.mockResolvedValue({ query })
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
    expect(query).toHaveBeenCalledWith('SELECT 1 AS ready')
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

  it('returns not_ready when SQL Server read check fails', async () => {
    const { query } = setReadyDefaults()
    query.mockRejectedValue(new Error('database unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await route.GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ status: 'not_ready' })
    expect(body).not.toContain('database unavailable')
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[readiness] check failed',
      expect.objectContaining({ check: 'sql_server' }),
    )
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

    const response = await route.GET()

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

    const response = await route.GET()

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({ status: 'not_ready' })
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
