import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthConfigMock = vi.fn()
const getMcpAuthConfigMock = vi.fn()
const getOidcConfigurationMock = vi.fn()
const jwtVerifyMock = vi.fn()
const createRemoteJWKSetMock = vi.fn()

const NOW_SECONDS = 2_000_000_000
const DISCOVERED_JWKS_URI =
  'https://issuer.example.com/protocol/openid-connect/certs'

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => getAuthConfigMock(),
  getMcpAuthConfig: () => getMcpAuthConfigMock(),
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

interface TokenResultOptions {
  omit?: readonly string[]
  payload?: Record<string, unknown>
  protectedHeader?: Record<string, unknown>
}

function validTokenResult(options: TokenResultOptions = {}) {
  const payload: Record<string, unknown> = {
    client_id: 'kravhantering-mcp',
    employeeHsaId: 'SE5560000001-mcp1',
    exp: NOW_SECONDS + 300,
    iat: NOW_SECONDS,
    roles: ['Admin'],
    scope: 'kravhantering:mcp requirements:read',
    sub: 'svc-account',
    ...options.payload,
  }
  for (const key of options.omit ?? []) delete payload[key]
  return {
    payload,
    protectedHeader: {
      alg: 'RS256',
      typ: 'at+jwt',
      ...options.protectedHeader,
    },
  }
}

function mcpRequest(token = 'abc.def.ghi'): Request {
  return new Request('https://example.test/api/mcp', {
    headers: { authorization: `Bearer ${token}` },
  })
}

function mockOidcConfiguration(jwksUri = DISCOVERED_JWKS_URI): void {
  getOidcConfigurationMock.mockResolvedValue({
    serverMetadata: () => ({ jwks_uri: jwksUri }),
  })
}

function setValidConfiguration(): void {
  getAuthConfigMock.mockReturnValue({
    apiAudience: 'kravhantering-app',
    issuerUrl: 'https://issuer.example.com',
  })
  getMcpAuthConfigMock.mockReturnValue({
    clientId: 'kravhantering-mcp',
    requiredScopes: ['kravhantering:mcp', 'requirements:read'],
    rolesClaim: 'roles',
    tokenMaxAgeSeconds: 300,
  })
}

async function expectRejected(reason: string): Promise<void> {
  const { McpAuthError, verifyMcpBearerToken } = await import(
    '@/lib/auth/mcp-token'
  )
  await expect(verifyMcpBearerToken(mcpRequest())).rejects.toSatisfy(
    error =>
      error instanceof McpAuthError &&
      error.status === 401 &&
      error.message === 'Invalid Bearer token.' &&
      error.reason === reason,
  )
}

describe('verifyMcpBearerToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    getAuthConfigMock.mockReset()
    getMcpAuthConfigMock.mockReset()
    getOidcConfigurationMock.mockReset()
    jwtVerifyMock.mockReset()
    createRemoteJWKSetMock.mockReset()
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000)
    setValidConfiguration()
    mockOidcConfiguration()
  })

  afterEach(async () => {
    const { resetMcpJwksCacheForTests } = await import('@/lib/auth/mcp-token')
    resetMcpJwksCacheForTests()
    vi.restoreAllMocks()
  })

  it('rejects a missing bearer before discovery or verification', async () => {
    const { McpAuthError, verifyMcpBearerToken } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(new Request('https://example.test/api/mcp')),
    ).rejects.toSatisfy(
      error =>
        error instanceof McpAuthError &&
        error.status === 401 &&
        error.reason === 'bearer_missing',
    )
    expect(getOidcConfigurationMock).not.toHaveBeenCalled()
    expect(jwtVerifyMock).not.toHaveBeenCalled()
  })

  it('accepts a valid short-lived service access token', async () => {
    jwtVerifyMock.mockResolvedValue(validTokenResult())
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await expect(verifyMcpBearerToken(mcpRequest())).resolves.toEqual({
      actor: {
        displayName: 'svc-account',
        hsaId: 'SE5560000001-mcp1',
        id: 'svc-account',
        isAuthenticated: true,
        roles: ['Admin'],
        source: 'mcp',
      },
    })
    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(
      new URL(DISCOVERED_JWKS_URI),
    )
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'abc.def.ghi',
      { kind: 'jwks' },
      {
        audience: 'kravhantering-app',
        clockTolerance: 30,
        issuer: 'https://issuer.example.com',
      },
    )
  })

  it.each([
    [
      'missing expiry',
      validTokenResult({ omit: ['exp'] }),
      'token_exp_invalid',
    ],
    [
      'non-numeric expiry',
      validTokenResult({ payload: { exp: 'soon' } }),
      'token_exp_invalid',
    ],
    [
      'missing subject',
      validTokenResult({ omit: ['sub'] }),
      'token_subject_invalid',
    ],
    [
      'blank subject',
      validTokenResult({ payload: { sub: '   ' } }),
      'token_subject_invalid',
    ],
    [
      'missing issue time',
      validTokenResult({ omit: ['iat'] }),
      'token_iat_invalid',
    ],
    [
      'non-numeric issue time',
      validTokenResult({ payload: { iat: 'now' } }),
      'token_iat_invalid',
    ],
    [
      'future issue time beyond tolerance',
      validTokenResult({ payload: { iat: NOW_SECONDS + 31 } }),
      'token_iat_invalid',
    ],
    [
      'missing access-token type',
      validTokenResult({ protectedHeader: { typ: undefined } }),
      'token_class_invalid',
    ],
    [
      'ID-token type',
      validTokenResult({ protectedHeader: { typ: 'JWT' } }),
      'token_class_invalid',
    ],
    [
      'missing client',
      validTokenResult({ omit: ['client_id'] }),
      'token_client_invalid',
    ],
    [
      'wrong client',
      validTokenResult({ payload: { client_id: 'browser-app' } }),
      'token_client_invalid',
    ],
    [
      'azp-only client',
      validTokenResult({
        omit: ['client_id'],
        payload: { azp: 'kravhantering-mcp' },
      }),
      'token_client_invalid',
    ],
    [
      'conflicting authorized party',
      validTokenResult({ payload: { azp: 'browser-app' } }),
      'token_client_invalid',
    ],
    [
      'missing scope',
      validTokenResult({ omit: ['scope'] }),
      'token_scope_invalid',
    ],
    [
      'array scope',
      validTokenResult({
        payload: { scope: ['kravhantering:mcp', 'requirements:read'] },
      }),
      'token_scope_invalid',
    ],
    [
      'scp-only scope',
      validTokenResult({
        omit: ['scope'],
        payload: { scp: 'kravhantering:mcp requirements:read' },
      }),
      'token_scope_invalid',
    ],
    [
      'partial scope',
      validTokenResult({ payload: { scope: 'kravhantering:mcp' } }),
      'token_scope_invalid',
    ],
    [
      'excessive current age',
      validTokenResult({
        payload: { exp: NOW_SECONDS + 1, iat: NOW_SECONDS - 331 },
      }),
      'token_lifetime_invalid',
    ],
    [
      'excessive declared lifetime',
      validTokenResult({ payload: { exp: NOW_SECONDS + 301 } }),
      'token_lifetime_invalid',
    ],
  ] as const)(
    'rejects %s with the stable token contract',
    async (_, result, reason) => {
      jwtVerifyMock.mockResolvedValue(result)
      await expectRejected(reason)
    },
  )

  it.each([
    ['missing', undefined],
    ['empty', []],
    ['non-array', 'Admin'],
    ['non-string entry', ['Admin', 7]],
    ['unknown entry', ['Admin', 'Owner']],
    ['duplicate entry', ['Admin', 'Admin']],
  ] as const)(
    'grants no roles for a %s configured role claim',
    async (_, roles) => {
      getMcpAuthConfigMock.mockReturnValue({
        clientId: 'kravhantering-mcp',
        requiredScopes: ['kravhantering:mcp', 'requirements:read'],
        rolesClaim: 'mcp_roles',
        tokenMaxAgeSeconds: 300,
      })
      jwtVerifyMock.mockResolvedValue(
        validTokenResult({ payload: { mcp_roles: roles, roles: ['Admin'] } }),
      )
      const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

      const result = await verifyMcpBearerToken(mcpRequest())

      expect(result.actor.roles).toEqual([])
    },
  )

  it('reads valid roles only from the configured MCP role claim', async () => {
    getMcpAuthConfigMock.mockReturnValue({
      clientId: 'kravhantering-mcp',
      requiredScopes: ['kravhantering:mcp', 'requirements:read'],
      rolesClaim: 'mcp_roles',
      tokenMaxAgeSeconds: 300,
    })
    jwtVerifyMock.mockResolvedValue(
      validTokenResult({
        payload: {
          mcp_roles: ['Reviewer', 'PrivacyOfficer'],
          roles: ['Admin'],
        },
      }),
    )
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    const result = await verifyMcpBearerToken(mcpRequest())

    expect(result.actor.roles).toEqual(['Reviewer', 'PrivacyOfficer'])
  })

  it.each([
    [
      'missing',
      validTokenResult({ omit: ['employeeHsaId'] }),
      'hsa_id_missing',
    ],
    [
      'malformed',
      validTokenResult({ payload: { employeeHsaId: 'not-an-hsa-id' } }),
      'hsa_id_invalid',
    ],
  ] as const)('rejects a %s employeeHsaId', async (_, result, reason) => {
    jwtVerifyMock.mockResolvedValue(result)
    await expectRejected(reason)
  })

  it('rejects invalid enabled MCP configuration behind a stable contract', async () => {
    getMcpAuthConfigMock.mockImplementation(() => {
      throw new Error('AUTH_MCP_REQUIRED_SCOPES exposes private detail')
    })
    const { McpAuthError, verifyMcpBearerToken } = await import(
      '@/lib/auth/mcp-token'
    )

    await expect(
      verifyMcpBearerToken(mcpRequest('secret.config.token')),
    ).rejects.toSatisfy(
      error =>
        error instanceof McpAuthError &&
        error.status === 500 &&
        error.message === 'Authentication failed.' &&
        error.reason === 'auth_configuration_invalid' &&
        !error.message.includes('private detail'),
    )
    expect(getOidcConfigurationMock).not.toHaveBeenCalled()
  })

  it('rejects a disabled MCP verifier invocation as invalid configuration', async () => {
    getMcpAuthConfigMock.mockReturnValue(null)
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await expect(verifyMcpBearerToken(mcpRequest())).rejects.toMatchObject({
      message: 'Authentication failed.',
      reason: 'auth_configuration_invalid',
      status: 500,
    })
  })

  it.each([
    [
      'issuer mismatch',
      Object.assign(new Error('private issuer'), {
        claim: 'iss',
        code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
      }),
      'token_issuer_invalid',
      401,
    ],
    [
      'audience mismatch',
      Object.assign(new Error('private audience'), {
        claim: 'aud',
        code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
      }),
      'token_audience_invalid',
      401,
    ],
    [
      'signature failure',
      new Error('private signature'),
      'token_verification_failed',
      401,
    ],
    [
      'JWKS network failure',
      new TypeError('private network'),
      'jwks_unavailable',
      503,
    ],
  ] as const)('normalizes %s details', async (_, error, reason, status) => {
    jwtVerifyMock.mockRejectedValue(error)
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await expect(
      verifyMcpBearerToken(mcpRequest('secret.jwt.value')),
    ).rejects.toMatchObject({
      reason,
      status,
    })
  })

  it('normalizes OIDC discovery failures without exposing details', async () => {
    getOidcConfigurationMock.mockRejectedValue(
      new Error('connect to https://private.issuer failed'),
    )
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await expect(verifyMcpBearerToken(mcpRequest())).rejects.toMatchObject({
      message: 'Authentication service unavailable.',
      reason: 'oidc_discovery_failed',
      status: 503,
    })
  })

  it.each([
    ['missing URI', undefined],
    ['malformed URI', 'not a URL'],
    ['unsupported URI', 'file:///tmp/jwks.json'],
  ] as const)('rejects %s JWKS configuration', async (_, jwksUri) => {
    getOidcConfigurationMock.mockResolvedValue({
      serverMetadata: () => ({ jwks_uri: jwksUri }),
    })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await expect(verifyMcpBearerToken(mcpRequest())).rejects.toMatchObject({
      message: 'Authentication failed.',
      reason: 'jwks_configuration_invalid',
      status: 500,
    })
    expect(jwtVerifyMock).not.toHaveBeenCalled()
  })

  it('allows the explicit development HTTP JWKS endpoint', async () => {
    getAuthConfigMock.mockReturnValue({
      apiAudience: 'kravhantering-app',
      issuerUrl: 'http://localhost:8080/realms/dev',
    })
    mockOidcConfiguration('http://localhost:8080/realms/dev/certs')
    jwtVerifyMock.mockResolvedValue(validTokenResult())
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await verifyMcpBearerToken(mcpRequest())

    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(
      new URL('http://localhost:8080/realms/dev/certs'),
    )
  })

  it('reuses a matching issuer and JWKS discovery result', async () => {
    jwtVerifyMock.mockResolvedValue(validTokenResult())
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await verifyMcpBearerToken(mcpRequest())
    await verifyMcpBearerToken(mcpRequest())

    expect(createRemoteJWKSetMock).toHaveBeenCalledOnce()
    expect(jwtVerifyMock).toHaveBeenCalledTimes(2)
  })

  it('audits acceptance only after every token check succeeds', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    jwtVerifyMock
      .mockResolvedValueOnce(
        validTokenResult({ payload: { client_id: 'private-client-value' } }),
      )
      .mockResolvedValueOnce(validTokenResult())
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')

    await expect(
      verifyMcpBearerToken(mcpRequest('secret.invalid.token')),
    ).rejects.toBeDefined()
    await verifyMcpBearerToken(mcpRequest('secret.valid.token'))

    const events = infoSpy.mock.calls.map(call => JSON.parse(String(call[0])))
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      actor: { source: 'mcp' },
      detail: { reason: 'token_client_invalid' },
      event: 'auth.token.rejected',
    })
    expect(events[1]).toMatchObject({
      actor: {
        clientId: 'kravhantering-mcp',
        hsaId: 'SE5560000001-mcp1',
        source: 'mcp',
        sub: 'svc-account',
      },
      detail: {
        roles: ['Admin'],
        scopes: ['kravhantering:mcp', 'requirements:read'],
      },
      event: 'auth.mcp.token.accepted',
    })
    expect(JSON.stringify(events[0])).not.toMatch(
      /private-client-value|secret\.invalid\.token/,
    )
  })
})
