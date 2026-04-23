import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthConfigMock = vi.fn()

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => getAuthConfigMock(),
}))

import { assertSameOriginRequest, CsrfError } from '@/lib/auth/csrf'

function buildRequest(
  method: string,
  init: {
    origin?: string
    referer?: string
    requestUrl?: string
    xForwardedHost?: string
    xForwardedProto?: string
    xrw?: string
  } = {},
): Request {
  const headers = new Headers()
  if (init.origin) headers.set('origin', init.origin)
  if (init.referer) headers.set('referer', init.referer)
  if (init.xForwardedHost) {
    headers.set('x-forwarded-host', init.xForwardedHost)
  }
  if (init.xForwardedProto) {
    headers.set('x-forwarded-proto', init.xForwardedProto)
  }
  if (init.xrw) headers.set('x-requested-with', init.xrw)
  return new Request(
    init.requestUrl ?? 'https://app.example.test/api/owners/1',
    {
      method,
      headers,
    },
  )
}

describe('assertSameOriginRequest', () => {
  beforeEach(() => {
    getAuthConfigMock.mockReturnValue({
      enabled: true,
      redirectUri: 'https://app.example.test/api/auth/callback',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('is a no-op for safe methods', () => {
    expect(() => assertSameOriginRequest(buildRequest('GET'))).not.toThrow()
    expect(() => assertSameOriginRequest(buildRequest('HEAD'))).not.toThrow()
    expect(() => assertSameOriginRequest(buildRequest('OPTIONS'))).not.toThrow()
  })

  it('accepts a same-origin POST with X-Requested-With', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', {
          origin: 'https://app.example.test',
          xrw: 'XMLHttpRequest',
        }),
      ),
    ).not.toThrow()
  })

  it('accepts when only Referer (matching origin) is present', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('PUT', {
          referer: 'https://app.example.test/page',
          xrw: 'XMLHttpRequest',
        }),
      ),
    ).not.toThrow()
  })

  it('accepts when the configured external origin differs from request.url', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', {
          origin: 'https://app.example.test',
          requestUrl: 'http://internal-host/api/owners/1',
          xrw: 'XMLHttpRequest',
        }),
      ),
    ).not.toThrow()
  })

  it('accepts forwarded-origin requests when auth config is unavailable', () => {
    getAuthConfigMock.mockReturnValue({ enabled: false, redirectUri: '' })

    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', {
          origin: 'https://app.example.test',
          requestUrl: 'http://internal-host/api/owners/1',
          xForwardedHost: 'app.example.test',
          xForwardedProto: 'https',
          xrw: 'XMLHttpRequest',
        }),
      ),
    ).not.toThrow()
  })

  it('rejects a cross-origin Origin header', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', {
          origin: 'https://evil.example',
          xrw: 'XMLHttpRequest',
        }),
      ),
    ).toThrow(CsrfError)
  })

  it('rejects when both Origin and Referer are missing', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('DELETE', { xrw: 'XMLHttpRequest' }),
      ),
    ).toThrow(CsrfError)
  })

  it('rejects when X-Requested-With is missing on a same-origin POST', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', { origin: 'https://app.example.test' }),
      ),
    ).toThrow(CsrfError)
  })

  it('CsrfError carries status 403', () => {
    try {
      assertSameOriginRequest(
        buildRequest('POST', { origin: 'https://evil.example' }),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(CsrfError)
      expect((error as CsrfError).status).toBe(403)
      return
    }
    throw new Error('expected CsrfError')
  })
})

describe('assertSameOriginRequest security audit events', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getAuthConfigMock.mockReturnValue({
      enabled: true,
      redirectUri: 'https://app.example.test/api/auth/callback',
    })
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    vi.clearAllMocks()
  })

  function emittedSecurityEvents(): Array<Record<string, unknown>> {
    return infoSpy.mock.calls
      .map((call: unknown[]) => {
        try {
          return JSON.parse(String(call[0])) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter(
        (ev: Record<string, unknown> | null): ev is Record<string, unknown> =>
          ev !== null && ev.channel === 'security-audit',
      )
  }

  it('does NOT emit on safe methods', () => {
    assertSameOriginRequest(buildRequest('GET'))
    assertSameOriginRequest(buildRequest('HEAD'))
    assertSameOriginRequest(buildRequest('OPTIONS'))
    expect(emittedSecurityEvents()).toEqual([])
  })

  it('emits with reason=origin_missing when both Origin and Referer are absent', () => {
    expect(() =>
      assertSameOriginRequest(buildRequest('POST', { xrw: 'XMLHttpRequest' })),
    ).toThrow(CsrfError)
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.csrf.rejected')
    expect(events[0].detail).toEqual({ reason: 'origin_missing' })
  })

  it('emits with reason=origin_mismatch including request and allowed origins', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', {
          origin: 'https://evil.example',
          xrw: 'XMLHttpRequest',
        }),
      ),
    ).toThrow(CsrfError)
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({
      reason: 'origin_mismatch',
      requestOrigin: 'https://evil.example',
      allowedOrigin: 'https://app.example.test',
    })
  })

  it('emits with reason=x_requested_with_missing on a same-origin POST without the header', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', { origin: 'https://app.example.test' }),
      ),
    ).toThrow(CsrfError)
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ reason: 'x_requested_with_missing' })
  })

  it('emits with reason=x_requested_with_invalid when header value is wrong', () => {
    expect(() =>
      assertSameOriginRequest(
        buildRequest('POST', {
          origin: 'https://app.example.test',
          xrw: 'NotXHR',
        }),
      ),
    ).toThrow('Invalid X-Requested-With header.')
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ reason: 'x_requested_with_invalid' })
  })

  it('does NOT emit on a successful same-origin POST', () => {
    assertSameOriginRequest(
      buildRequest('POST', {
        origin: 'https://app.example.test',
        xrw: 'XMLHttpRequest',
      }),
    )
    expect(emittedSecurityEvents()).toEqual([])
  })
})
