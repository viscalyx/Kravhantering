import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: vi.fn(),
  db: vi.fn(async () => ({})),
}))
vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: state.settings,
}))
vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => ({
    redirectUri: 'https://example.test/api/auth/callback',
  }),
}))
vi.mock('@/lib/db', () => ({ getRequestSqlServerDataSource: state.db }))

const sensitive = 'private-person-secret'
function report() {
  return {
    'csp-report': {
      'document-uri': `https://example.test/en/requirements/${sensitive}?q=${sensitive}#${sensitive}`,
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'inline',
      'original-policy': `script-src 'nonce-${sensitive}'`,
      'script-sample': sensitive,
      referrer: sensitive,
      nested: { password: sensitive },
    },
  }
}
function request(body: unknown = report(), type = 'application/csp-report') {
  return new Request(
    `https://example.test/api/security/csp-reports?q=${sensitive}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': type,
        Cookie: sensitive,
        'User-Agent': sensitive,
        'x-request-id': sensitive,
        'x-kravhantering-client-ip': '192.0.2.1',
      },
      body: JSON.stringify(body),
    },
  )
}

describe('native CSP report receiver', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    state.settings.mockResolvedValue({ cspViolationLoggingEnabled: true })
  })

  it('accepts an anonymous native report and emits only privacy-safe categories', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await import('@/app/api/security/csp-reports/route')
    const response = await POST(request())
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(log).toHaveBeenCalledTimes(1)
    const event = JSON.parse(String(log.mock.calls[0]?.[0]))
    expect(event).toEqual({
      channel: 'security-audit',
      event: 'security.csp.violation_reported',
      actor: { source: 'anonymous' },
      outcome: 'success',
      ts: expect.any(String),
      request: { method: 'POST', path: '/api/security/csp-reports' },
      detail: {
        directive: 'script-src-elem',
        blockedResource: 'inline',
        surface: 'application',
        environment: 'test',
        version: expect.any(String),
      },
    })
    expect(JSON.stringify([log.mock.calls, error.mock.calls])).not.toContain(
      sensitive,
    )
  })
})

function modernReport() {
  return {
    type: 'csp-violation',
    url: sensitive,
    user_agent: sensitive,
    age: 123,
    body: {
      documentURL: `https://example.test/en/requirements/${sensitive}`,
      effectiveDirective: 'script-src-elem',
      blockedURL: 'inline',
      originalPolicy: sensitive,
      sample: sensitive,
      sourceFile: sensitive,
    },
  }
}

describe('CSP report privacy and admission boundaries', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.clearAllMocks()
    state.settings.mockResolvedValue({ cspViolationLoggingEnabled: true })
  })

  it('normalizes modern batches and legacy envelopes identically; ignores unrelated reports', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { POST } = await import('@/app/api/security/csp-reports/route')
    await POST(request())
    await POST(
      request(
        [modernReport(), { type: 'deprecation', body: { secret: sensitive } }],
        'application/reports+json',
      ),
    )
    expect(log).toHaveBeenCalledTimes(2)
    const events = log.mock.calls.map(call => JSON.parse(String(call[0])))
    expect(events[0].detail).toEqual(events[1].detail)
    expect(JSON.stringify(events)).not.toContain(sensitive)
  })

  it('maps arbitrary diagnostic values to fixed unknown categories', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { POST } = await import('@/app/api/security/csp-reports/route')
    await POST(
      request({
        'csp-report': {
          'document-uri': sensitive,
          'effective-directive': sensitive,
          'blocked-uri': sensitive,
        },
      }),
    )
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).detail).toMatchObject({
      directive: 'unknown',
      surface: 'unknown',
      blockedResource: 'unknown',
    })
  })

  it('reads committed settings on each receiver and suppresses queued reports while disabled', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { POST } = await import('@/app/api/security/csp-reports/route')
    state.settings.mockResolvedValue({ cspViolationLoggingEnabled: false })
    const disabled = await POST(request())
    expect(disabled.status).toBe(204)
    expect(await disabled.text()).toBe('')
    expect(log).not.toHaveBeenCalled()
    state.settings.mockResolvedValue({ cspViolationLoggingEnabled: true })
    await POST(request())
    expect(log).toHaveBeenCalledTimes(1)
    state.settings.mockResolvedValue({ cspViolationLoggingEnabled: false })
    await POST(request())
    expect(log).toHaveBeenCalledTimes(1)
    expect(state.settings).toHaveBeenCalledTimes(3)
  })

  it('fails closed with one content-free failure signal per minute', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.settings.mockRejectedValue(new Error(sensitive))
    const { POST } = await import('@/app/api/security/csp-reports/route')
    for (let i = 0; i < 3; i++) {
      const response = await POST(request())
      expect(response.status).toBe(503)
      expect(await response.text()).toBe('')
    }
    expect(log).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warning.mock.calls)).not.toContain(sensitive)
  })

  it.each([
    ['wrong media', report(), 'application/json', 415],
    ['wrong envelope', [], 'application/csp-report', 400],
    ['wrong modern envelope', report(), 'application/reports+json', 400],
    [
      'missing body',
      [{ type: 'csp-violation' }],
      'application/reports+json',
      400,
    ],
    [
      'oversized batch',
      Array.from({ length: 21 }, modernReport),
      'application/reports+json',
      413,
    ],
    [
      'long field',
      { 'csp-report': { sample: 'a'.repeat(4097) } },
      'application/csp-report',
      400,
    ],
  ])('rejects %s before settings work', async (_name, body, media, status) => {
    const { POST } = await import('@/app/api/security/csp-reports/route')
    const response = await POST(request(body, media as string))
    expect(response.status).toBe(status)
    expect(await response.text()).toBe('')
    expect(state.db).not.toHaveBeenCalled()
  })

  it.each([undefined, '1', '999999'])(
    'bounds actual streamed bytes with Content-Length %s',
    async length => {
      const { POST } = await import('@/app/api/security/csp-reports/route')
      const headers = new Headers({ 'content-type': 'application/csp-report' })
      if (length) headers.set('content-length', length)
      const cancel = vi.fn()
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(32_768))
          controller.enqueue(new Uint8Array(32_769))
        },
        cancel,
      })
      const response = await POST(
        new Request('https://example.test/api/security/csp-reports', {
          method: 'POST',
          headers,
          body,
          duplex: 'half',
        } as RequestInit),
      )
      expect(response.status).toBe(413)
      expect(cancel).toHaveBeenCalled()
      expect(state.db).not.toHaveBeenCalled()
    },
  )

  it('accepts exactly 64 KiB and 4096-character fields; rejects malformed JSON privately', async () => {
    const { POST } = await import('@/app/api/security/csp-reports/route')
    const payload = JSON.stringify({
      'csp-report': { sample: 'a'.repeat(4096) },
    }).padEnd(65_536, ' ')
    const make = (body: string) =>
      new Request('https://example.test/api/security/csp-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body,
      })
    expect((await POST(make(payload))).status).toBe(204)
    const bad = await POST(make(`{"${sensitive}`))
    expect(bad.status).toBe(400)
    expect(await bad.text()).toBe('')
  })

  it('counts events in batches and recovers after the window', async () => {
    vi.useFakeTimers()
    const { POST } = await import('@/app/api/security/csp-reports/route')
    for (let i = 0; i < 3; i++)
      expect(
        (
          await POST(
            request(
              Array.from({ length: 20 }, modernReport),
              'application/reports+json',
            ),
          )
        ).status,
      ).toBe(204)
    expect((await POST(request())).status).toBe(429)
    expect(state.settings).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(60_000)
    expect((await POST(request())).status).toBe(204)
    vi.useRealTimers()
  })

  it('bounds source cardinality without eviction and resets it after the window', async () => {
    vi.useFakeTimers()
    const { POST } = await import('@/app/api/security/csp-reports/route')
    for (let i = 1; i <= 64; i++) {
      const req = request([], 'application/reports+json')
      req.headers.set('x-kravhantering-client-ip', `192.0.2.${i}`)
      expect((await POST(req)).status).toBe(204)
    }
    const next = request()
    next.headers.set('x-kravhantering-client-ip', '192.0.2.65')
    expect((await POST(next)).status).toBe(429)
    vi.advanceTimersByTime(60_000)
    expect((await POST(next)).status).toBe(204)
    vi.useRealTimers()
  })

  it('limits total events across sources before another settings read', async () => {
    const { POST } = await import('@/app/api/security/csp-reports/route')
    for (let i = 0; i < 12; i++) {
      const req = request(
        Array.from({ length: 20 }, modernReport),
        'application/reports+json',
      )
      req.headers.set('x-kravhantering-client-ip', `192.0.2.${i + 1}`)
      expect((await POST(req)).status).toBe(204)
    }
    expect((await POST(request())).status).toBe(429)
    expect(state.settings).toHaveBeenCalledTimes(12)
  })

  it('rate-limits malformed request work before any settings read', async () => {
    const { POST } = await import('@/app/api/security/csp-reports/route')
    for (let i = 0; i < 30; i++)
      expect((await POST(request(null))).status).toBe(400)
    expect((await POST(request())).status).toBe(429)
    expect(state.settings).not.toHaveBeenCalled()
  })

  it('times out a stalled native report stream and releases capacity', async () => {
    vi.useFakeTimers()
    const { POST } = await import('@/app/api/security/csp-reports/route')
    const cancel = vi.fn()
    const response = POST(
      new Request('https://example.test/api/security/csp-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: new ReadableStream({ cancel }),
        duplex: 'half',
      } as RequestInit),
    )
    await vi.advanceTimersByTimeAsync(5000)
    expect((await response).status).toBe(408)
    expect(cancel).toHaveBeenCalled()
    expect((await POST(request())).status).toBe(204)
    vi.useRealTimers()
  })
})

it('charges a streamed report crossing the window boundary to the current source budget', async () => {
  vi.useFakeTimers()
  vi.resetModules()
  state.settings.mockResolvedValue({ cspViolationLoggingEnabled: true })
  const { POST } = await import('@/app/api/security/csp-reports/route')
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
  })
  vi.advanceTimersByTime(59_000)
  const pending = POST(
    new Request('https://example.test/api/security/csp-reports', {
      method: 'POST',
      headers: {
        'content-type': 'application/reports+json',
        'x-kravhantering-client-ip': '192.0.2.1',
      },
      body: stream,
      duplex: 'half',
    } as RequestInit),
  )
  vi.advanceTimersByTime(1000)
  for (let i = 0; i < 3; i++)
    await POST(
      request(
        Array.from({ length: 20 }, modernReport),
        'application/reports+json',
      ),
    )
  streamController?.enqueue(
    new TextEncoder().encode(JSON.stringify([modernReport()])),
  )
  streamController?.close()
  expect((await pending).status).toBe(429)
  vi.useRealTimers()
})

it('classifies the public application origin behind an internal reverse-proxy URL', async () => {
  vi.resetModules()
  state.settings.mockResolvedValue({ cspViolationLoggingEnabled: true })
  const log = vi.spyOn(console, 'info').mockImplementation(() => {})
  const { POST } = await import('@/app/api/security/csp-reports/route')
  const body = report()
  body['csp-report']['blocked-uri'] =
    'https://example.test/private-resource?secret=value'
  await POST(
    new Request('http://0.0.0.0:3000/api/security/csp-reports', {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        host: 'spoofed.test',
        origin: 'https://spoofed.test',
      },
      body: JSON.stringify(body),
    }),
  )
  expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).detail).toMatchObject({
    surface: 'application',
    blockedResource: 'same-origin',
  })
})

it('refuses to reuse the native handler for any other REST operation', async () => {
  vi.resetModules()
  vi.clearAllMocks()
  const { POST } = await import('@/app/api/security/csp-reports/route')
  for (const [method, path] of [
    ['POST', '/api/admin/application-settings'],
    ['GET', '/api/security/csp-reports'],
  ]) {
    const response = await POST(
      new Request(`https://example.test${path}`, { method }),
    )
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('')
  }
  expect(state.db).not.toHaveBeenCalled()
})
