import { describe, expect, it, vi } from 'vitest'
import {
  createHsaVerificationQuotaBucketCleanupTarget,
  inspectExpiredHsaVerificationQuotaBuckets,
  purgeExpiredHsaVerificationQuotaBuckets,
} from '@/lib/transient-cleanup/hsa-verification-quota-buckets'
import { createTransientCleanupTargets } from '@/lib/transient-cleanup/registry'

describe('HSA verification quota cleanup', () => {
  it('reports only aggregate expired-row backlog metadata', async () => {
    const query = vi.fn()
    query.mockResolvedValueOnce([
      {
        expiredRowCount: '3',
        expiredStoredBytes: '512',
        oldestExpiredAgeMs: '9000',
      },
    ])

    await expect(
      inspectExpiredHsaVerificationQuotaBuckets({ query }),
    ).resolves.toEqual({
      expiredRowCount: 3,
      expiredStoredBytes: 512,
      oldestExpiredAgeMs: 9000,
    })
    expect(query.mock.calls[0]?.[0]).not.toMatch(
      /AS (?:actor|target|actorSubject)Fingerprint/u,
    )
  })

  it('purges bounded skip-locked batches', async () => {
    const query = vi.fn()
    query.mockResolvedValueOnce([{ deletedRows: 7 }])

    await expect(
      purgeExpiredHsaVerificationQuotaBuckets({ query }, 700),
    ).resolves.toEqual({ deletedRows: 7 })
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDLOCK, READPAST, READCOMMITTEDLOCK, ROWLOCK/u),
      [500],
    )
  })

  it('uses safe empty backlog defaults for unavailable aggregate rows', async () => {
    const query = vi.fn().mockResolvedValueOnce([])

    await expect(
      inspectExpiredHsaVerificationQuotaBuckets({ query }),
    ).resolves.toEqual({
      expiredRowCount: 0,
      expiredStoredBytes: 0,
      oldestExpiredAgeMs: null,
    })
  })

  it('normalizes invalid aggregate values without exposing row data', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      {
        expiredRowCount: '-1',
        expiredStoredBytes: '1.5',
        oldestExpiredAgeMs: 'not-a-number',
      },
    ])

    await expect(
      inspectExpiredHsaVerificationQuotaBuckets({ query }),
    ).resolves.toEqual({
      expiredRowCount: 0,
      expiredStoredBytes: 0,
      oldestExpiredAgeMs: 0,
    })
  })

  it('bounds small purge batches and defaults a missing result to zero', async () => {
    const query = vi.fn().mockResolvedValueOnce([])

    await expect(
      purgeExpiredHsaVerificationQuotaBuckets({ query }, -4),
    ).resolves.toEqual({ deletedRows: 0 })
    expect(query).toHaveBeenCalledWith(expect.any(String), [1])
  })

  it('registers the quota buckets with scheduled transient cleanup', () => {
    const executor = { query: vi.fn() }

    expect(
      createTransientCleanupTargets(executor).map(target => target.kind),
    ).toContain('hsa_verification_quota_buckets')
    expect(createHsaVerificationQuotaBucketCleanupTarget(executor).kind).toBe(
      'hsa_verification_quota_buckets',
    )
  })

  it('delegates target inspection and bounded purging to the executor', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          expiredRowCount: 1,
          expiredStoredBytes: 20,
          oldestExpiredAgeMs: null,
        },
      ])
      .mockResolvedValueOnce([{ deletedRows: 1 }])
    const target = createHsaVerificationQuotaBucketCleanupTarget({ query })

    await expect(target.inspect()).resolves.toEqual({
      expiredRowCount: 1,
      expiredStoredBytes: 20,
      oldestExpiredAgeMs: null,
    })
    await expect(target.purgeBatch(20)).resolves.toEqual({ deletedRows: 1 })
    expect(query.mock.calls[1]?.[1]).toEqual([20])
  })
})
