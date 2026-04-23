import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/http/api-fetch'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

describe('apiFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  })

  it('forwards bare safe string inputs without manufacturing an init object', async () => {
    await apiFetch('/api/items')

    expect(fetchMock).toHaveBeenCalledWith('/api/items')
  })

  it('honors Request inputs and overlays init headers for safe methods', async () => {
    const input = new Request('http://localhost/api/items', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Base': 'request-header',
      },
    })

    await apiFetch(input, {
      headers: {
        'X-Base': 'init-header',
        'X-Extra': 'extra-header',
      },
    })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request).toBeInstanceOf(Request)
    expect(request.method).toBe('GET')
    expect(request.headers.get('accept')).toBe('application/json')
    expect(request.headers.get('x-base')).toBe('init-header')
    expect(request.headers.get('x-extra')).toBe('extra-header')
    expect(request.headers.get('x-requested-with')).toBeNull()
  })

  it('adds X-Requested-With for mutating Request inputs', async () => {
    const input = new Request('http://localhost/api/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Item' }),
    })

    await apiFetch(input, {
      headers: {
        'X-Correlation-Id': 'abc-123',
      },
    })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Headers

    expect(request.method).toBe('POST')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-correlation-id')).toBe('abc-123')
    expect(headers.get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('adds X-Requested-With for mutating string inputs while preserving init headers', async () => {
    await apiFetch('/api/items', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated' }),
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Headers

    expect(url).toBe('/api/items')
    expect(init.method).toBe('PATCH')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('normalizes invalid X-Requested-With values for mutating requests', async () => {
    await apiFetch('/api/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'fetch',
      },
      body: JSON.stringify({ name: 'Item' }),
    })

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit)
      .headers as Headers

    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-requested-with')).toBe('XMLHttpRequest')
  })
})
