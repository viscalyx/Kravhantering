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

function quotaDb(
  decisions: Array<{ allowed: number | string } | undefined>,
  clock: typeof CLOCK | null = CLOCK,
) {
  const query = vi
    .fn()
    .mockResolvedValueOnce(clock ? [clock] : [])
    .mockImplementation(async () => {
      const decision = decisions.shift()
      return decision ? [decision] : []
    })
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

  it('supports an actor without an HSA-id subject fingerprint', async () => {
    const { db } = quotaDb([
      { allowed: '1' },
      { allowed: '1' },
      { allowed: '1' },
    ])

    await expect(
      consumeHsaVerificationQuota(db, {
        ...INPUT,
        actorSubjectFingerprint: null,
      }),
    ).resolves.toEqual({ allowed: true })
  })

  it.each([
    ['actor fingerprint', { actorFingerprint: 'invalid' }],
    ['target fingerprint', { targetFingerprint: 'invalid' }],
    ['actor subject fingerprint', { actorSubjectFingerprint: 'invalid' }],
  ])(
    'rejects an invalid %s before opening a transaction',
    async (_name, patch) => {
      const { db, transaction } = quotaDb([])

      await expect(
        consumeHsaVerificationQuota(db, { ...INPUT, ...patch }),
      ).rejects.toThrow(/Invalid HSA verification quota/u)
      expect(transaction).not.toHaveBeenCalled()
    },
  )

  it('fails when the SQL clock row is unavailable', async () => {
    const { db } = quotaDb([], null)

    await expect(consumeHsaVerificationQuota(db, INPUT)).rejects.toThrow(
      'HSA verification quota clock is unavailable',
    )
  })

  it('fails when a bucket decision row is unavailable', async () => {
    const { db } = quotaDb([undefined])

    await expect(consumeHsaVerificationQuota(db, INPUT)).rejects.toThrow(
      'HSA verification quota decision is unavailable',
    )
  })

  it.each([
    [
      'one second',
      {
        now: new Date('2026-09-04T12:35:01.000Z'),
        windowEnd: CLOCK.windowEnd,
        windowStart: CLOCK.windowStart,
      },
      1,
    ],
    [
      'the full window',
      {
        now: new Date('2026-09-04T12:33:00.000Z'),
        windowEnd: CLOCK.windowEnd,
        windowStart: CLOCK.windowStart,
      },
      60,
    ],
  ])('bounds retry-after at %s', async (_name, clock, expected) => {
    const { db } = quotaDb([{ allowed: 0 }], clock)

    await expect(consumeHsaVerificationQuota(db, INPUT)).resolves.toEqual({
      allowed: false,
      bucket: 'actor',
      retryAfterSeconds: expected,
    })
  })
})
