import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthConfigMock = vi.fn()
const getOidcConfigurationMock = vi.fn()
const jwtVerifyMock = vi.fn()
const createRemoteJWKSetMock = vi.fn()
const discoveredJwksUri =
  'https://issuer.example.com/protocol/openid-connect/certs'

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => getAuthConfigMock(),
}))

vi.mock('@/lib/auth/oidc', () => ({
  getOidcConfiguration: () => getOidcConfigurationMock(),
}))

vi.mock('jose', () => ({
  jwtVerify: (...args: unknown[]) => jwtVerifyMock(...args),
  createRemoteJWKSet: (...args: unknown[]) => {
    createRemoteJWKSetMock(...args)
    return { kind: 'jwks' }
  },
}))

function mockOidcConfiguration(jwksUri = discoveredJwksUri) {
  getOidcConfigurationMock.mockResolvedValue({
    serverMetadata: () => ({ jwks_uri: jwksUri }),
  })
}

describe('verifyMcpBearerToken', () => {
  beforeEach(() => {
    getAuthConfigMock.mockReset()
    getOidcConfigurationMock.mockReset()
    jwtVerifyMock.mockReset()
    createRemoteJWKSetMock.mockReset()
    mockOidcConfiguration()
  })

  afterEach(async () => {
    const { resetMcpJwksCacheForTests } = await import('@/lib/auth/mcp-token')
    resetMcpJwksCacheForTests()
    vi.unstubAllEnvs()
  })

  it('throws McpAuthError when bearer is missing', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )
    await expect(
      verifyMcpBearerToken(new Request('http://x/')),
    ).rejects.toBeInstanceOf(McpAuthError)
  })

  it('verifies a signed JWT and returns an MCP actor', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'svc-account',
        roles: ['Admin'],
        employeeHsaId: 'SE5560000001-mcp1',
      },
    })

    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    const result = await verifyMcpBearerToken(
      new Request('http://x/', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      }),
    )

    expect(result?.actor).toEqual({
      id: 'svc-account',
      displayName: 'svc-account',
      hsaId: 'SE5560000001-mcp1',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'mcp',
    })
    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(
      new URL(discoveredJwksUri),
    )
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'abc.def.ghi',
      { kind: 'jwks' },
      {
        issuer: 'https://issuer.example.com',
        audience: 'kravhantering-app',
        clockTolerance: 30,
      },
    )
  })

  it('accepts a real HSA-id in employeeHsaId', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'human-sub',
        roles: ['Reviewer'],
        employeeHsaId: 'SE5560000001-reviewer1',
      },
    })

    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    const result = await verifyMcpBearerToken(
      new Request('http://x/', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      }),
    )
    expect(result?.actor.hsaId).toBe('SE5560000001-reviewer1')
  })

  it('rejects when employeeHsaId is missing', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'svc-account', roles: ['Admin'] },
    })
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )
    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer abc.def.ghi' },
        }),
      ),
    ).rejects.toSatisfy(
      e =>
        e instanceof McpAuthError &&
        e.status === 401 &&
        e.message === 'Invalid Bearer token.' &&
        e.reason === 'hsa_id_missing',
    )
  })

  it('rejects another service client when employeeHsaId is missing', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'other-service-account',
        roles: ['Admin'],
        client_id: 'other-client',
      },
    })
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )
    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer abc.def.ghi' },
        }),
      ),
    ).rejects.toSatisfy(
      e =>
        e instanceof McpAuthError &&
        e.status === 401 &&
        e.message === 'Invalid Bearer token.' &&
        e.reason === 'hsa_id_missing',
    )
  })

  it('rejects when employeeHsaId is malformed', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'svc-account',
        roles: ['Admin'],
        employeeHsaId: 'not-an-hsa-id',
      },
    })
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )
    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer abc.def.ghi' },
        }),
      ),
    ).rejects.toSatisfy(
      e =>
        e instanceof McpAuthError &&
        e.status === 401 &&
        e.message === 'Invalid Bearer token.' &&
        e.reason === 'hsa_id_invalid',
    )
  })

  it('wraps verification failures in McpAuthError(401)', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockRejectedValue(new Error('bad signature'))

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer nope' },
        }),
      ),
    ).rejects.toSatisfy(e => e instanceof McpAuthError && e.status === 401)
  })

  it('rejects when OIDC discovery does not expose jwks_uri', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    getOidcConfigurationMock.mockResolvedValue({
      serverMetadata: () => ({}),
    })

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer abc.def.ghi' },
        }),
      ),
    ).rejects.toSatisfy(
      e =>
        e instanceof McpAuthError &&
        e.status === 500 &&
        e.message === 'Authentication failed.' &&
        e.reason === 'jwks_configuration_invalid',
    )
  })

  it('rejects OIDC discovery jwks_uri with unsupported protocol', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    mockOidcConfiguration('file:///tmp/jwks.json')

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer abc.def.ghi' },
        }),
      ),
    ).rejects.toSatisfy(
      e =>
        e instanceof McpAuthError &&
        e.status === 500 &&
        e.message === 'Authentication failed.' &&
        e.reason === 'jwks_configuration_invalid',
    )
    expect(createRemoteJWKSetMock).not.toHaveBeenCalled()
    expect(jwtVerifyMock).not.toHaveBeenCalled()
  })

  it('rejects malformed OIDC discovery jwks_uri values', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    mockOidcConfiguration('not a URL')

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer abc.def.ghi' },
        }),
      ),
    ).rejects.toSatisfy(
      error =>
        error instanceof McpAuthError &&
        error.status === 500 &&
        error.message === 'Authentication failed.' &&
        error.reason === 'jwks_configuration_invalid',
    )
    expect(createRemoteJWKSetMock).not.toHaveBeenCalled()
  })

  it('allows the development HTTP JWKS endpoint explicitly', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'http://localhost:8080/realms/dev',
      apiAudience: 'kravhantering-app',
    })
    mockOidcConfiguration('http://localhost:8080/realms/dev/certs')
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'svc',
        employeeHsaId: 'SE5560000001-mcp1',
        roles: [],
      },
    })

    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    await verifyMcpBearerToken(
      new Request('http://x/', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      }),
    )

    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(
      new URL('http://localhost:8080/realms/dev/certs'),
    )
  })

  it('reuses a matching issuer and JWKS discovery result', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'svc',
        employeeHsaId: 'SE5560000001-mcp1',
        roles: [],
      },
    })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    const request = () =>
      new Request('http://x/', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      })

    await verifyMcpBearerToken(request())
    await verifyMcpBearerToken(request())

    expect(createRemoteJWKSetMock).toHaveBeenCalledOnce()
    expect(jwtVerifyMock).toHaveBeenCalledTimes(2)
  })

  it('accepts azp client identity and an authenticated HSA actor without sub', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: {
        azp: 'automation-client',
        employeeHsaId: 'SE5560000001-mcp1',
        scope: '  mcp:read   mcp:write  ',
      },
    })
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    const result = await verifyMcpBearerToken(
      new Request('http://x/', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      }),
    )

    expect(result.actor).toMatchObject({
      displayName: '',
      id: null,
      isAuthenticated: false,
    })
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('automation-client'),
    )
    infoSpy.mockRestore()
  })

  it('sanitizes non-Error token verification failures', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockRejectedValue('invalid-signature-value')
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer abc.def.ghi' },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'Invalid Bearer token.',
        reason: 'token_verification_failed',
        status: 401,
      }),
    )
  })

  it('wraps issuer-mismatch verify failures as McpAuthError(401)', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    const issuerError = Object.assign(
      new Error('unexpected "iss" claim value for https://private.issuer'),
      { claim: 'iss', code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' },
    )
    jwtVerifyMock.mockRejectedValue(issuerError)

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer wrong.issuer.token' },
        }),
      ),
    ).rejects.toSatisfy(
      e =>
        e instanceof McpAuthError &&
        e.status === 401 &&
        e.message === 'Invalid Bearer token.' &&
        e.reason === 'token_issuer_invalid',
    )
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'wrong.issuer.token',
      { kind: 'jwks' },
      expect.objectContaining({
        issuer: 'https://issuer.example.com',
      }),
    )
  })

  it('wraps audience-mismatch verify failures as McpAuthError(401)', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    const audienceError = Object.assign(
      new Error('unexpected "aud" claim value kravhantering-private'),
      { claim: 'aud', code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' },
    )
    jwtVerifyMock.mockRejectedValue(audienceError)

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer wrong.audience.token' },
        }),
      ),
    ).rejects.toSatisfy(
      e =>
        e instanceof McpAuthError &&
        e.status === 401 &&
        e.message === 'Invalid Bearer token.' &&
        e.reason === 'token_audience_invalid',
    )
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'wrong.audience.token',
      { kind: 'jwks' },
      expect.objectContaining({
        audience: 'kravhantering-app',
      }),
    )
  })

  it('normalizes discovery failures without exposing issuer or network details', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://private.issuer',
      apiAudience: 'kravhantering-app',
    })
    getOidcConfigurationMock.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.4 for https://private.issuer'),
    )
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer secret.discovery.token' },
        }),
      ),
    ).rejects.toSatisfy(
      error =>
        error instanceof McpAuthError &&
        error.status === 503 &&
        error.message === 'Authentication service unavailable.' &&
        error.reason === 'oidc_discovery_failed' &&
        !error.message.includes('private.issuer') &&
        !(error.stack ?? '').includes('private.issuer'),
    )
  })

  it('normalizes remote JWKS network failures without exposing dependency text', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockRejectedValue(
      new TypeError('fetch failed for jwks.internal.example'),
    )
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer secret.jwks.token' },
        }),
      ),
    ).rejects.toSatisfy(
      error =>
        error instanceof McpAuthError &&
        error.status === 503 &&
        error.message === 'Authentication service unavailable.' &&
        error.reason === 'jwks_unavailable' &&
        !error.message.includes('jwks.internal.example') &&
        !(error.stack ?? '').includes('jwks.internal.example'),
    )
  })

  it('keeps unrelated payload TypeErrors classified as token verification failures', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    const payload = {
      sub: 'svc-account',
      employeeHsaId: 'SE5560000001-mcp1',
    }
    Object.defineProperty(payload, 'roles', {
      get: () => {
        throw new TypeError('unrelated payload extraction failure')
      },
    })
    jwtVerifyMock.mockResolvedValue({ payload })
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer valid.jwt.token' },
        }),
      ),
    ).rejects.toSatisfy(
      error =>
        error instanceof McpAuthError &&
        error.status === 401 &&
        error.message === 'Invalid Bearer token.' &&
        error.reason === 'token_verification_failed',
    )
  })

  it('contains authentication configuration failures behind a stable contract', async () => {
    getAuthConfigMock.mockImplementation(() => {
      throw new Error('AUTH_ISSUER_URL exposes https://private.issuer')
    })
    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer secret.config.token' },
        }),
      ),
    ).rejects.toSatisfy(
      error =>
        error instanceof McpAuthError &&
        error.status === 500 &&
        error.message === 'Authentication failed.' &&
        error.reason === 'auth_configuration_invalid' &&
        !error.message.includes('private.issuer') &&
        !(error.stack ?? '').includes('private.issuer'),
    )
  })
})

describe('verifyMcpBearerToken security audit events', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getAuthConfigMock.mockReset()
    getOidcConfigurationMock.mockReset()
    jwtVerifyMock.mockReset()
    createRemoteJWKSetMock.mockReset()
    mockOidcConfiguration()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
  })

  afterEach(async () => {
    infoSpy.mockRestore()
    const { resetMcpJwksCacheForTests } = await import('@/lib/auth/mcp-token')
    resetMcpJwksCacheForTests()
    vi.unstubAllEnvs()
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

  it('uses azp client identity while representing a missing subject as unauthenticated', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        azp: 'mcp-client',
        employeeHsaId: 'SE5560000001-mcp1',
        roles: [],
        scope: '  mcp:read   ',
      },
    })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    const result = await verifyMcpBearerToken(
      new Request('http://x/', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      }),
    )

    expect(result.actor).toMatchObject({
      id: null,
      displayName: '',
      isAuthenticated: false,
    })
    expect(emittedSecurityEvents()).toContainEqual(
      expect.objectContaining({
        actor: expect.objectContaining({
          clientId: 'mcp-client',
          source: 'mcp',
        }),
        event: 'auth.mcp.token.accepted',
      }),
    )
  })

  it('emits auth.token.rejected with reason=bearer_missing', async () => {
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    await expect(
      verifyMcpBearerToken(new Request('http://x/api/mcp')),
    ).rejects.toBeDefined()
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.token.rejected')
    expect((events[0].detail as Record<string, unknown>).reason).toBe(
      'bearer_missing',
    )
  })

  it('emits auth.token.rejected with reason=hsa_id_missing', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'svc', roles: ['Admin'], client_id: 'mcp-cli' },
    })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    await expect(
      verifyMcpBearerToken(
        new Request('http://x/api/mcp', {
          headers: { authorization: 'Bearer x.y.z' },
        }),
      ),
    ).rejects.toBeDefined()
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.token.rejected')
    expect((events[0].detail as Record<string, unknown>).reason).toBe(
      'hsa_id_missing',
    )
    expect(events[0].actor).toEqual({ source: 'mcp' })
    expect(JSON.stringify(events[0])).not.toContain('mcp-cli')
  })

  it('emits auth.token.rejected with reason=hsa_id_invalid', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'svc', roles: ['Admin'], employeeHsaId: 'garbage' },
    })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    await expect(
      verifyMcpBearerToken(
        new Request('http://x/api/mcp', {
          headers: { authorization: 'Bearer x.y.z' },
        }),
      ),
    ).rejects.toBeDefined()
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('hsa_id_invalid')
  })

  it('emits only an allowlisted reason for verifier failures', async () => {
    class JWSSignatureVerificationFailed extends Error {
      override name = 'JWSSignatureVerificationFailed'
    }
    jwtVerifyMock.mockRejectedValue(
      new JWSSignatureVerificationFailed(
        'bad sig for SE5560000001-private and issuer.internal',
      ),
    )
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    await expect(
      verifyMcpBearerToken(
        new Request('http://x/api/mcp', {
          headers: { authorization: 'Bearer nope' },
        }),
      ),
    ).rejects.toBeDefined()
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.token.rejected')
    expect(events[0].detail).toEqual({ reason: 'token_verification_failed' })
    expect(JSON.stringify(events)).not.toMatch(
      /SE5560000001-private|issuer\.internal|JWSSignatureVerificationFailed|bad sig|nope/,
    )
  })

  it('emits auth.mcp.token.accepted on a successful verification', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'svc',
        roles: ['Admin'],
        employeeHsaId: 'SE5560000001-mcp1',
        client_id: 'kravhantering-mcp',
        scope: 'mcp:read mcp:write',
      },
    })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    const result = await verifyMcpBearerToken(
      new Request('http://x/api/mcp', {
        headers: { authorization: 'Bearer x.y.z' },
      }),
    )
    expect(result?.actor.source).toBe('mcp')
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.mcp.token.accepted')
    expect(events[0].outcome).toBe('success')
    expect(events[0].actor).toEqual({
      source: 'mcp',
      sub: 'svc',
      hsaId: 'SE5560000001-mcp1',
      clientId: 'kravhantering-mcp',
    })
    expect(events[0].detail).toEqual({
      roles: ['Admin'],
      scopes: ['mcp:read', 'mcp:write'],
    })
  })

  it('grants no roles for non-array role claims', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'svc',
        roles: 'Admin Reviewer',
        employeeHsaId: 'SE5560000001-mcp1',
        client_id: 'kravhantering-mcp',
      },
    })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    const result = await verifyMcpBearerToken(
      new Request('http://x/api/mcp', {
        headers: { authorization: 'Bearer x.y.z' },
      }),
    )
    expect(result.actor.roles).toEqual([])
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.mcp.token.accepted')
    expect(events[0].detail).toEqual({
      roles: [],
      scopes: [],
    })
  })
})
