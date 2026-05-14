import { afterEach, describe, expect, it } from 'vitest'
import {
  checkInMemoryThrottle,
  clearInMemoryThrottleForTests,
  getInMemoryThrottleBucketCountForTests,
} from '@/lib/observability/throttle'

describe('in-memory throttle', () => {
  afterEach(() => {
    clearInMemoryThrottleForTests()
  })

  it('allows requests until the limit is reached', () => {
    expect(
      checkInMemoryThrottle({
        key: 'actor-a:operation',
        limit: 2,
        now: 1_000,
        windowMs: 60_000,
      }),
    ).toMatchObject({ allowed: true, remaining: 1 })
    expect(
      checkInMemoryThrottle({
        key: 'actor-a:operation',
        limit: 2,
        now: 1_100,
        windowMs: 60_000,
      }),
    ).toMatchObject({ allowed: true, remaining: 0 })
    expect(
      checkInMemoryThrottle({
        key: 'actor-a:operation',
        limit: 2,
        now: 1_200,
        windowMs: 60_000,
      }),
    ).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    })
  })

  it('keeps separate buckets by key and resets after the window', () => {
    expect(
      checkInMemoryThrottle({
        key: 'actor-a:operation',
        limit: 1,
        now: 1_000,
        windowMs: 1_000,
      }).allowed,
    ).toBe(true)
    expect(
      checkInMemoryThrottle({
        key: 'actor-b:operation',
        limit: 1,
        now: 1_100,
        windowMs: 1_000,
      }).allowed,
    ).toBe(true)
    expect(
      checkInMemoryThrottle({
        key: 'actor-a:operation',
        limit: 1,
        now: 2_001,
        windowMs: 1_000,
      }).allowed,
    ).toBe(true)
  })

  it('prunes expired buckets lazily on access', () => {
    checkInMemoryThrottle({
      key: 'actor-a:operation',
      limit: 1,
      now: 1_000,
      windowMs: 1_000,
    })
    expect(getInMemoryThrottleBucketCountForTests()).toBe(1)

    checkInMemoryThrottle({
      key: 'actor-b:operation',
      limit: 1,
      now: 2_001,
      windowMs: 1_000,
    })

    expect(getInMemoryThrottleBucketCountForTests()).toBe(1)
  })

  it('bounds active buckets and evicts the oldest reset window', () => {
    const maxBuckets = 10_000
    const now = 1_000
    const windowMs = 1_000_000

    for (let index = 0; index < maxBuckets; index += 1) {
      expect(
        checkInMemoryThrottle({
          key: `actor-${index}:operation`,
          limit: 1,
          now: now + index,
          windowMs,
        }).allowed,
      ).toBe(true)
    }
    expect(getInMemoryThrottleBucketCountForTests()).toBe(maxBuckets)

    expect(
      checkInMemoryThrottle({
        key: 'actor-new:operation',
        limit: 1,
        now: now + maxBuckets,
        windowMs,
      }).allowed,
    ).toBe(true)
    expect(getInMemoryThrottleBucketCountForTests()).toBe(maxBuckets)

    expect(
      checkInMemoryThrottle({
        key: 'actor-0:operation',
        limit: 1,
        now: now + maxBuckets + 1,
        windowMs,
      }).allowed,
    ).toBe(true)
    expect(getInMemoryThrottleBucketCountForTests()).toBe(maxBuckets)
  })
})
