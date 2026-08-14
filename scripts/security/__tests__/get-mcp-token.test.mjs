import { describe, expect, it, vi } from 'vitest'
import {
  buildTokenEndpoint,
  createClientCredentialsBody,
  fetchMcpToken,
  normalizeIssuerUrl,
  parseAccessTokenPayload,
  validateMcpTokenShape,
} from '../get-mcp-token.mjs'

function encodedJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function serviceToken(overrides = {}, headerOverrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  return [
    encodedJson({ alg: 'RS256', typ: 'at+jwt', ...headerOverrides }),
    encodedJson({
      aud: 'kravhantering-app',
      client_id: 'client-id',
      employeeHsaId: 'SE5560000001-mcp1',
      exp: now + 300,
      iat: now,
      roles: ['Admin'],
      scope: 'kravhantering:mcp',
      sub: 'service-account-client-id',
      ...overrides,
    }),
    'signature',
  ].join('.')
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('get-mcp-token', () => {
  it('builds the Keycloak client-credentials token endpoint', () => {
    expect(buildTokenEndpoint('http://localhost:8080/realms/example/')).toBe(
      'http://localhost:8080/realms/example/protocol/openid-connect/token',
    )
  })

  it('rejects missing or malformed issuer URLs', () => {
    expect(() => normalizeIssuerUrl('')).toThrow(
      'AUTH_OIDC_ISSUER_URL is required',
    )
    expect(() => normalizeIssuerUrl('not a url')).toThrow(
      'AUTH_OIDC_ISSUER_URL must be a valid URL',
    )
  })

  it('encodes the client credentials request body', () => {
    const body = createClientCredentialsBody({
      clientId: 'kravhantering-mcp',
      clientSecret: 'dev-only-mcp-secret',
      requiredScopes: 'kravhantering:mcp requirements:read',
    })

    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_id')).toBe('kravhantering-mcp')
    expect(body.get('client_secret')).toBe('dev-only-mcp-secret')
    expect(body.get('scope')).toBe('kravhantering:mcp requirements:read')
  })

  it('posts credentials and returns only the access token', async () => {
    const token = serviceToken()
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: token,
        expires_in: 300,
        token_type: 'Bearer',
      }),
    )

    await expect(
      fetchMcpToken({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        fetchImpl,
        issuerUrl: 'http://localhost:8080/realms/dev',
        requiredScopes: 'kravhantering:mcp',
      }),
    ).resolves.toBe(token)

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8080/realms/dev/protocol/openid-connect/token',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init?.body).toBeInstanceOf(URLSearchParams)
    expect(init?.headers).toMatchObject({
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('times out token endpoint requests', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }),
      )

      const token = fetchMcpToken({
        clientId: 'client-id',
        fetchImpl,
        requiredScopes: 'kravhantering:mcp',
        timeoutMs: 10,
      })
      const expectation = expect(token).rejects.toThrow(
        'Token endpoint request timed out after 10 ms',
      )
      await vi.advanceTimersByTimeAsync(10)

      await expectation
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects token endpoint errors without echoing response bodies', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('client_secret=dev-only-mcp-secret', { status: 401 }),
    )

    await expect(
      fetchMcpToken({
        clientSecret: 'dev-only-mcp-secret',
        fetchImpl,
        clientId: 'client-id',
        requiredScopes: 'kravhantering:mcp',
      }),
    ).rejects.toThrow('Token endpoint returned HTTP 401')
    await expect(
      fetchMcpToken({
        clientSecret: 'dev-only-mcp-secret',
        fetchImpl,
        clientId: 'client-id',
        requiredScopes: 'kravhantering:mcp',
      }),
    ).rejects.not.toThrow('dev-only-mcp-secret')
  })

  it('rejects a non-JSON token endpoint response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('not-json', {
          headers: { 'content-type': 'application/json' },
        }),
    )

    await expect(
      fetchMcpToken({
        clientId: 'client-id',
        fetchImpl,
        requiredScopes: 'kravhantering:mcp',
      }),
    ).rejects.toThrow('Token endpoint did not return valid JSON')
  })

  it('requires an available fetch implementation', async () => {
    await expect(fetchMcpToken({ fetchImpl: null })).rejects.toThrow(
      'fetch is not available',
    )
  })

  it('rejects malformed token payloads', () => {
    expect(() => parseAccessTokenPayload(null)).toThrow(
      'Token endpoint did not return a JSON object',
    )
    expect(() => parseAccessTokenPayload({ access_token: '' })).toThrow(
      'Token endpoint response did not include access_token',
    )
  })

  it('rejects an ID-token-shaped response before printing it', () => {
    expect(() =>
      validateMcpTokenShape(serviceToken({}, { typ: 'JWT' }), {
        clientId: 'client-id',
        requiredScopes: 'kravhantering:mcp',
      }),
    ).toThrow('access-token contract: typ_invalid')
  })

  it.each([
    [
      'wrong client',
      serviceToken({ client_id: 'browser-app' }),
      'client_id_invalid',
    ],
    [
      'conflicting authorized party',
      serviceToken({ azp: 'browser-app' }),
      'client_id_invalid',
    ],
    ['missing subject', serviceToken({ sub: undefined }), 'subject_invalid'],
    [
      'missing expiration',
      serviceToken({ exp: undefined }),
      'expiration_invalid',
    ],
    [
      'missing issued-at time',
      serviceToken({ iat: undefined }),
      'issued_at_invalid',
    ],
    ['wrong audience', serviceToken({ aud: 'other-api' }), 'audience_invalid'],
    ['missing scope', serviceToken({ scope: undefined }), 'scope_invalid'],
    [
      'wrong scope',
      serviceToken({ scope: 'requirements:read' }),
      'scope_invalid',
    ],
    [
      'malformed HSA-id',
      serviceToken({ employeeHsaId: 'private-value' }),
      'employee_hsa_id_invalid',
    ],
    [
      'overlong HSA-id',
      serviceToken({ employeeHsaId: 'SE5560000001-1234567890123456789' }),
      'employee_hsa_id_invalid',
    ],
    [
      'unknown role',
      serviceToken({ roles: ['Admin', 'Owner'] }),
      'roles_invalid',
    ],
    [
      'duplicate roles',
      serviceToken({ roles: ['Admin', 'Admin'] }),
      'roles_invalid',
    ],
    [
      'excessive lifetime',
      serviceToken({
        exp: Math.floor(Date.now() / 1000) + 301,
        iat: Math.floor(Date.now() / 1000),
      }),
      'lifetime_invalid',
    ],
    [
      'expired lifetime',
      serviceToken({
        exp: Math.floor(Date.now() / 1000) - 31,
        iat: Math.floor(Date.now() / 1000) - 300,
      }),
      'lifetime_invalid',
    ],
    ['non-string JWT', null, 'jwt_structure_invalid'],
    ['malformed JWT', 'not-a-jwt', 'jwt_structure_invalid'],
    [
      'malformed JWT header',
      `not-json.${serviceToken().split('.')[1]}.signature`,
      'jwt_header_invalid',
    ],
    [
      'malformed JWT payload',
      `${serviceToken().split('.')[0]}.not-json.signature`,
      'jwt_payload_invalid',
    ],
  ])('rejects a returned token with %s', (_label, token, reason) => {
    expect(() =>
      validateMcpTokenShape(token, {
        clientId: 'client-id',
        requiredScopes: 'kravhantering:mcp',
      }),
    ).toThrow(`access-token contract: ${reason}`)
  })

  it('accepts an array audience containing the API audience', () => {
    const token = serviceToken({ aud: ['account', 'kravhantering-app'] })

    expect(
      validateMcpTokenShape(token, {
        clientId: 'client-id',
        requiredScopes: 'kravhantering:mcp',
      }),
    ).toBe(token)
  })

  it.each([59, 60.5, 901])(
    'rejects an invalid configured maximum age of %s',
    tokenMaxAgeSeconds => {
      expect(() =>
        validateMcpTokenShape(serviceToken(), {
          clientId: 'client-id',
          requiredScopes: 'kravhantering:mcp',
          tokenMaxAgeSeconds,
        }),
      ).toThrow('access-token contract: token_max_age_invalid')
    },
  )

  it('has no implicit MCP client identifier', () => {
    expect(() =>
      createClientCredentialsBody({
        clientId: undefined,
        clientSecret: 'dev-only-mcp-secret',
        requiredScopes: 'kravhantering:mcp',
      }),
    ).toThrow('MCP_CLIENT_ID is required')
  })
})
