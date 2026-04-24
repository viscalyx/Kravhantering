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
    expect(typeof ev.ts).toBe('string')
    expect(() => new Date(ev.ts as string).toISOString()).not.toThrow()
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
      path: '/already-normalized',
      url: 'https://app.example.test/should-not-be-used?code=abc&state=xyz',
    } as unknown as SecurityEventRequest

    recordSecurityEvent({
      event: 'auth.login.failed',
      outcome: 'failure',
      actor: { source: 'oidc' },
      request: requestLike,
    })
    const ev = emittedEvents()[0]
    expect(getHeader).not.toHaveBeenCalled()
    expect(ev.request).toMatchObject({
      method: 'GET',
      path: '/already-normalized',
      url: 'https://app.example.test/should-not-be-used?code=abc&state=xyz',
    })
    expect((ev.request as Record<string, unknown>).userAgent).toBeUndefined()
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
        detail: circular as Record<string, never>,
      }),
    ).not.toThrow()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]).toEqual([
      '[security-audit] failed to record event',
      'auth.token.rejected',
      'mcp',
      expect.stringContaining('Converting circular structure to JSON'),
    ])
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
})
