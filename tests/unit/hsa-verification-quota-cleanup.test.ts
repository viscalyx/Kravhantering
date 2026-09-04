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
      expect.stringMatching(/UPDLOCK, READPAST, ROWLOCK/u),
      [500],
    )
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
})
