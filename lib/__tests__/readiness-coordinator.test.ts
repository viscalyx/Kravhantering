import { describe, expect, it, vi } from 'vitest'
import {
  createReadinessCoordinator,
  type ReadinessEvaluationContext,
} from '@/lib/readiness/coordinator'

const context: ReadinessEvaluationContext = {
  correlationId: 'correlation-478',
  requestId: 'request-478',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('readiness coordinator', () => {
  it('coalesces concurrent evaluations and caches from completion time', async () => {
    let now = 100
    const first = deferred<{ status: 'ready' }>()
    const evaluate = vi.fn(() => first.promise)
    const coordinator = createReadinessCoordinator({
      evaluate,
      monotonicNow: () => now,
      onUnexpectedError: vi.fn(),
    })

    const firstRequest = coordinator.get(context)
    const joinedRequest = coordinator.get({
      correlationId: 'joined-correlation',
      requestId: 'joined-request',
    })
    await Promise.resolve()

    expect(evaluate).toHaveBeenCalledTimes(1)
    expect(evaluate).toHaveBeenCalledWith(context)

    now = 300
    first.resolve({ status: 'ready' })
    await expect(firstRequest).resolves.toEqual({ status: 'ready' })
    await expect(joinedRequest).resolves.toEqual({ status: 'ready' })

    now = 5_299
    await expect(coordinator.get(context)).resolves.toEqual({ status: 'ready' })
    expect(evaluate).toHaveBeenCalledTimes(1)
  })

  it('refreshes synchronously after expiry and does not serve stale data', async () => {
    let now = 0
    const refresh = deferred<{ status: 'not_ready' }>()
    const evaluate = vi
      .fn<() => Promise<{ status: 'ready' | 'not_ready' }>>()
      .mockResolvedValueOnce({ status: 'ready' })
      .mockImplementationOnce(() => refresh.promise)
    const coordinator = createReadinessCoordinator({
      evaluate,
      monotonicNow: () => now,
      onUnexpectedError: vi.fn(),
    })

    await expect(coordinator.get(context)).resolves.toEqual({ status: 'ready' })
    now = 5_000

    const firstRefresh = coordinator.get(context)
    const joinedRefresh = coordinator.get(context)
    let refreshSettled = false
    void firstRefresh.then(() => {
      refreshSettled = true
    })
    await Promise.resolve()

    expect(refreshSettled).toBe(false)
    expect(evaluate).toHaveBeenCalledTimes(2)

    refresh.resolve({ status: 'not_ready' })
    await expect(firstRefresh).resolves.toEqual({ status: 'not_ready' })
    await expect(joinedRefresh).resolves.toEqual({ status: 'not_ready' })
  })

  it('caches unexpected failures generically and clears in-flight state', async () => {
    let now = 0
    const failure = new Error('postgres://secret@database/private')
    const onUnexpectedError = vi.fn()
    const evaluate = vi
      .fn<() => Promise<{ status: 'ready' }>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ status: 'ready' })
    const coordinator = createReadinessCoordinator({
      evaluate,
      monotonicNow: () => now,
      onUnexpectedError,
    })

    await expect(coordinator.get(context)).resolves.toEqual({
      status: 'not_ready',
    })
    await expect(coordinator.get(context)).resolves.toEqual({
      status: 'not_ready',
    })
    expect(evaluate).toHaveBeenCalledTimes(1)
    expect(onUnexpectedError).toHaveBeenCalledOnce()
    expect(onUnexpectedError).toHaveBeenCalledWith(failure, context)

    now = 5_000
    await expect(coordinator.get(context)).resolves.toEqual({ status: 'ready' })
    expect(evaluate).toHaveBeenCalledTimes(2)
  })
})
