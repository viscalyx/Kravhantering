import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRequirementDetailData } from '@/app/[locale]/requirements/[id]/_detail/use-requirement-detail-data'
import { deferred } from '@/lib/__tests__/deferred'
import { AUTH_REAUTH_REQUIRED_EVENT } from '@/lib/auth/client-events'
import { createLibraryRequirementDetailCache } from '@/lib/requirements/detail-prefetch'

const detail = { id: 123, versions: [{ status: 1 }] }
const context = {
  resource: 'library-requirement',
  surface: 'requirements-library',
} as const

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe.each(['direct', 'cached'])('%s requirement detail recovery', mode => {
  it.each([
    [500, 'error'],
    [404, 'missing'],
    [403, 'denied'],
    [401, 'expired'],
    [0, 'error'],
  ] as const)(
    'classifies %s and recovers the selected resource',
    async (status, expected) => {
      let failure = true
      const reauthenticate = vi.fn()
      window.addEventListener(AUTH_REAUTH_REQUIRED_EVENT, reauthenticate)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url === '/api/requirement-statuses') return Response.json({})
          if (failure && status === 0)
            throw new TypeError('Network unavailable')
          return Response.json(detail, { status: failure ? status : 200 })
        }),
      )
      const cache =
        mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
      const { result, unmount } = renderHook(() =>
        useRequirementDetailData({
          requirementId: 123,
          detailCache: cache,
          detailContext: context,
        }),
      )
      await waitFor(() => expect(result.current.detailState).toBe(expected))
      expect(result.current.requirement).toBeNull()
      if (status === 401) expect(reauthenticate).toHaveBeenCalled()
      failure = false
      await act(() => result.current.refreshRequirement())
      expect(result.current.requirement).toEqual(detail)
      expect(result.current.detailState).toBe('success')
      unmount()
      cache?.dispose()
      window.removeEventListener(AUTH_REAUTH_REQUIRED_EVENT, reauthenticate)
    },
  )

  it('retries workflow data independently without changing the current status', async () => {
    let failure = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/requirement-statuses'
          ? Response.json(
              {
                statuses: [{ id: 1 }],
                transitions: [{ fromStatus: { id: 1 }, toStatus: { id: 2 } }],
              },
              { status: failure ? 500 : 200 },
            )
          : Response.json(detail),
      ),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, unmount } = renderHook(() =>
      useRequirementDetailData({
        requirementId: 123,
        detailCache: cache,
        detailContext: context,
      }),
    )
    await waitFor(() => expect(result.current.statusesState).toBe('error'))
    expect(result.current.requirement).toEqual(detail)
    expect(result.current.transitions).toEqual([])
    failure = false
    await act(() => result.current.refreshStatuses())
    expect(result.current.statusesState).toBe('success')
    expect(result.current.transitions).toEqual([{ id: 2 }])
    unmount()
    cache?.dispose()
  })

  it('clears readable data when the session expires during another request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json(url === '/api/requirement-statuses' ? {} : detail),
      ),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, unmount } = renderHook(() =>
      useRequirementDetailData({
        requirementId: 123,
        detailCache: cache,
        detailContext: context,
      }),
    )
    await waitFor(() => expect(result.current.requirement).toEqual(detail))
    act(() => window.dispatchEvent(new Event(AUTH_REAUTH_REQUIRED_EVENT)))
    expect(result.current.detailState).toBe('expired')
    expect(result.current.requirement).toBeNull()
    expect(result.current.transitions).toEqual([])
    unmount()
    cache?.dispose()
  })

  it('ignores a late detail response after selection changes', async () => {
    const old = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/requirements/123'
          ? old.promise
          : Response.json(
              url === '/api/requirement-statuses'
                ? {}
                : { id: 456, versions: [{ status: 2 }] },
            ),
      ),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, rerender, unmount } = renderHook(
      ({ id }) =>
        useRequirementDetailData({
          requirementId: id,
          detailCache: cache,
          detailContext: context,
        }),
      { initialProps: { id: 123 } },
    )
    rerender({ id: 456 })
    await waitFor(() => expect(result.current.requirement?.id).toBe(456))
    await act(async () => old.resolve(Response.json(detail)))
    expect(result.current.requirement?.id).toBe(456)
    expect(result.current.detailState).toBe('success')
    unmount()
    cache?.dispose()
  })

  it('ignores late workflow options for the previous selection', async () => {
    const old = deferred<Response>()
    let statusCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/requirement-statuses')
          return ++statusCalls === 1
            ? old.promise
            : Response.json({ statuses: [{ id: 2 }], transitions: [] })
        return Response.json(
          url.endsWith('123') ? detail : { id: 456, versions: [{ status: 2 }] },
        )
      }),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, rerender, unmount } = renderHook(
      ({ id }) =>
        useRequirementDetailData({
          requirementId: id,
          detailCache: cache,
          detailContext: context,
        }),
      { initialProps: { id: 123 } },
    )
    await waitFor(() => expect(statusCalls).toBe(1))
    rerender({ id: 456 })
    await waitFor(() => expect(result.current.statuses).toEqual([{ id: 2 }]))
    await act(async () =>
      old.resolve(
        Response.json({
          statuses: [{ id: 1 }],
          transitions: [{ fromStatus: { id: 1 }, toStatus: { id: 3 } }],
        }),
      ),
    )
    expect(result.current.statuses).toEqual([{ id: 2 }])
    expect(result.current.transitions).toEqual([])
    unmount()
    cache?.dispose()
  })

  it('requires a fresh read after access context changes', async () => {
    let denied = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json(url === '/api/requirement-statuses' ? {} : detail, {
          status: denied ? 403 : 200,
        }),
      ),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, rerender, unmount } = renderHook(
      ({ accessContext }) =>
        useRequirementDetailData({
          requirementId: 123,
          accessContext,
          detailCache: cache,
          detailContext: context,
        }),
      { initialProps: { accessContext: 'first' } },
    )
    await waitFor(() => expect(result.current.requirement).toEqual(detail))
    denied = true
    rerender({ accessContext: 'second' })
    expect(result.current.requirement).toBeNull()
    await waitFor(() => expect(result.current.detailState).toBe('denied'))
    unmount()
    cache?.dispose()
  })

  it('shares an in-flight retry and removes a stale snapshot on a missing response', async () => {
    let failure = false
    const next = deferred<Response>()
    let requests = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/requirement-statuses') return Response.json({})
        requests += 1
        return failure ? next.promise : Response.json(detail)
      }),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, unmount } = renderHook(() =>
      useRequirementDetailData({
        requirementId: 123,
        detailCache: cache,
        detailContext: context,
      }),
    )
    await waitFor(() => expect(result.current.requirement).toEqual(detail))
    failure = true
    await act(async () => {
      const first = result.current.refreshRequirement()
      const second = result.current.refreshRequirement()
      expect(requests).toBe(2)
      next.resolve(Response.json({}, { status: 404 }))
      await Promise.all([first, second])
    })
    expect(result.current.detailState).toBe('missing')
    expect(result.current.requirement).toBeNull()
    unmount()
    cache?.dispose()
  })

  it('ignores a refresh callback captured before the selection changed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json(
          url === '/api/requirement-statuses'
            ? {}
            : url.endsWith('123')
              ? detail
              : { id: 456, versions: [{ status: 2 }] },
        ),
      ),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, rerender, unmount } = renderHook(
      ({ id }) =>
        useRequirementDetailData({
          requirementId: id,
          detailCache: cache,
          detailContext: context,
        }),
      { initialProps: { id: 123 } },
    )
    await waitFor(() => expect(result.current.requirement).toEqual(detail))
    const previousRefresh = result.current.refreshRequirement
    rerender({ id: 456 })
    await waitFor(() => expect(result.current.requirement?.id).toBe(456))
    await act(() => previousRefresh())
    expect(result.current.requirement?.id).toBe(456)
    expect(result.current.detailState).toBe('success')
    unmount()
    cache?.dispose()
  })

  it('does not show a previous requirement after switching selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/requirements/456')
          return Response.json({}, { status: 500 })
        return Response.json(url === '/api/requirement-statuses' ? {} : detail)
      }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, rerender, unmount } = renderHook(
      ({ id }) =>
        useRequirementDetailData({
          requirementId: id,
          detailCache: cache,
          detailContext: context,
        }),
      { initialProps: { id: 123 } },
    )
    await waitFor(() => expect(result.current.requirement).toEqual(detail))
    rerender({ id: 456 })
    expect(result.current.requirement).toBeNull()
    await waitFor(() => expect(result.current.detailState).toBe('error'))
    expect(result.current.requirement).toBeNull()
    unmount()
    cache?.dispose()
  })

  it('retains a same-resource snapshot on refresh failure and clears it on denial', async () => {
    let status = 200
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/requirement-statuses'
          ? Response.json({ statuses: [], transitions: [] })
          : Response.json(detail, { status }),
      ),
    )
    const cache =
      mode === 'cached' ? createLibraryRequirementDetailCache() : undefined
    const { result, unmount } = renderHook(() =>
      useRequirementDetailData({
        requirementId: 123,
        detailCache: cache,
        detailContext: context,
      }),
    )
    await waitFor(() => expect(result.current.requirement).toEqual(detail))
    status = 500
    await act(() => result.current.refreshRequirement())
    expect(result.current.detailState).toBe('error')
    expect(result.current.requirement).toEqual(detail)
    status = 403
    await act(() => result.current.refreshRequirement())
    expect(result.current.detailState).toBe('denied')
    expect(result.current.requirement).toBeNull()
    unmount()
    cache?.dispose()
  })
})
