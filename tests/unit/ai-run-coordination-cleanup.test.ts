import { describe, expect, it, vi } from 'vitest'
import {
  createAiRunCoordinationCleanupTarget,
  inspectExpiredAiRunCoordinationEntries,
  purgeExpiredAiRunCoordinationEntries,
} from '@/lib/transient-cleanup/ai-run-coordination-entries'

describe('AI run coordination cleanup', () => {
  it('inspects only expired deadlines and abandoned running leases', async () => {
    const query = vi.fn()
    query.mockResolvedValueOnce([
      {
        expiredRowCount: '2',
        expiredStoredBytes: '512',
        oldestExpiredAgeMs: '60000',
      },
    ])

    await expect(
      inspectExpiredAiRunCoordinationEntries({ query }),
    ).resolves.toEqual({
      expiredRowCount: 2,
      expiredStoredBytes: 512,
      oldestExpiredAgeMs: 60_000,
    })
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain(
      "([status] <> N'running' AND [total_deadline_at] <= SYSUTCDATETIME())",
    )
    expect(sql).toContain(
      "([status] = N'running' AND [lease_expires_at] <= SYSUTCDATETIME())",
    )
    expect(sql).not.toMatch(/prompt|image|model_output|result|content/u)
  })

  it('purges a bounded skip-locked batch in stable order', async () => {
    const query = vi.fn()
    query.mockResolvedValueOnce([{ deletedRows: '3' }])

    await expect(
      purgeExpiredAiRunCoordinationEntries({ query }, 900),
    ).resolves.toEqual({ deletedRows: 3 })
    expect(query.mock.calls[0]?.[1]).toEqual([500])
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('UPDLOCK, READPAST, ROWLOCK')
    expect(sql).toContain('ORDER BY [total_deadline_at], [queue_sequence]')
  })

  it('creates a complete cleanup target and normalizes invalid counters', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          expiredRowCount: '-1',
          expiredStoredBytes: 'invalid',
          oldestExpiredAgeMs: null,
        },
      ])
      .mockResolvedValueOnce([])
    const target = createAiRunCoordinationCleanupTarget({ query })

    expect(target.kind).toBe('ai_run_coordination_entries')
    await expect(target.inspect()).resolves.toEqual({
      expiredRowCount: 0,
      expiredStoredBytes: 0,
      oldestExpiredAgeMs: null,
    })
    await expect(target.purgeBatch(0)).resolves.toEqual({ deletedRows: 0 })
    expect(query.mock.calls[1]?.[1]).toEqual([1])
  })

  it('uses zero defaults when cleanup queries return no counters', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await expect(
      inspectExpiredAiRunCoordinationEntries({ query }),
    ).resolves.toEqual({
      expiredRowCount: 0,
      expiredStoredBytes: 0,
      oldestExpiredAgeMs: null,
    })
    await expect(
      purgeExpiredAiRunCoordinationEntries({ query }),
    ).resolves.toEqual({ deletedRows: 0 })
  })
})
