export interface InMemoryThrottlePolicy {
  key: string
  limit: number
  now?: number
  windowMs: number
}

export interface InMemoryThrottleDecision {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

interface ThrottleBucket {
  count: number
  resetAt: number
}

const MAX_BUCKETS = 10_000
const buckets = new Map<string, ThrottleBucket>()

function evictOldestBucket(): void {
  let oldestKey: string | null = null
  let oldestResetAt = Number.POSITIVE_INFINITY

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < oldestResetAt) {
      oldestKey = key
      oldestResetAt = bucket.resetAt
    }
  }

  if (oldestKey !== null) {
    buckets.delete(oldestKey)
  }
}

function pruneExpiredBuckets(now: number, requiredFreeSlots = 0): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }

  const maximumRetainedBuckets = Math.max(0, MAX_BUCKETS - requiredFreeSlots)
  while (buckets.size > maximumRetainedBuckets) {
    const previousSize = buckets.size
    evictOldestBucket()
    if (buckets.size === previousSize) break
  }
}

export function clearInMemoryThrottleForTests(): void {
  buckets.clear()
}

export function getInMemoryThrottleBucketCountForTests(): number {
  return buckets.size
}

export function checkInMemoryThrottle(
  policy: InMemoryThrottlePolicy,
): InMemoryThrottleDecision {
  const now = policy.now ?? Date.now()
  pruneExpiredBuckets(now)
  const existing = buckets.get(policy.key)
  let bucket = existing && existing.resetAt > now ? existing : null
  if (!bucket) {
    pruneExpiredBuckets(now, 1)
    bucket = { count: 0, resetAt: now + policy.windowMs }
  }

  if (bucket.count >= policy.limit) {
    buckets.set(policy.key, bucket)
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  buckets.set(policy.key, bucket)

  return {
    allowed: true,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: 0,
  }
}
