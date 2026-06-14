import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHsaPersonLookupConfig,
  lookupHsaPerson,
  readHsaPersonLookupTlsFileForTests,
  resetHsaPersonLookupAuthCacheForTests,
} from '@/lib/hsa/person-lookup'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

const HSA_ID = 'SE5560000001-kalle1'

function expectRequirementsError(error: unknown, code: string) {
  expect(isRequirementsServiceError(error)).toBe(true)
  if (isRequirementsServiceError(error)) {
    expect(error.code).toBe(code)
  }
}

describe('HSA person lookup', () => {
  beforeEach(() => {
    resetHsaPersonLookupAuthCacheForTests()
  })

  it('reads lookup URL and clamps timeout from environment', () => {
    expect(
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_TIMEOUT_MS: '750',
        HSA_PERSON_LOOKUP_URL: ' http://kong:8000/hsa/person-records/lookup ',
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      timeoutMs: 750,
      url: 'http://kong:8000/hsa/person-records/lookup',
    })
  })

  it('reads optional mTLS and OAuth2 lookup auth from environment', () => {
    expect(
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_CA_PATH: '/certs/ca.crt',
        HSA_PERSON_LOOKUP_CLIENT_CERT_PATH: '/certs/client.crt',
        HSA_PERSON_LOOKUP_CLIENT_KEY_PATH: '/certs/client.key',
        HSA_PERSON_LOOKUP_OAUTH_AUDIENCE: 'hsa-lookup',
        HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'client-id',
        HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'client-secret',
        HSA_PERSON_LOOKUP_OAUTH_SCOPE: 'lookup:person',
        HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'https://idp/token',
        HSA_PERSON_LOOKUP_TLS_SERVER_NAME: 'kong.example.internal',
        HSA_PERSON_LOOKUP_URL:
          'https://kong.example.internal/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      mtls: {
        caPath: '/certs/ca.crt',
        certPath: '/certs/client.crt',
        keyPath: '/certs/client.key',
        serverName: 'kong.example.internal',
      },
      oauth: {
        audience: 'hsa-lookup',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scope: 'lookup:person',
        tokenUrl: 'https://idp/token',
      },
      timeoutMs: 5000,
      url: 'https://kong.example.internal/hsa/person-records/lookup',
    })
  })

  it('rejects incomplete app-to-platform auth configuration', () => {
    expect(() =>
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_CLIENT_CERT_PATH: '/certs/client.crt',
        HSA_PERSON_LOOKUP_URL:
          'https://kong.example.internal/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/mTLS configuration/u)

    expect(() =>
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'client-id',
        HSA_PERSON_LOOKUP_URL:
          'https://kong.example.internal/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/OAuth2 configuration/u)

    expect(() =>
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_OAUTH_SCOPE: 'lookup:person',
        HSA_PERSON_LOOKUP_URL:
          'https://kong.example.internal/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/OAuth2 configuration/u)

    expect(() =>
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_OAUTH_AUDIENCE: 'hsa-lookup',
        HSA_PERSON_LOOKUP_URL:
          'https://kong.example.internal/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/OAuth2 configuration/u)
  })

  it('posts HSA-id as JSON and maps split person fields', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            email: 'kalle@example.test',
            givenName: 'Kalle',
            hsaId: HSA_ID,
            middleName: 'Bertil',
            surname: 'Svensson',
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const person = await lookupHsaPerson(HSA_ID, {
      config: {
        timeoutMs: 5000,
        url: 'http://kong:8000/hsa/person-records/lookup',
      },
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://kong:8000/hsa/person-records/lookup',
      expect.objectContaining({
        body: JSON.stringify({ hsaId: HSA_ID }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(person).toEqual({
      email: 'kalle@example.test',
      givenName: 'Kalle',
      hasProtectedPersonalData: false,
      hsaId: HSA_ID,
      middleName: 'Bertil',
      surname: 'Svensson',
    })
  })

  it('maps protected personal data from the REST lookup contract', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            email: 'skyddad@example.test',
            givenName: 'Skyddad',
            hasProtectedPersonalData: true,
            hsaId: HSA_ID,
            middleName: null,
            surname: 'Person',
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const person = await lookupHsaPerson(HSA_ID, {
      config: {
        timeoutMs: 5000,
        url: 'http://kong:8000/hsa/person-records/lookup',
      },
      fetchImpl,
    })

    expect(person.hasProtectedPersonalData).toBe(true)
  })

  it('rejects invalid HSA-id before calling the integration endpoint', async () => {
    const fetchImpl = vi.fn()

    await expect(
      lookupHsaPerson('not-a-hsa-id', {
        config: {
          timeoutMs: 5000,
          url: 'http://kong:8000/hsa/person-records/lookup',
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'validation')
      return true
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps missing configuration to service unavailable', async () => {
    const previousUrl = process.env.HSA_PERSON_LOOKUP_URL
    const previousTimeout = process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS
    delete process.env.HSA_PERSON_LOOKUP_URL
    delete process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS
    try {
      await expect(lookupHsaPerson(HSA_ID)).rejects.toSatisfy(error => {
        expectRequirementsError(error, 'service_unavailable')
        return true
      })
    } finally {
      if (previousUrl === undefined) {
        delete process.env.HSA_PERSON_LOOKUP_URL
      } else {
        process.env.HSA_PERSON_LOOKUP_URL = previousUrl
      }
      if (previousTimeout === undefined) {
        delete process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS
      } else {
        process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS = previousTimeout
      }
    }
  })

  it('maps catalog not found and conflict responses to domain errors', async () => {
    const notFoundFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'not_found' }), { status: 404 }),
    )
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 5000, url: 'http://kong/lookup' },
        fetchImpl: notFoundFetch as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'validation')
      return true
    })

    const conflictFetch = vi.fn(async () => new Response('{}', { status: 409 }))
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 5000, url: 'http://kong/lookup' },
        fetchImpl: conflictFetch as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'conflict')
      return true
    })
  })

  it('maps platform auth failures to service unavailable', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'auth_failed' }), { status }),
      )

      await expect(
        lookupHsaPerson(HSA_ID, {
          config: { timeoutMs: 5000, url: 'http://kong/lookup' },
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).rejects.toSatisfy(error => {
        expectRequirementsError(error, 'service_unavailable')
        return true
      })
    }
  })

  it('maps a generic integration 404 to service unavailable', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'no Route matched' }), {
          status: 404,
        }),
    )

    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 5000, url: 'http://kong/lookup' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
    })
  })

  it('maps aborts to service unavailable timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('timeout', 'AbortError')
    })

    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 1, url: 'http://kong/lookup' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
    })
  })

  it('uses mTLS config when app-to-platform auth is configured without OAuth2', async () => {
    const mtls = {
      caPath: '/certs/ca.crt',
      certPath: '/certs/client.crt',
      keyPath: '/certs/client.key',
      serverName: 'kong.example.internal',
    }
    const httpRequestImpl = vi.fn(async () => ({
      body: JSON.stringify({
        email: 'kalle@example.test',
        givenName: 'Kalle',
        hasProtectedPersonalData: false,
        hsaId: HSA_ID,
        middleName: null,
        surname: 'Svensson',
      }),
      headers: {},
      status: 200,
    }))

    await lookupHsaPerson(HSA_ID, {
      config: {
        mtls,
        timeoutMs: 5000,
        url: 'https://kong.example.internal/hsa/person-records/lookup',
      },
      httpRequestImpl,
    })

    expect(httpRequestImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        mtls,
        url: 'https://kong.example.internal/hsa/person-records/lookup',
      }),
    )
  })

  it('rejects mTLS lookup config over plaintext HTTP before reading certificates', async () => {
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: {
          mtls: {
            certPath: '/missing/client.crt',
            keyPath: '/missing/client.key',
          },
          timeoutMs: 5000,
          url: 'http://kong.example.internal/hsa/person-records/lookup',
        },
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
    })
  })

  it('refreshes cached TLS file content after the file mtime changes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hsa-tls-cache-'))
    const filePath = path.join(dir, 'client.key')
    try {
      await writeFile(filePath, 'first')
      await utimes(
        filePath,
        new Date('2026-06-14T10:00:00.000Z'),
        new Date('2026-06-14T10:00:00.000Z'),
      )
      await expect(
        readHsaPersonLookupTlsFileForTests(filePath),
      ).resolves.toEqual(Buffer.from('first'))

      await writeFile(filePath, 'second')
      await utimes(
        filePath,
        new Date('2026-06-14T10:00:01.000Z'),
        new Date('2026-06-14T10:00:01.000Z'),
      )

      await expect(
        readHsaPersonLookupTlsFileForTests(filePath),
      ).resolves.toEqual(Buffer.from('second'))
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('acquires and caches OAuth2 client credentials tokens', async () => {
    const httpRequestImpl = vi
      .fn()
      .mockResolvedValueOnce({
        body: JSON.stringify({
          access_token: 'token-1',
          expires_in: 3600,
        }),
        headers: {},
        status: 200,
      })
      .mockResolvedValue({
        body: JSON.stringify({
          email: 'kalle@example.test',
          givenName: 'Kalle',
          hasProtectedPersonalData: false,
          hsaId: HSA_ID,
          middleName: null,
          surname: 'Svensson',
        }),
        headers: {},
        status: 200,
      })

    const config = {
      oauth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scope: 'lookup:person',
        tokenUrl: 'https://idp/token',
      },
      timeoutMs: 5000,
      url: 'https://kong.example.internal/hsa/person-records/lookup',
    }

    await lookupHsaPerson(HSA_ID, { config, httpRequestImpl })
    await lookupHsaPerson(HSA_ID, { config, httpRequestImpl })

    expect(httpRequestImpl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'lookup:person',
        }).toString(),
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        }),
        method: 'POST',
        url: 'https://idp/token',
      }),
    )
    expect(httpRequestImpl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
        url: 'https://kong.example.internal/hsa/person-records/lookup',
      }),
    )
    expect(httpRequestImpl).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
        url: 'https://kong.example.internal/hsa/person-records/lookup',
      }),
    )
  })

  it('supports OIDC discovery and combined mTLS plus OAuth2 mode', async () => {
    const mtls = {
      certPath: '/certs/client.crt',
      keyPath: '/certs/client.key',
    }
    const httpRequestImpl = vi
      .fn()
      .mockResolvedValueOnce({
        body: JSON.stringify({
          token_endpoint: 'https://issuer.example.test/oauth/token',
        }),
        headers: {},
        status: 200,
      })
      .mockResolvedValueOnce({
        body: JSON.stringify({ access_token: 'token-2', expires_in: 300 }),
        headers: {},
        status: 200,
      })
      .mockResolvedValueOnce({
        body: JSON.stringify({
          email: 'kalle@example.test',
          givenName: 'Kalle',
          hasProtectedPersonalData: false,
          hsaId: HSA_ID,
          middleName: null,
          surname: 'Svensson',
        }),
        headers: {},
        status: 200,
      })

    await lookupHsaPerson(HSA_ID, {
      config: {
        mtls,
        oauth: {
          audience: 'hsa-lookup',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          issuerUrl: 'https://issuer.example.test/',
        },
        timeoutMs: 5000,
        url: 'https://kong.example.internal/hsa/person-records/lookup',
      },
      httpRequestImpl,
    })

    expect(httpRequestImpl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'GET',
        mtls,
        url: 'https://issuer.example.test/.well-known/openid-configuration',
      }),
    )
    expect(httpRequestImpl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: 'grant_type=client_credentials&audience=hsa-lookup',
        mtls,
        url: 'https://issuer.example.test/oauth/token',
      }),
    )
    expect(httpRequestImpl).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-2' }),
        mtls,
      }),
    )
  })
})
