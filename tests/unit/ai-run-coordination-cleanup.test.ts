import { describe, expect, it, vi } from 'vitest'
import {
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
    expect(sql).toContain('[total_deadline_at] <= SYSUTCDATETIME()')
    expect(sql).toContain("[status] = N'running'")
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
})
