import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAsyncResource } from '@/hooks/useAsyncResource'

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver, rejecter) => {
    resolve = resolver
    reject = rejecter
  })

  return { promise, reject, resolve }
}

describe('useAsyncResource', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads data on mount', async () => {
    const fetcher = vi.fn(async () => 'loaded')

    const { result } = renderHook(() =>
      useAsyncResource({
        fetcher,
        key: 'resource:load',
      }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('loaded')
    expect(result.current.error).toBeNull()
  })

  it('ignores stale responses when the key changes', async () => {
    const first = createDeferred<string>()
    const second = createDeferred<string>()
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const { rerender, result } = renderHook(
      ({ resourceKey }: { resourceKey: string }) =>
        useAsyncResource({
          fetcher,
          key: resourceKey,
        }),
      { initialProps: { resourceKey: 'resource:first' } },
    )

    rerender({ resourceKey: 'resource:second' })

    await act(async () => {
      second.resolve('second value')
      await second.promise
    })

    await waitFor(() => expect(result.current.data).toBe('second value'))

    await act(async () => {
      first.resolve('first value')
      await first.promise
    })

    expect(result.current.data).toBe('second value')
  })

  it('aborts the active request on cleanup', async () => {
    const active: { signal: AbortSignal | null } = { signal: null }
    const deferred = createDeferred<string>()
    const fetcher = vi.fn((signal: AbortSignal) => {
      active.signal = signal
      return deferred.promise
    })

    const { unmount } = renderHook(() =>
      useAsyncResource({
        fetcher,
        key: 'resource:abort',
      }),
    )

    await waitFor(() => expect(active.signal).not.toBeNull())
    unmount()

    expect(active.signal).not.toBeNull()
    expect(active.signal?.aborted).toBe(true)
  })

  it('preserves existing data and exposes refresh errors', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('refresh failed')
    })

    const { result } = renderHook(() =>
      useAsyncResource({
        fetcher,
        initialData: 'cached',
        key: 'resource:error',
        loadOnMount: false,
      }),
    )

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.data).toBe('cached')
    expect(result.current.error).toBeNull()
    expect(result.current.refreshError).toBe('refresh failed')
  })

  it('resets cached data and errors when the key changes', async () => {
    const second = createDeferred<string>()
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockImplementationOnce(() => second.promise)

    const { rerender, result } = renderHook(
      ({
        initialData,
        resourceKey,
      }: {
        initialData: string
        resourceKey: string
      }) =>
        useAsyncResource({
          fetcher,
          initialData,
          key: resourceKey,
          loadOnMount: false,
        }),
      {
        initialProps: {
          initialData: 'first cached',
          resourceKey: 'resource:first',
        },
      },
    )

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.data).toBe('first cached')
    expect(result.current.refreshError).toBe('refresh failed')

    rerender({
      initialData: 'second cached',
      resourceKey: 'resource:second',
    })

    await waitFor(() => {
      expect(result.current.data).toBe('second cached')
      expect(result.current.refreshError).toBeNull()
      expect(result.current.error).toBeNull()
    })

    await act(async () => {
      second.resolve('second loaded')
      await second.promise
    })
  })

  it('supports manual reload when mount loading is disabled', async () => {
    const fetcher = vi.fn(async () => 'manual')

    const { result } = renderHook(() =>
      useAsyncResource({
        fetcher,
        key: 'resource:manual',
        loadOnMount: false,
      }),
    )

    expect(fetcher).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.data).toBe('manual')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent requests by key', async () => {
    const deferred = createDeferred<string>()
    const fetcher = vi.fn(() => deferred.promise)

    const first = renderHook(() =>
      useAsyncResource({
        dedupe: true,
        fetcher,
        key: 'resource:dedupe',
      }),
    )
    const second = renderHook(() =>
      useAsyncResource({
        dedupe: true,
        fetcher,
        key: 'resource:dedupe',
      }),
    )

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await act(async () => {
      deferred.resolve('shared')
      await deferred.promise
    })

    await waitFor(() => {
      expect(first.result.current.data).toBe('shared')
      expect(second.result.current.data).toBe('shared')
    })
  })
})
