import { describe, expect, it, vi } from 'vitest'
import {
  consumeHsaVerificationQuota,
  HSA_VERIFICATION_QUOTA_LIMITS,
} from '@/lib/dal/hsa-verification-quota'
import type { SqlServerDatabase } from '@/lib/db'

const CLOCK = {
  now: new Date('2026-09-04T12:34:20.000Z'),
  windowEnd: new Date('2026-09-04T12:35:00.000Z'),
  windowStart: new Date('2026-09-04T12:34:00.000Z'),
}

function quotaDb(decisions: Array<{ allowed: number }>) {
  const query = vi
    .fn()
    .mockResolvedValueOnce([CLOCK])
    .mockImplementation(async () => [decisions.shift() ?? { allowed: 1 }])
  const transaction = vi.fn(
    async (
      _isolation: string,
      callback: (manager: { query: typeof query }) => unknown,
    ) => callback({ query }),
  )
  return {
    db: { transaction } as unknown as SqlServerDatabase,
    query,
    transaction,
  }
}

const INPUT = {
  actorFingerprint: 'afp_1234567890123456789012',
  actorSubjectFingerprint: 'hfp_abcdefghijklmnopqrstuv',
  targetFingerprint: 'hfp_1234567890123456789012',
}

describe('HSA verification quota', () => {
  it('allows a request only after consuming actor, actor-target, and target buckets', async () => {
    const { db, query, transaction } = quotaDb([
      { allowed: 1 },
      { allowed: 1 },
      { allowed: 1 },
    ])

    await expect(consumeHsaVerificationQuota(db, INPUT)).resolves.toEqual({
      allowed: true,
    })

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(query).toHaveBeenCalledTimes(4)
    expect(query.mock.calls.slice(1).map(call => call[1]?.[5])).toEqual([
      HSA_VERIFICATION_QUOTA_LIMITS.actor,
      HSA_VERIFICATION_QUOTA_LIMITS.actorTarget,
      HSA_VERIFICATION_QUOTA_LIMITS.target,
    ])
  })

  it('returns the first denied bucket and does not consume later buckets', async () => {
    const { db, query } = quotaDb([{ allowed: 1 }, { allowed: 0 }])

    await expect(consumeHsaVerificationQuota(db, INPUT)).resolves.toEqual({
      allowed: false,
      bucket: 'actor_target',
      retryAfterSeconds: 40,
    })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('stops after actor denial', async () => {
    const { db, query } = quotaDb([{ allowed: 0 }])

    await expect(consumeHsaVerificationQuota(db, INPUT)).resolves.toEqual({
      allowed: false,
      bucket: 'actor',
      retryAfterSeconds: 40,
    })
    expect(query).toHaveBeenCalledTimes(2)
  })
})
