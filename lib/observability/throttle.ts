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

const buckets = new Map<string, ThrottleBucket>()

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
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
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + policy.windowMs }

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
