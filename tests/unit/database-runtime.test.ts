import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getReadonlySqlServerDataSource,
  getRequestSqlServerDataSource,
  getSqlServerDataSource,
  isSqlServerDatabaseUrl,
} from '@/lib/db'
import {
  createAppDataSource,
  createReadonlyBrowseDataSource,
} from '@/lib/typeorm/data-source'
import {
  toBoolean,
  toIsoString,
  toNullableIsoString,
} from '@/lib/typeorm/value-mappers'

declare global {
  var __kravhanteringSqlServerDataSourceCache:
    | Map<string, Promise<DataSource>>
    | undefined
}

const WRITE_URL = 'mssql://app:secret@db.example:1433/kravhantering'
const READONLY_URL = 'mssql://reader:secret@db.example:1433/kravhantering'
const originalDatabaseUrl = process.env.DATABASE_URL

describe('SQL Server database runtime', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = WRITE_URL
    globalThis.__kravhanteringSqlServerDataSourceCache = new Map()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.__kravhanteringSqlServerDataSourceCache
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
  })

  it('recognizes only the supported SQL Server URL schemes', () => {
    expect(isSqlServerDatabaseUrl(WRITE_URL)).toBe(true)
    expect(isSqlServerDatabaseUrl('sqlserver://app:secret@db/app')).toBe(true)
    expect(isSqlServerDatabaseUrl('postgres://app:secret@db/app')).toBe(false)
  })

  it('rejects missing and unsupported connection strings before connecting', async () => {
    await expect(getSqlServerDataSource('  ')).rejects.toThrow(
      /No SQL Server connection string is configured/,
    )
    await expect(
      getReadonlySqlServerDataSource('postgres://reader:secret@db/app'),
    ).rejects.toThrow(/requires a SQL Server URL/)
  })

  it('initializes a write data source once and reuses it by URL', async () => {
    const initialize = vi
      .spyOn(DataSource.prototype, 'initialize')
      .mockImplementation(async function (this: DataSource) {
        return this
      })

    const first = await getSqlServerDataSource(WRITE_URL)
    const second = await getSqlServerDataSource(`  ${WRITE_URL}  `)

    expect(first).toBe(second)
    expect(first.options).toMatchObject({
      entities: expect.any(Array),
      synchronize: false,
      type: 'mssql',
      url: WRITE_URL,
    })
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it('uses separate read-only and request data-source contracts', async () => {
    vi.spyOn(DataSource.prototype, 'initialize').mockImplementation(
      async function (this: DataSource) {
        return this
      },
    )

    const readonly = await getReadonlySqlServerDataSource(READONLY_URL)
    const request = await getRequestSqlServerDataSource()

    expect(readonly.options).toMatchObject({ type: 'mssql', url: READONLY_URL })
    expect(request.options).toMatchObject({ type: 'mssql', url: WRITE_URL })
    expect(readonly).not.toBe(request)
  })

  it('evicts a failed initialization so the next request can retry', async () => {
    const initialize = vi
      .spyOn(DataSource.prototype, 'initialize')
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockImplementationOnce(async function (this: DataSource) {
        return this
      })

    await expect(getSqlServerDataSource(WRITE_URL)).rejects.toThrow(
      'database unavailable',
    )
    await expect(getSqlServerDataSource(WRITE_URL)).resolves.toBeInstanceOf(
      DataSource,
    )
    expect(initialize).toHaveBeenCalledTimes(2)
  })

  it('preserves initialized sources and exposes explicit read-only factories', async () => {
    const write = createAppDataSource({ url: WRITE_URL })
    Object.defineProperty(write, 'isInitialized', { value: true })
    globalThis.__kravhanteringSqlServerDataSourceCache?.set(
      `main:${WRITE_URL}`,
      Promise.resolve(write),
    )
    const initialize = vi.spyOn(DataSource.prototype, 'initialize')

    await expect(getSqlServerDataSource(WRITE_URL)).resolves.toBe(write)
    expect(initialize).not.toHaveBeenCalled()

    const readonly = createReadonlyBrowseDataSource({ url: READONLY_URL })
    expect(readonly.options).toMatchObject({
      entities: expect.any(Array),
      type: 'mssql',
      url: READONLY_URL,
    })
  })
})

describe('SQL Server value mapping', () => {
  it('serializes dates while preserving database strings and nullability', () => {
    const date = new Date('2026-08-05T12:34:56.000Z')

    expect(toIsoString(date)).toBe('2026-08-05T12:34:56.000Z')
    expect(toIsoString('2026-08-05')).toBe('2026-08-05')
    expect(toNullableIsoString(date)).toBe('2026-08-05T12:34:56.000Z')
    expect(toNullableIsoString(null)).toBeNull()
    expect(toNullableIsoString(undefined)).toBeNull()
  })

  it('maps only SQL Server truth values to true', () => {
    expect([true, 1, '1'].map(toBoolean)).toEqual([true, true, true])
    expect([false, 0, '0', 'true'].map(toBoolean)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })
})
