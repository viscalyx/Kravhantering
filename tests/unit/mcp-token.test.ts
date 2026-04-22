import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthConfigMock = vi.fn()
const jwtVerifyMock = vi.fn()
const createRemoteJWKSetMock = vi.fn()

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => getAuthConfigMock(),
}))

vi.mock('jose', () => ({
  jwtVerify: (...args: unknown[]) => jwtVerifyMock(...args),
  createRemoteJWKSet: (...args: unknown[]) => {
    createRemoteJWKSetMock(...args)
    return { kind: 'jwks' }
  },
}))

describe('verifyMcpBearerToken', () => {
  beforeEach(() => {
    getAuthConfigMock.mockReset()
    jwtVerifyMock.mockReset()
    createRemoteJWKSetMock.mockReset()
  })

  afterEach(async () => {
    const { resetMcpJwksCacheForTests } = await import('@/lib/auth/mcp-token')
    resetMcpJwksCacheForTests()
  })

  it('returns null when AUTH_ENABLED=false', async () => {
    getAuthConfigMock.mockReturnValue({ enabled: false })
    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    const result = await verifyMcpBearerToken(
      new Request('http://x/', { headers: { authorization: 'Bearer x' } }),
    )
    expect(result).toBeNull()
  })

  it('throws McpAuthError when bearer is missing and auth is enabled', async () => {
    getAuthConfigMock.mockReturnValue({
      enabled: true,
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
      enabled: true,
      issuerUrl: 'https://issuer.example.com',
      apiAudience: 'kravhantering-app',
    })
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'svc-account', roles: ['Admin', 'Steward'] },
    })

    const { verifyMcpBearerToken } = await import('@/lib/auth/mcp-token')
    const result = await verifyMcpBearerToken(
      new Request('http://x/', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      }),
    )

    expect(result?.actor).toEqual({
      id: 'svc-account',
      isAuthenticated: true,
      roles: ['Admin', 'Steward'],
      source: 'mcp',
    })
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'abc.def.ghi',
      { kind: 'jwks' },
      { issuer: 'https://issuer.example.com', audience: 'kravhantering-app' },
    )
  })

  it('wraps verification failures in McpAuthError(401)', async () => {
    getAuthConfigMock.mockReturnValue({
      enabled: true,
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
})
