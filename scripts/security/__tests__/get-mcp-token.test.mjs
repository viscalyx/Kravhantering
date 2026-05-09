import { describe, expect, it, vi } from 'vitest'
import {
  buildTokenEndpoint,
  createClientCredentialsBody,
  fetchMcpToken,
  normalizeIssuerUrl,
  parseAccessTokenPayload,
} from '../get-mcp-token.mjs'

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
    })

    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_id')).toBe('kravhantering-mcp')
    expect(body.get('client_secret')).toBe('dev-only-mcp-secret')
  })

  it('posts credentials and returns only the access token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: 'eyJ.test.token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    )

    await expect(
      fetchMcpToken({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        fetchImpl,
        issuerUrl: 'http://localhost:8080/realms/dev',
      }),
    ).resolves.toBe('eyJ.test.token')

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
      }),
    ).rejects.toThrow('Token endpoint returned HTTP 401')
    await expect(
      fetchMcpToken({
        clientSecret: 'dev-only-mcp-secret',
        fetchImpl,
      }),
    ).rejects.not.toThrow('dev-only-mcp-secret')
  })

  it('rejects malformed token payloads', () => {
    expect(() => parseAccessTokenPayload(null)).toThrow(
      'Token endpoint did not return a JSON object',
    )
    expect(() => parseAccessTokenPayload({ access_token: '' })).toThrow(
      'Token endpoint response did not include access_token',
    )
  })
})
