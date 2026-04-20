import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type TestGlobal = typeof globalThis & {
  __kravhanteringDbCache?: Map<string, unknown>
  __kravhanteringSqlServerDataSourceCache?: Map<string, unknown>
}

function clearDbCache(): void {
  const testGlobal = globalThis as TestGlobal

  for (const db of testGlobal.__kravhanteringDbCache?.values() ?? []) {
    if (
      db &&
      typeof db === 'object' &&
      '$client' in db &&
      db.$client &&
      typeof db.$client === 'object' &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close()
    }
  }

  delete testGlobal.__kravhanteringDbCache
  delete testGlobal.__kravhanteringSqlServerDataSourceCache
}

describe('lib/db', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.useRealTimers()
    clearDbCache()
  })

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
    clearDbCache()
  })

  it('caches local SQLite databases but not remote proxy databases', async () => {
    const { getDb } = await import('@/lib/db')

    const localA = getDb(':memory:')
    const localB = getDb(':memory:')
    expect(localA).toBe(localB)

    const remoteA = getDb('http://127.0.0.1:9000')
    const remoteB = getDb('http://127.0.0.1:9000')
    expect(remoteA).not.toBe(remoteB)
  })

  it('resolves relative file URLs before Node normalizes them', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lib-db-relative-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)

    try {
      const { getDb } = await import('@/lib/db')
      const db = getDb('file:./tmp/dev.sqlite') as unknown as {
        $client: { close(): void; name?: string }
      }

      expect(db.$client.name).toBe(resolve(tempDir, 'tmp/dev.sqlite'))
      db.$client.close()
      clearDbCache()
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('passes an AbortSignal to proxy fetches and rejects when the timeout aborts', async () => {
    vi.useFakeTimers()

    const drizzleMock = vi.fn((executeQuery, executeBatch) => ({
      executeBatch,
      executeQuery,
    }))
    vi.doMock('drizzle-orm/sqlite-proxy', () => ({
      drizzle: drizzleMock,
    }))

    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(_timeoutMs => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 5)
        return controller.signal
      })

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal

      return new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('request aborted'))
          return
        }

        signal?.addEventListener(
          'abort',
          () => reject(new Error('request aborted')),
          { once: true },
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getDb } = await import('@/lib/db')
    const db = getDb('http://127.0.0.1:9000') as unknown as {
      executeQuery(
        sql: string,
        params: unknown[],
        method: 'all' | 'get' | 'run' | 'values',
      ): Promise<unknown>
    }

    const queryPromise = db.executeQuery('select 1', [], 'all')
    const queryExpectation =
      expect(queryPromise).rejects.toThrow('request aborted')
    await vi.advanceTimersByTimeAsync(5)

    await queryExpectation
    expect(timeoutSpy).toHaveBeenCalledWith(10_000)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/query',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('caches initialized SQL Server data sources per connection string', async () => {
    const initialize = vi.fn(async () => undefined)
    const dataSource = {
      initialize,
      isInitialized: false,
    }
    const createAppDataSource = vi.fn(() => dataSource)

    vi.doMock('@/lib/typeorm/data-source', () => ({
      createAppDataSource,
      createReadonlyBrowseDataSource: vi.fn(),
    }))

    const { getSqlServerDataSource } = await import('@/lib/db')

    const first = await getSqlServerDataSource(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering',
    )
    const second = await getSqlServerDataSource(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering',
    )

    expect(first).toBe(second)
    expect(createAppDataSource).toHaveBeenCalledTimes(1)
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it('classifies SQL Server URLs as the TypeORM provider kind', async () => {
    const { getDatabaseProviderKind } = await import('@/lib/db')

    expect(
      getDatabaseProviderKind('mssql://sa:Password123!@127.0.0.1:1433/app'),
    ).toBe('sqlserver-typeorm')
    expect(getDatabaseProviderKind('file:./tmp/dev.sqlite')).toBe(
      'legacy-sqlite',
    )
  })

  it('classifies derived DB_* SQL Server config as the TypeORM provider kind', async () => {
    vi.stubEnv('DB_HOST', 'db')
    vi.stubEnv('DB_NAME', 'kravhantering')
    vi.stubEnv('DB_PORT', '1433')
    vi.stubEnv('DB_TRUST_SERVER_CERTIFICATE', 'true')
    vi.stubEnv('MSSQL_SA_PASSWORD', 'Password123!')

    const { getDatabaseProviderKind } = await import('@/lib/db')

    expect(getDatabaseProviderKind()).toBe('sqlserver-typeorm')
  })

  it('rejects legacy getRequestDatabase calls when DATABASE_URL points at SQL Server', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering',
    )

    const { getRequestDatabase } = await import('@/lib/db')

    await expect(getRequestDatabase()).rejects.toThrow(
      'legacy SQLite/Drizzle path only',
    )
  })

  it('rejects legacy getRequestDatabase calls when DB_* config resolves to SQL Server', async () => {
    vi.stubEnv('DB_HOST', 'db')
    vi.stubEnv('DB_NAME', 'kravhantering')
    vi.stubEnv('DB_PORT', '1433')
    vi.stubEnv('DB_TRUST_SERVER_CERTIFICATE', 'true')
    vi.stubEnv('MSSQL_SA_PASSWORD', 'Password123!')

    const { getRequestDatabase } = await import('@/lib/db')

    await expect(getRequestDatabase()).rejects.toThrow(
      'legacy SQLite/Drizzle path only',
    )
  })

  it('returns the SQL Server data source from getRequestDatabaseConnection when DATABASE_URL uses mssql', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering',
    )

    const initialize = vi.fn(async () => undefined)
    const dataSource = {
      initialize,
      isInitialized: false,
    }
    const createAppDataSource = vi.fn(() => dataSource)

    vi.doMock('@/lib/typeorm/data-source', () => ({
      createAppDataSource,
      createReadonlyBrowseDataSource: vi.fn(),
    }))

    const { getRequestDatabaseConnection } = await import('@/lib/db')

    await expect(getRequestDatabaseConnection()).resolves.toBe(dataSource)
    expect(createAppDataSource).toHaveBeenCalledTimes(1)
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it('returns the SQL Server data source from getRequestDatabaseConnection when only DB_* SQL Server vars are set', async () => {
    vi.stubEnv('DB_HOST', 'db')
    vi.stubEnv('DB_NAME', 'kravhantering')
    vi.stubEnv('DB_PORT', '1433')
    vi.stubEnv('DB_TRUST_SERVER_CERTIFICATE', 'true')
    vi.stubEnv('MSSQL_SA_PASSWORD', 'Password123!')

    const initialize = vi.fn(async () => undefined)
    const dataSource = {
      initialize,
      isInitialized: false,
    }
    const createAppDataSource = vi.fn(() => dataSource)

    vi.doMock('@/lib/typeorm/data-source', () => ({
      createAppDataSource,
      createReadonlyBrowseDataSource: vi.fn(),
    }))

    const { getRequestDatabaseConnection } = await import('@/lib/db')

    await expect(getRequestDatabaseConnection()).resolves.toBe(dataSource)
    expect(createAppDataSource).toHaveBeenCalledTimes(1)
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it('returns the legacy SQLite connection from getRequestDatabaseConnection when DATABASE_URL uses sqlite', async () => {
    const { getDb, getRequestDatabaseConnection } = await import('@/lib/db')

    const expected = getDb(':memory:')

    vi.stubEnv('DATABASE_URL', ':memory:')

    await expect(getRequestDatabaseConnection()).resolves.toBe(expected)
  })
})
