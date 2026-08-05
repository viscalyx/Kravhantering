import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpecificationItemContext } from '@/app/[locale]/requirements/[id]/_detail/use-specification-item-context'

const apiFetchMock = vi.fn()

vi.mock('@/lib/http/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

function response(body: unknown, ok = true): Response {
  return { json: vi.fn(async () => body), ok } as unknown as Response
}

describe('useSpecificationItemContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetchMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays outside specification-item context without both identifiers', async () => {
    const { result } = renderHook(() =>
      useSpecificationItemContext({ specificationItemId: 7 }),
    )

    expect(result.current.isSpecificationItemContext).toBe(false)
    await act(async () => result.current.refreshSpecificationItemDetail())
    expect(result.current.specificationItemDetail).toBeNull()
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('loads and exposes specification-item detail through the hook boundary', async () => {
    apiFetchMock.mockResolvedValue(
      response({ id: 7, itemRef: 'lib:7', specificationId: 3 }),
    )

    const { result } = renderHook(() =>
      useSpecificationItemContext({
        specificationId: 3,
        specificationItemId: 7,
      }),
    )

    await waitFor(() => {
      expect(result.current.specificationItemDetail).toEqual({
        id: 7,
        itemRef: 'lib:7',
        specificationId: 3,
      })
    })
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/requirements-specifications/3/items/7',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('keeps detail empty for unsuccessful responses and ordinary failures', async () => {
    apiFetchMock
      .mockResolvedValueOnce(response({ error: 'Not found' }, false))
      .mockRejectedValueOnce(new Error('network unavailable'))

    const first = renderHook(() =>
      useSpecificationItemContext({
        specificationId: 3,
        specificationItemId: 7,
      }),
    )
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    expect(first.result.current.specificationItemDetail).toBeNull()
    first.unmount()

    const second = renderHook(() =>
      useSpecificationItemContext({
        specificationId: 3,
        specificationItemId: 8,
      }),
    )
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2))
    expect(second.result.current.specificationItemDetail).toBeNull()
  })

  it('ignores abort failures and aborts the active request on unmount', async () => {
    let signal: AbortSignal | undefined
    apiFetchMock.mockImplementation(
      async (_url: string, init?: { signal?: AbortSignal }) => {
        signal = init?.signal
        throw new DOMException('Aborted', 'AbortError')
      },
    )

    const { result, unmount } = renderHook(() =>
      useSpecificationItemContext({
        specificationId: 3,
        specificationItemId: 7,
      }),
    )

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce())
    expect(result.current.specificationItemDetail).toBeNull()
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
