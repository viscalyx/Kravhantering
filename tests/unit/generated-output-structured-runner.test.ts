import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { generatedOutputCapacitySnapshot } from '@/lib/generated-output/spool'
import { runBoundedStructuredOutput } from '@/lib/generated-output/structured-runner'
import type { RequestContext } from '@/lib/requirements/auth'

const mocks = vi.hoisted(() => ({ settings: vi.fn() }))
vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: mocks.settings,
}))
vi.mock('@/lib/generated-output/actor-quota', async () => ({
  runWithExportActorQuota: (
    await import('@/lib/__tests__/generated-output-admission')
  ).allowGeneratedOutput,
}))
const context = {
  actor: { hsaId: 'person', isAuthenticated: true },
  source: 'rest',
} as RequestContext
const db = { query: vi.fn() } as unknown as SqlServerDatabase

describe('bounded structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settings.mockResolvedValue({
      ...DEFAULT_APPLICATION_SETTINGS,
      csvExportMaxItems: 2,
    })
  })
  afterEach(() => {
    expect(generatedOutputCapacitySnapshot()).toEqual({
      activeCsv: 0,
      activePdf: 0,
      reservedBytes: 0,
    })
  })
  it('serializes nested JSON and streams with caller headers and no-store', async () => {
    const response = await runBoundedStructuredOutput({
      db,
      context,
      output: 'json',
      headers: { 'Content-Disposition': 'attachment' },
      collect: async () => ({
        text: 'å"',
        nested: [1, undefined, { flag: true }],
        date: new Date('2026-09-07T00:00:00Z'),
        omitted: undefined,
      }),
    })
    expect(response.headers.get('Content-Type')).toBe(
      'application/json;charset=utf-8',
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Disposition')).toBe('attachment')
    expect(await response.json()).toEqual({
      text: 'å"',
      nested: [1, null, { flag: true }],
      date: '2026-09-07T00:00:00.000Z',
    })
  })
  it('writes CSV with its UTF-8 byte order mark', async () => {
    const response = await runBoundedStructuredOutput({
      db,
      context,
      output: 'csv',
      collect: async () => 'name\nå',
    })
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191])
    expect(new TextDecoder().decode(bytes)).toBe('name\nå')
  })
  it('binds the shared remaining row budget while preserving an existing smaller TOP', async () => {
    vi.mocked(db.query).mockResolvedValue([{ id: 1 }])
    const response = await runBoundedStructuredOutput({
      db,
      context,
      output: 'json',
      collect: async ({ query }) => ({
        first: await query('SELECT TOP (1) id FROM example WHERE id = @0', [1]),
        second: await query('SELECT id FROM example'),
      }),
    })
    await response.json()
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      'SELECT TOP (@1) id FROM example WHERE id = @0',
      [1, 1],
    )
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      'SELECT TOP (@0) id FROM example',
      [2],
    )
  })
  it('rejects oversized collection results and releases spool resources', async () => {
    vi.mocked(db.query).mockResolvedValue([1, 2, 3])
    await expect(
      runBoundedStructuredOutput({
        db,
        context,
        output: 'json',
        collect: async ({ query }) => query('SELECT id FROM example'),
      }),
    ).rejects.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 2, limitKind: 'items' },
    })
  })

  it('keeps transaction reads bounded and releases the transaction before returning output', async () => {
    const transactionQuery = vi.fn().mockResolvedValue([{ id: 1 }])
    const transaction = vi.fn(async (_isolation, collect) =>
      collect({ query: transactionQuery }),
    )
    const response = await runBoundedStructuredOutput({
      db: { ...db, transaction } as unknown as SqlServerDatabase,
      context,
      output: 'json',
      collect: ({ transaction: read }) =>
        read('SERIALIZABLE', async tx => tx.query('SELECT id FROM example')),
    })
    expect(await response.json()).toEqual([{ id: 1 }])
    expect(transactionQuery).toHaveBeenCalledWith(
      'SELECT TOP (@0) id FROM example',
      [3],
    )
    expect(db.query).not.toHaveBeenCalled()
    transactionQuery.mockResolvedValue([1, 2, 3])
    await expect(
      runBoundedStructuredOutput({
        db: { ...db, transaction } as unknown as SqlServerDatabase,
        context,
        output: 'json',
        collect: ({ transaction: read }) =>
          read('SERIALIZABLE', async tx => tx.query('SELECT id FROM example')),
      }),
    ).rejects.toMatchObject({ code: 'output_limit_exceeded' })
  })
  it('rejects mutating statements before execution', async () => {
    await expect(
      runBoundedStructuredOutput({
        db,
        context,
        output: 'json',
        collect: async ({ query }) => query('DELETE FROM example'),
      }),
    ).rejects.toThrow('requires a SELECT query')
    expect(db.query).not.toHaveBeenCalled()
  })
  it('stops queued queries after a failure and waits for the active query before cleanup', async () => {
    let rejectQuery!: (error: Error) => void
    const started = Promise.withResolvers<void>()
    vi.mocked(db.query).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectQuery = reject
          started.resolve()
        }),
    )
    const pending = runBoundedStructuredOutput({
      db,
      context,
      output: 'json',
      collect: async ({ query }) =>
        Promise.all([
          query('SELECT id FROM first'),
          query('SELECT id FROM second'),
        ]),
    })
    await started.promise
    expect(generatedOutputCapacitySnapshot().activeCsv).toBe(1)
    const rejected = expect(pending).rejects.toThrow('query failed')
    rejectQuery(new Error('query failed'))
    await rejected
    expect(db.query).toHaveBeenCalledTimes(1)
  })
  it('enforces the output byte bound and cleans a partial spool', async () => {
    mocks.settings.mockResolvedValue({
      ...DEFAULT_APPLICATION_SETTINGS,
      csvExportMaxFileBytes: 3,
    })
    await expect(
      runBoundedStructuredOutput({
        db,
        context,
        output: 'json',
        collect: async () => 'too large',
      }),
    ).rejects.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limitKind: 'bytes' },
    })
  })
})
