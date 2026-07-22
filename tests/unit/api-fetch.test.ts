import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_REAUTH_REQUIRED_EVENT } from '@/lib/auth/client-events'
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

    const headers = new Headers(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    )

    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('dispatches a reauth event for same-origin API 401 responses', async () => {
    const events: CustomEvent[] = []
    const listener = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener(AUTH_REAUTH_REQUIRED_EVENT, listener)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))

    try {
      const response = await apiFetch('/api/items')

      expect(response.status).toBe(401)
      expect(events).toHaveLength(1)
      expect(events[0]?.detail).toEqual({ reason: 'api_unauthorized' })
    } finally {
      window.removeEventListener(AUTH_REAUTH_REQUIRED_EVENT, listener)
    }
  })

  it('does not dispatch a reauth event for cross-origin 401 responses', async () => {
    const events: CustomEvent[] = []
    const listener = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener(AUTH_REAUTH_REQUIRED_EVENT, listener)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))

    try {
      const response = await apiFetch('https://api.example.test/items')

      expect(response.status).toBe(401)
      expect(events).toHaveLength(0)
    } finally {
      window.removeEventListener(AUTH_REAUTH_REQUIRED_EVENT, listener)
    }
  })

  it('still returns the API response when reauth event dispatch fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const dispatchSpy = vi
      .spyOn(window, 'dispatchEvent')
      .mockImplementation(() => {
        throw new Error('dispatch failed')
      })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))

    try {
      const response = await apiFetch('/api/items')

      expect(response.status).toBe(401)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[auth] failed to dispatch auth-required event',
        'dispatch failed',
      )
    } finally {
      dispatchSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    }
  })
})
