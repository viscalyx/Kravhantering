import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordSecurityEvent,
  type SecurityEventRequest,
} from '@/lib/auth/audit'

describe('recordSecurityEvent', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  function emittedJsonLines(): Array<Record<string, unknown>> {
    return infoSpy.mock.calls.map((call: unknown[]) =>
      JSON.parse(String(call[0])),
    )
  }

  function emittedEvents(): Array<Record<string, unknown>> {
    return emittedJsonLines().filter(
      event =>
        event.channel === 'security-audit' &&
        typeof event.event === 'string' &&
        typeof event.outcome === 'string',
    )
  }

  function emittedRedactionBreadcrumbs(): Array<Record<string, unknown>> {
    return emittedJsonLines().filter(
      event =>
        event.channel === 'security-audit' &&
        event.breadcrumb === 'detail-key-redacted',
    )
  }

  it('emits a single JSON line tagged with channel:"security-audit"', () => {
    recordSecurityEvent({
      event: 'auth.login.succeeded',
      outcome: 'success',
      actor: { source: 'oidc', sub: 'user-1', hsaId: 'SE2321000032-rev1' },
      request: new Request('https://app.example.test/sv/requirements'),
    })
    expect(infoSpy).toHaveBeenCalledTimes(1)
    const ev = emittedEvents()[0]
    expect(ev.channel).toBe('security-audit')
    expect(ev.event).toBe('auth.login.succeeded')
    expect(ev.outcome).toBe('success')
    expect(ev.actor).toEqual({
      source: 'oidc',
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
    })
  })

  it('defaults ts to an ISO-8601 UTC timestamp when omitted', () => {
    recordSecurityEvent({
      event: 'auth.logout',
      outcome: 'success',
      actor: { source: 'anonymous' },
      request: new Request('https://app.example.test/api/auth/logout'),
    })
    const ev = emittedEvents()[0]
    const ts = ev.ts
    expect(typeof ts).toBe('string')
    expect(new Date(ts as string).toISOString()).toBe(ts)
  })

  it('preserves caller-supplied ts', () => {
    recordSecurityEvent({
      event: 'auth.logout',
      outcome: 'success',
      actor: { source: 'anonymous' },
      request: new Request('https://app.example.test/api/auth/logout'),
      ts: '2026-04-22T00:00:00.000Z',
    })
    const ev = emittedEvents()[0]
    expect(ev.ts).toBe('2026-04-22T00:00:00.000Z')
  })

  it('extracts method, path (sans query), user-agent and request-id from a Request', () => {
    recordSecurityEvent({
      event: 'auth.login.failed',
      outcome: 'failure',
      actor: { source: 'oidc' },
      request: new Request(
        'https://app.example.test/api/auth/callback?code=abc&state=xyz',
        {
          method: 'GET',
          headers: {
            'user-agent': 'TestAgent/1.0',
            'x-request-id': 'req-42',
          },
        },
      ),
    })
    const ev = emittedEvents()[0]
    expect(ev.request).toEqual({
      method: 'GET',
      path: '/api/auth/callback',
      userAgent: 'TestAgent/1.0',
      requestId: 'req-42',
    })
  })

  it('does not treat request-shaped plain objects as Request instances', () => {
    const getHeader = vi.fn(() => 'unexpected')
    const requestLike = {
      headers: { get: getHeader },
      method: 'GET',
      path: '/already-normalized?code=abc#fragment',
      requestId: 'req-plain',
      userAgent: 'PlainAgent/1.0',
      url: 'https://app.example.test/should-not-be-used?code=abc&state=xyz',
    } as SecurityEventRequest & {
      headers: { get: typeof getHeader }
      url: string
    }

    recordSecurityEvent({
      event: 'auth.login.failed',
      outcome: 'failure',
      actor: { source: 'oidc' },
      request: requestLike,
    })
    const ev = emittedEvents()[0]
    expect(getHeader).not.toHaveBeenCalled()
    expect(ev.request).toEqual({
      method: 'GET',
      path: '/already-normalized',
      requestId: 'req-plain',
      userAgent: 'PlainAgent/1.0',
    })
    expect((ev.request as Record<string, unknown>).url).toBeUndefined()
  })

  it('omits userAgent and requestId when those headers are absent', () => {
    recordSecurityEvent({
      event: 'auth.logout',
      outcome: 'success',
      actor: { source: 'anonymous' },
      request: new Request('https://app.example.test/api/auth/logout'),
    })
    const ev = emittedEvents()[0]
    expect((ev.request as Record<string, unknown>).userAgent).toBeUndefined()
    expect((ev.request as Record<string, unknown>).requestId).toBeUndefined()
  })

  it('strips top-level detail keys that match the deny-list', () => {
    recordSecurityEvent({
      event: 'auth.login.failed',
      outcome: 'failure',
      actor: { source: 'oidc' },
      request: new Request('https://app.example.test/api/auth/callback'),
      detail: {
        reason: 'token_exchange_failed',
        access_token: 'should-be-stripped',
        ID_TOKEN: 'should-be-stripped',
        clientSecret: 'should-be-stripped',
        Password: 'should-be-stripped',
        code: 'should-be-stripped',
        authorizationCode: 'should-be-stripped',
        code_verifier: 'should-be-stripped',
        state: 'should-be-stripped',
        nonce: 'should-be-stripped',
        tokenLifetimeSeconds: 300,
        secretariat: 'safe-field-name',
        passwordless: true,
        errorName: 'TokenExchangeError',
      },
    })
    const ev = emittedEvents()[0]
    expect(ev.detail).toEqual({
      reason: 'token_exchange_failed',
      tokenLifetimeSeconds: 300,
      secretariat: 'safe-field-name',
      passwordless: true,
      errorName: 'TokenExchangeError',
    })
    expect(
      emittedRedactionBreadcrumbs().map(breadcrumb => breadcrumb.detailKey),
    ).toEqual([
      'access_token',
      'ID_TOKEN',
      'clientSecret',
      'Password',
      'code',
      'authorizationCode',
      'code_verifier',
      'state',
      'nonce',
    ])
    expect(emittedRedactionBreadcrumbs()[0]).toMatchObject({
      auditEvent: 'auth.login.failed',
      actorSource: 'oidc',
      breadcrumb: 'detail-key-redacted',
      channel: 'security-audit',
    })
  })

  it('omits detail entirely when every field is denied', () => {
    recordSecurityEvent({
      event: 'auth.login.failed',
      outcome: 'failure',
      actor: { source: 'oidc' },
      request: new Request('https://app.example.test/api/auth/callback'),
      detail: { code: 'x', state: 'y' },
    })
    const ev = emittedEvents()[0]
    expect(ev.detail).toBeUndefined()
  })

  it('does not throw when JSON.stringify throws (circular ref)', () => {
    const circular: Record<string, unknown> = { reason: 'jwt_verify_failed' }
    circular.self = circular
    expect(() =>
      recordSecurityEvent({
        event: 'auth.token.rejected',
        outcome: 'failure',
        actor: { source: 'mcp' },
        request: new Request('https://app.example.test/api/mcp'),
        // Force a circular reference into detail to provoke JSON.stringify.
        detail: circular,
      } as Parameters<typeof recordSecurityEvent>[0]),
    ).not.toThrow()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const errorCall = errorSpy.mock.calls[0]
    expect(errorCall).toHaveLength(4)
    expect(errorCall?.slice(0, 3)).toEqual([
      '[security-audit] failed to record event',
      'auth.token.rejected',
      'mcp',
    ])
    const errorMessage = errorCall?.[3]
    expect(typeof errorMessage).toBe('string')
    expect((errorMessage as string).length).toBeGreaterThan(0)
  })

  it('accepts a pre-normalized request shape', () => {
    recordSecurityEvent({
      event: 'auth.csrf.rejected',
      outcome: 'failure',
      actor: { source: 'oidc' },
      request: { method: 'POST', path: '/api/owners' },
    })
    const ev = emittedEvents()[0]
    expect(ev.request).toEqual({ method: 'POST', path: '/api/owners' })
  })

  it('strips query and fragment from pre-normalized request paths', () => {
    recordSecurityEvent({
      event: 'auth.csrf.rejected',
      outcome: 'failure',
      actor: { source: 'oidc' },
      request: {
        method: 'POST',
        path: '/api/owners?code=abc&state=xyz#token',
        requestId: 'req-99',
        userAgent: 'TestAgent/2.0',
      },
    })
    const ev = emittedEvents()[0]
    expect(ev.request).toEqual({
      method: 'POST',
      path: '/api/owners',
      requestId: 'req-99',
      userAgent: 'TestAgent/2.0',
    })
  })
})
