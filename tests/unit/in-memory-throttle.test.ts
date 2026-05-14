import { afterEach, describe, expect, it } from 'vitest'
import {
  checkInMemoryThrottle,
  clearInMemoryThrottleForTests,
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
})
