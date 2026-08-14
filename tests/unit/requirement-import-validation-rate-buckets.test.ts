import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransientCleanupTargets } from '@/lib/transient-cleanup/registry'
import {
  createRequirementImportValidationRateBucketCleanupTarget,
  inspectExpiredRequirementImportValidationRateBuckets,
  purgeExpiredRequirementImportValidationRateBuckets,
} from '@/lib/transient-cleanup/requirement-import-validation-rate-buckets'

describe('MCP import-validation rate-bucket cleanup', () => {
  const query = vi.fn()
  const db = { query }

  beforeEach(() => vi.clearAllMocks())

  it('reports aggregate expiry telemetry without principal fingerprints', async () => {
    query.mockResolvedValueOnce([
      {
        expiredRowCount: '3',
        expiredStoredBytes: '768',
        oldestExpiredAgeMs: '60000',
      },
    ])

    await expect(
      inspectExpiredRequirementImportValidationRateBuckets(db),
    ).resolves.toEqual({
      expiredRowCount: 3,
      expiredStoredBytes: 768,
      oldestExpiredAgeMs: 60000,
    })
    expect(query.mock.calls[0]?.[0]).toContain('COUNT_BIG(*)')
    expect(query.mock.calls[0]?.[0]).not.toContain('AS principalFingerprint')
  })

  it('purges a bounded expired batch using SQL Server UTC', async () => {
    query.mockResolvedValueOnce([{ deletedRows: '42' }])

    await expect(
      purgeExpiredRequirementImportValidationRateBuckets(db, 42.9),
    ).resolves.toEqual({ deletedRows: 42 })
    expect(query.mock.calls[0]?.[0]).toContain('TOP (@0)')
    expect(query.mock.calls[0]?.[0]).toContain('expires_at <= SYSUTCDATETIME()')
    expect(query.mock.calls[0]?.[1]).toEqual([42])
  })

  it('normalizes malformed and negative backlog aggregates', async () => {
    query.mockResolvedValueOnce([
      {
        expiredRowCount: -1,
        expiredStoredBytes: 'invalid',
        oldestExpiredAgeMs: -2,
      },
    ])

    await expect(
      inspectExpiredRequirementImportValidationRateBuckets(db),
    ).resolves.toEqual({
      expiredRowCount: 0,
      expiredStoredBytes: 0,
      oldestExpiredAgeMs: 0,
    })
  })

  it('registers rate buckets beside validation sessions for scheduled cleanup', () => {
    const targets = createTransientCleanupTargets(db)

    expect(targets.map(target => target.kind)).toEqual([
      'requirement_import_validation_sessions',
      'requirement_import_validation_rate_buckets',
    ])
    expect(
      createRequirementImportValidationRateBucketCleanupTarget(db).kind,
    ).toBe('requirement_import_validation_rate_buckets')
  })

  it('delegates inspection and purge through the cleanup target', async () => {
    query
      .mockResolvedValueOnce([
        {
          expiredRowCount: 0,
          expiredStoredBytes: 0,
          oldestExpiredAgeMs: null,
        },
      ])
      .mockResolvedValueOnce([{ deletedRows: 2 }])
    const target = createRequirementImportValidationRateBucketCleanupTarget(db)

    await expect(target.inspect()).resolves.toEqual({
      expiredRowCount: 0,
      expiredStoredBytes: 0,
      oldestExpiredAgeMs: null,
    })
    await expect(target.purgeBatch(2)).resolves.toEqual({ deletedRows: 2 })
  })
})
