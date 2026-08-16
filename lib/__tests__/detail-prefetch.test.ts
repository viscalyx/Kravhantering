import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/http/api-fetch'
import {
  createLibraryRequirementDetailCache,
  createSpecificationLocalRequirementDetailCache,
  DetailFetchError,
  DetailPrefetchIntentController,
  type DetailPrefetchIntentTarget,
  DetailResourceCache,
  emitRequirementDetailPrefetchEvent,
  type RequirementDetailPrefetchEvent,
} from '@/lib/requirements/detail-prefetch'
import { deferred } from './deferred'

vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: vi.fn() }))

const context = {
  resource: 'library-requirement' as const,
  surface: 'requirements-library' as const,
  trigger: 'pointer' as const,
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DetailResourceCache', () => {
  it('shares one in-flight request between intent and activation', async () => {
    const request = deferred<{ description: string }>()
    const fetchDetail = vi.fn(() => request.promise)
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
      onEvent: event => events.push(event),
    })

    const prefetch = cache.load(17, 'prefetch', context)
    const activation = cache.load(17, 'activate', context)
    request.resolve({ description: 'Användbar kravtext' })

    await expect(prefetch).resolves.toEqual({
      description: 'Användbar kravtext',
    })
    await expect(activation).resolves.toEqual({
      description: 'Användbar kravtext',
    })
    cache.markUsable(17, context)
    expect(fetchDetail).toHaveBeenCalledTimes(1)
    expect(events.map(event => event.type)).toEqual([
      'prefetch-started',
      'click-reused-in-flight',
      'prefetch-outcome',
      'click-to-usable-content',
    ])
    expect(events[2]).toMatchObject({
      outcome: 'used',
      prefetchId: 1,
    })
  })

  it('reuses a completed response during its 30 second lifetime', async () => {
    vi.useFakeTimers()
    const fetchDetail = vi.fn(async () => ({ description: 'Kravtext' }))
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
      onEvent: event => events.push(event),
    })

    await cache.load(23, 'prefetch', context)
    await vi.advanceTimersByTimeAsync(29_999)
    await expect(cache.load(23, 'activate', context)).resolves.toEqual({
      description: 'Kravtext',
    })

    expect(fetchDetail).toHaveBeenCalledTimes(1)
    expect(events.map(event => event.type)).toContain('click-reused-cache')
  })

  it('prevents a late response from returning after invalidation', async () => {
    const staleRequest = deferred<{ description: string }>()
    const freshRequest = deferred<{ description: string }>()
    const fetchDetail = vi
      .fn()
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(freshRequest.promise)
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
    })

    const stalePrefetch = cache.load(41, 'prefetch', context)
    cache.invalidate(41, context)
    const authoritativeRefresh = cache.load(41, 'refresh', context)
    staleRequest.resolve({ description: 'Inaktuell kravtext' })
    freshRequest.resolve({ description: 'Ny kravtext' })

    await expect(stalePrefetch).rejects.toMatchObject({ name: 'AbortError' })
    await expect(authoritativeRefresh).resolves.toEqual({
      description: 'Ny kravtext',
    })
    await expect(cache.load(41, 'activate', context)).resolves.toEqual({
      description: 'Ny kravtext',
    })
    expect(fetchDetail).toHaveBeenCalledTimes(2)
  })

  it('classifies an unactivated prefetch invalidated by a mutation', async () => {
    const events: RequirementDetailPrefetchEvent[] = []
    const request = deferred<{ description: string }>()
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail: vi.fn(() => request.promise),
      keyOf: String,
      onEvent: event => events.push(event),
    })

    const prefetch = cache.load(42, 'prefetch', context)
    cache.invalidate(42, context)
    request.resolve({ description: 'Inaktuell kravtext' })
    await expect(prefetch).rejects.toMatchObject({ name: 'AbortError' })

    expect(events.filter(event => event.type === 'prefetch-outcome')).toEqual([
      expect.objectContaining({
        outcome: 'invalidated-unused',
        prefetchId: expect.any(Number),
      }),
    ])
  })

  it('retries activation once after a shared speculative server failure', async () => {
    const speculativeRequest = deferred<{ description: string }>()
    const activationRetry = deferred<{ description: string }>()
    const fetchDetail = vi
      .fn()
      .mockReturnValueOnce(speculativeRequest.promise)
      .mockReturnValueOnce(activationRetry.promise)
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
    })

    const prefetch = cache.load(52, 'prefetch', context)
    const activation = cache.load(52, 'activate', context)
    speculativeRequest.reject(new DetailFetchError(500, 'Tillfälligt fel'))
    activationRetry.resolve({ description: 'Kravtext efter nytt försök' })

    await expect(prefetch).rejects.toMatchObject({ status: 500 })
    await expect(activation).resolves.toEqual({
      description: 'Kravtext efter nytt försök',
    })
    expect(fetchDetail).toHaveBeenCalledTimes(2)
  })

  it('classifies a failed unactivated prefetch', async () => {
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail: vi.fn(async () => {
        throw new DetailFetchError(500, 'Tillfälligt fel')
      }),
      keyOf: String,
      onEvent: event => events.push(event),
    })

    await expect(cache.load(53, 'prefetch', context)).rejects.toMatchObject({
      status: 500,
    })

    expect(events.filter(event => event.type === 'prefetch-outcome')).toEqual([
      expect.objectContaining({
        outcome: 'failed-unused',
        prefetchId: expect.any(Number),
      }),
    ])
  })

  it('does not retry an authentication failure and clears actor-bound data', async () => {
    const fetchDetail = vi
      .fn()
      .mockResolvedValueOnce({ description: 'Tidigare cachad kravtext' })
      .mockRejectedValueOnce(new DetailFetchError(401, 'Logga in igen'))
      .mockResolvedValueOnce({ description: 'Kravtext efter ny inloggning' })
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
    })

    await cache.load(1, 'prefetch', context)
    const rejectedPrefetch = cache.load(2, 'prefetch', context)
    const rejectedActivation = cache.load(2, 'activate', context)

    await expect(rejectedPrefetch).rejects.toMatchObject({ status: 401 })
    await expect(rejectedActivation).rejects.toMatchObject({ status: 401 })
    await expect(cache.load(1, 'activate', context)).resolves.toEqual({
      description: 'Kravtext efter ny inloggning',
    })
    expect(fetchDetail).toHaveBeenCalledTimes(3)
  })

  it('reports a speculative response unused when its lifetime expires', async () => {
    vi.useFakeTimers()
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail: vi.fn(async () => ({ description: 'Kravtext' })),
      keyOf: String,
      onEvent: event => events.push(event),
    })

    await cache.load(61, 'prefetch', context)
    await vi.advanceTimersByTimeAsync(30_000)
    const prefetchId = events[0]?.prefetchId

    expect(prefetchId).toEqual(expect.any(Number))

    expect(events).toEqual([
      expect.objectContaining({
        prefetchId,
        type: 'prefetch-started',
      }),
      expect.objectContaining({
        outcome: 'expired-unused',
        prefetchId,
        type: 'prefetch-outcome',
      }),
      expect.objectContaining({
        outcome: 'expired-unused',
        prefetchId,
        type: 'unused',
      }),
    ])
  })

  it('removes and aborts a timed-out pending request before retry', async () => {
    vi.useFakeTimers()
    const pendingRequest = deferred<{ description: string }>()
    const signals: AbortSignal[] = []
    const events: RequirementDetailPrefetchEvent[] = []
    const fetchDetail = vi
      .fn<
        (key: number, signal: AbortSignal) => Promise<{ description: string }>
      >()
      .mockImplementationOnce((_: number, signal: AbortSignal) => {
        signals.push(signal)
        return pendingRequest.promise
      })
      .mockImplementationOnce(async (_: number, signal: AbortSignal) => {
        signals.push(signal)
        return { description: 'Fresh detail' }
      })
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
      onEvent: event => events.push(event),
    })

    void cache.load(95, 'prefetch', context).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(30_000)

    expect(signals[0]?.aborted).toBe(true)
    await expect(cache.load(95, 'activate', context)).resolves.toEqual({
      description: 'Fresh detail',
    })
    expect(fetchDetail).toHaveBeenCalledTimes(2)
    expect(events).toContainEqual(
      expect.objectContaining({
        key: '95',
        outcome: 'failed-unused',
        type: 'prefetch-outcome',
      }),
    )
  })

  it('caps completed responses at 32 without counting in-flight requests', async () => {
    const fetchDetail = vi.fn(async (key: number) => ({
      description: `${key}`,
    }))
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
      onEvent: event => events.push(event),
    })

    for (let key = 1; key <= 33; key += 1) {
      await cache.load(key, 'prefetch', context)
    }
    await expect(cache.load(1, 'activate', context)).resolves.toEqual({
      description: '1',
    })

    expect(fetchDetail).toHaveBeenCalledTimes(34)
    expect(
      events.filter(event => event.type === 'prefetch-outcome'),
    ).toContainEqual(
      expect.objectContaining({
        key: '1',
        outcome: 'capacity-evicted-unused',
        prefetchId: expect.any(Number),
      }),
    )
  })

  it('drops an expired completed response even before its timer callback runs', async () => {
    vi.useFakeTimers()
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    const fetchDetail = vi.fn(async () => ({ description: 'Kravtext' }))
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail,
      keyOf: String,
      onEvent: event => events.push(event),
    })

    await cache.load(91, 'prefetch', context)
    now.mockReturnValue(30_001)
    await cache.load(91, 'activate', context)

    expect(fetchDetail).toHaveBeenCalledTimes(2)
    expect(events.filter(event => event.type === 'prefetch-outcome')).toEqual([
      expect.objectContaining({
        outcome: 'expired-unused',
        prefetchId: expect.any(Number),
      }),
    ])
  })

  it('clears completed timers and tolerates unusable or disposed entries', async () => {
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail: vi.fn(async () => ({ description: 'Kravtext' })),
      keyOf: String,
      onEvent: event => events.push(event),
    })

    cache.markUsable(92, context)
    await cache.load(92, 'prefetch', context)
    cache.markUsable(92, context)
    cache.invalidate(92, context)
    cache.dispose()

    expect(events.map(event => event.type)).toEqual([
      'prefetch-started',
      'prefetch-outcome',
      'unused',
      'invalidated',
    ])
  })

  it('classifies an unactivated prefetch removed by an explicit clear', async () => {
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail: vi.fn(async () => ({ description: 'Kravtext' })),
      keyOf: String,
      onEvent: event => events.push(event),
    })

    await cache.load(93, 'prefetch', context)
    cache.clear()

    expect(events.filter(event => event.type === 'prefetch-outcome')).toEqual([
      expect.objectContaining({
        outcome: 'cleared-unused',
        prefetchId: expect.any(Number),
      }),
    ])
  })

  it('classifies an unactivated prefetch when its page cache is disposed', async () => {
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail: vi.fn(async () => ({ description: 'Kravtext' })),
      keyOf: String,
      onEvent: event => events.push(event),
    })

    await cache.load(94, 'prefetch', context)
    cache.dispose()

    expect(events.filter(event => event.type === 'prefetch-outcome')).toEqual([
      expect.objectContaining({
        outcome: 'page-disposed-unused',
        prefetchId: expect.any(Number),
      }),
    ])
  })

  it.each([403, 404])(
    'does not retry a shared speculative %i response',
    async status => {
      const fetchDetail = vi
        .fn()
        .mockRejectedValue(new DetailFetchError(status, 'Permanent avvisning'))
      const cache = new DetailResourceCache<number, { description: string }>({
        fetchDetail,
        keyOf: String,
      })

      const prefetch = cache.load(status, 'prefetch', context)
      const activation = cache.load(status, 'activate', context)

      await expect(prefetch).rejects.toMatchObject({ status })
      await expect(activation).rejects.toMatchObject({ status })
      expect(fetchDetail).toHaveBeenCalledTimes(1)
    },
  )
})

describe('DetailPrefetchIntentController', () => {
  it('correlates a started prefetch with its focus trigger and outcome', async () => {
    vi.useFakeTimers()
    const events: RequirementDetailPrefetchEvent[] = []
    const cache = new DetailResourceCache<number, { description: string }>({
      fetchDetail: vi.fn(async () => ({ description: 'Kravtext' })),
      keyOf: String,
      onEvent: event => events.push(event),
    })
    const target = { ...context, key: '71', trigger: 'focus' as const }
    let prefetchPromise: Promise<{ description: string }> | undefined
    const prefetch = vi.fn((...targets: DetailPrefetchIntentTarget[]) => {
      const scheduledTarget = targets[0]
      if (scheduledTarget) {
        prefetchPromise = cache.load(71, 'prefetch', scheduledTarget)
      }
    })
    const controller = new DetailPrefetchIntentController({
      onEvent: event => events.push(event),
    })

    controller.schedule(target, prefetch)
    await vi.advanceTimersByTimeAsync(150)
    await prefetchPromise
    cache.invalidate(71, context)

    expect(prefetch).toHaveBeenCalledWith(target)
    const started = events.find(event => event.type === 'prefetch-started')
    const outcome = events.find(event => event.type === 'prefetch-outcome')
    expect(started).toMatchObject({
      prefetchId: expect.any(Number),
      trigger: 'focus',
    })
    expect(outcome).toMatchObject({
      outcome: 'invalidated-unused',
      prefetchId: started?.prefetchId,
      trigger: 'focus',
    })
  })

  it('starts prefetch only after the 150 ms intent threshold', async () => {
    vi.useFakeTimers()
    const prefetch = vi.fn()
    const controller = new DetailPrefetchIntentController()

    controller.schedule({ ...context, key: '72', trigger: 'pointer' }, prefetch)
    await vi.advanceTimersByTimeAsync(149)
    expect(prefetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('cancels pending pointer intent when the pointer leaves', async () => {
    vi.useFakeTimers()
    const events: RequirementDetailPrefetchEvent[] = []
    const prefetch = vi.fn()
    const target = { ...context, key: '73', trigger: 'pointer' as const }
    const controller = new DetailPrefetchIntentController({
      onEvent: event => events.push(event),
    })

    controller.schedule(target, prefetch)
    await vi.advanceTimersByTimeAsync(80)
    controller.cancel(target)
    await vi.advanceTimersByTimeAsync(100)

    expect(prefetch).not.toHaveBeenCalled()
    expect(events.map(event => event.type)).toEqual([
      'timer-started',
      'timer-cancelled',
    ])
  })

  it('records pointer-to-click and prevents a pre-threshold request', async () => {
    vi.useFakeTimers()
    const events: RequirementDetailPrefetchEvent[] = []
    const prefetch = vi.fn()
    const target = { ...context, key: '74', trigger: 'pointer' as const }
    const controller = new DetailPrefetchIntentController({
      onEvent: event => events.push(event),
    })

    controller.schedule(target, prefetch)
    await vi.advanceTimersByTimeAsync(90)
    controller.activate({ ...context, key: '74' })

    expect(prefetch).not.toHaveBeenCalled()
    expect(events.at(-1)).toMatchObject({
      durationMs: 90,
      trigger: 'pointer',
      type: 'intent-to-click',
    })
  })

  it('cancels every pending timer when its page is disposed', async () => {
    vi.useFakeTimers()
    const prefetch = vi.fn()
    const controller = new DetailPrefetchIntentController()
    controller.schedule({ ...context, key: '81', trigger: 'pointer' }, prefetch)
    controller.schedule({ ...context, key: '82', trigger: 'focus' }, prefetch)

    controller.dispose()
    await vi.advanceTimersByTimeAsync(150)

    expect(prefetch).not.toHaveBeenCalled()
  })

  it('ignores duplicate intent schedules for the same trigger', () => {
    vi.useFakeTimers()
    const firstPrefetch = vi.fn()
    const secondPrefetch = vi.fn()
    const target = { ...context, key: '83', trigger: 'focus' as const }
    const controller = new DetailPrefetchIntentController()

    controller.schedule(target, firstPrefetch)
    controller.schedule(target, secondPrefetch)
    vi.advanceTimersByTime(150)

    expect(firstPrefetch).toHaveBeenCalledTimes(1)
    expect(secondPrefetch).not.toHaveBeenCalled()
  })
})

describe('detail cache browser adapters', () => {
  it('dispatches content-free events only when a browser window exists', () => {
    const event = {
      ...context,
      key: '101',
      timestamp: Date.now(),
      type: 'prefetch-started' as const,
    }
    const listener = vi.fn()
    const browserWindow = window
    browserWindow.addEventListener('krav:requirement-detail-prefetch', listener)

    try {
      emitRequirementDetailPrefetchEvent(event)
      expect(listener).toHaveBeenCalledTimes(1)

      vi.stubGlobal('window', undefined)
      expect(() => emitRequirementDetailPrefetchEvent(event)).not.toThrow()
    } finally {
      browserWindow.removeEventListener(
        'krav:requirement-detail-prefetch',
        listener,
      )
    }
  })

  it('loads library and specification-local details through their API paths', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ description: 'Bibliotekskrav' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ description: 'Lokalt krav' })),
      )
    const libraryCache = createLibraryRequirementDetailCache()
    const localCache = createSpecificationLocalRequirementDetailCache()

    await expect(libraryCache.load(102, 'activate', context)).resolves.toEqual({
      description: 'Bibliotekskrav',
    })
    await expect(
      localCache.load(
        { localRequirementId: 104, specificationId: 103 },
        'activate',
        {
          resource: 'specification-local-requirement',
          surface: 'specification-left',
        },
      ),
    ).resolves.toEqual({ description: 'Lokalt krav' })

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/requirements/102', {
      signal: expect.any(AbortSignal),
    })
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/api/requirements-specifications/103/local-requirements/104',
      { signal: expect.any(AbortSignal) },
    )
  })

  it('surfaces API status errors without requiring status text', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      new Response(null, { status: 404, statusText: '' }),
    )
    const cache = createLibraryRequirementDetailCache()

    await expect(cache.load(105, 'activate', context)).rejects.toMatchObject({
      message: 'Detail request failed (404)',
      status: 404,
    })
  })
})
