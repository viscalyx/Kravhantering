import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const oidcState = vi.hoisted(() => ({
  allowInsecureIssuer: true,
  allowInsecureRequests: vi.fn(),
  clientSecretPost: vi.fn(),
  discovery: vi.fn(),
  issuerUrl: 'https://issuer.example.test',
}))

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => ({
    clientId: 'kravhantering-app',
    clientSecret: 'client-secret',
    issuerUrl: oidcState.issuerUrl,
  }),
}))

vi.mock('@/lib/runtime/build-target', () => ({
  get ALLOW_INSECURE_OIDC_ISSUER() {
    return oidcState.allowInsecureIssuer
  },
}))

vi.mock('openid-client', () => ({
  allowInsecureRequests: oidcState.allowInsecureRequests,
  ClientSecretPost: oidcState.clientSecretPost,
  discovery: oidcState.discovery,
}))

import {
  getOidcConfiguration,
  oidcClient,
  resetOidcConfigurationForTests,
} from '@/lib/auth/oidc'

describe('OIDC discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetOidcConfigurationForTests()
    oidcState.allowInsecureIssuer = true
    oidcState.issuerUrl = 'https://issuer.example.test'
    oidcState.clientSecretPost.mockReturnValue({ auth: 'client-secret-post' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('discovers HTTPS configuration once and re-exports the client helpers', async () => {
    const configuration = { issuer: 'https://issuer.example.test' }
    oidcState.discovery.mockResolvedValue(configuration)

    await expect(getOidcConfiguration()).resolves.toBe(configuration)
    await expect(getOidcConfiguration()).resolves.toBe(configuration)

    expect(oidcState.discovery).toHaveBeenCalledOnce()
    expect(oidcState.discovery).toHaveBeenCalledWith(
      new URL('https://issuer.example.test'),
      'kravhantering-app',
      undefined,
      { auth: 'client-secret-post' },
      undefined,
    )
    expect(oidcClient.discovery).toBe(oidcState.discovery)
    expect(oidcState.allowInsecureRequests).not.toHaveBeenCalled()
  })

  it('enables insecure transport explicitly for the development issuer', async () => {
    oidcState.issuerUrl = 'http://localhost:8080/realms/dev'
    const configuration = { issuer: oidcState.issuerUrl }
    oidcState.discovery.mockResolvedValue(configuration)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(getOidcConfiguration()).resolves.toBe(configuration)

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('accepting insecure http:// OIDC issuer'),
    )
    expect(oidcState.discovery).toHaveBeenCalledWith(
      new URL(oidcState.issuerUrl),
      'kravhantering-app',
      undefined,
      { auth: 'client-secret-post' },
      { execute: [oidcState.allowInsecureRequests] },
    )
    expect(oidcState.allowInsecureRequests).toHaveBeenCalledWith(configuration)
  })

  it('rejects HTTP issuers when the active build forbids them', async () => {
    oidcState.allowInsecureIssuer = false
    oidcState.issuerUrl = 'http://issuer.example.test'

    await expect(getOidcConfiguration()).rejects.toThrow(
      'Refusing to use insecure http:// OIDC issuer in this build',
    )
    expect(oidcState.discovery).not.toHaveBeenCalled()
  })

  it('retries discovery after a transient failure', async () => {
    const failure = new Error('discovery unavailable')
    const configuration = { issuer: oidcState.issuerUrl }
    oidcState.discovery
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(configuration)

    await expect(getOidcConfiguration()).rejects.toBe(failure)
    await expect(getOidcConfiguration()).resolves.toBe(configuration)
    expect(oidcState.discovery).toHaveBeenCalledTimes(2)
  })
})
