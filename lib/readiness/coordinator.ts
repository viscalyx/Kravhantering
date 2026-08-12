export const READINESS_CACHE_DURATION_MS = 5_000

export interface ReadinessEvaluationContext {
  correlationId: string
  requestId: string
}

export interface ReadinessResult {
  readonly status: 'ready' | 'not_ready'
}

export interface ReadinessCoordinator {
  get(context: ReadinessEvaluationContext): Promise<ReadinessResult>
}

interface ReadinessCoordinatorOptions {
  evaluate: (context: ReadinessEvaluationContext) => Promise<ReadinessResult>
  monotonicNow?: () => number
  onUnexpectedError: (
    error: unknown,
    context: ReadinessEvaluationContext,
  ) => void
}

interface CachedReadinessResult {
  expiresAt: number
  result: ReadinessResult
}

const READY_RESULT = Object.freeze({ status: 'ready' as const })
const NOT_READY_RESULT = Object.freeze({ status: 'not_ready' as const })

function immutableResult(result: ReadinessResult): ReadinessResult {
  return result.status === 'ready' ? READY_RESULT : NOT_READY_RESULT
}

export function createReadinessCoordinator(
  options: ReadinessCoordinatorOptions,
): ReadinessCoordinator {
  const monotonicNow = options.monotonicNow ?? (() => performance.now())
  let cached: CachedReadinessResult | null = null
  let inFlight: Promise<ReadinessResult> | null = null

  return {
    get(context: ReadinessEvaluationContext): Promise<ReadinessResult> {
      const now = monotonicNow()
      if (cached && now < cached.expiresAt)
        return Promise.resolve(cached.result)
      if (inFlight) return inFlight

      const evaluation = Promise.resolve()
        .then(() => options.evaluate(context))
        .then(immutableResult)
        .catch((error: unknown) => {
          try {
            options.onUnexpectedError(error, context)
          } catch {
            // Readiness stays generic even if the operator log sink fails.
          }
          return NOT_READY_RESULT
        })
        .then(result => {
          cached = {
            expiresAt: monotonicNow() + READINESS_CACHE_DURATION_MS,
            result,
          }
          return result
        })
        .finally(() => {
          if (inFlight === evaluation) inFlight = null
        })

      inFlight = evaluation
      return evaluation
    },
  }
}
