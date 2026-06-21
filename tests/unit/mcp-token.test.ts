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
        /employeeHsaId/.test(e.message),
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
        /employeeHsaId/.test(e.message),
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
        /HSA-id/.test(e.message),
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
        e.status === 401 &&
        /jwks_uri/.test(e.message),
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
        e.status === 401 &&
        /unsupported JWKS URI protocol/.test(e.message),
    )
    expect(createRemoteJWKSetMock).not.toHaveBeenCalled()
    expect(jwtVerifyMock).not.toHaveBeenCalled()
  })

  it('wraps issuer-mismatch verify failures as McpAuthError(401)', async () => {
    getAuthConfigMock.mockReturnValue({
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockRejectedValue(new Error('unexpected "iss" claim value'))

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer wrong.issuer.token' },
        }),
      ),
    ).rejects.toSatisfy(e => e instanceof McpAuthError && e.status === 401)
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
    jwtVerifyMock.mockRejectedValue(new Error('unexpected "aud" claim value'))

    const { verifyMcpBearerToken, McpAuthError } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(
        new Request('http://x/', {
          headers: { authorization: 'Bearer wrong.audience.token' },
        }),
      ),
    ).rejects.toSatisfy(e => e instanceof McpAuthError && e.status === 401)
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'wrong.audience.token',
      { kind: 'jwks' },
      expect.objectContaining({
        audience: 'kravhantering-app',
      }),
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
    expect((events[0].actor as Record<string, unknown>).clientId).toBe(
      'mcp-cli',
    )
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

  it('emits auth.token.rejected with reason=jwt_verify_failed and errorName', async () => {
    class JWSSignatureVerificationFailed extends Error {
      override name = 'JWSSignatureVerificationFailed'
    }
    jwtVerifyMock.mockRejectedValue(
      new JWSSignatureVerificationFailed('bad sig'),
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
    expect(events[0].detail).toEqual({
      reason: 'jwt_verify_failed',
      errorName: 'JWSSignatureVerificationFailed',
    })
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
