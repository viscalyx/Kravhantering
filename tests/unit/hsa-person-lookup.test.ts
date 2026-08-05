import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
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

    expect(
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_TIMEOUT_MS: 'not-a-timeout',
        HSA_PERSON_LOOKUP_URL: 'http://kong:8000/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({ timeoutMs: 5000 })

    expect(
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_TIMEOUT_MS: '0',
        HSA_PERSON_LOOKUP_URL: 'http://kong:8000/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({ timeoutMs: 5000 })
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

    expect(
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'client-id',
        HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'client-secret',
        HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'https://idp/token',
        HSA_PERSON_LOOKUP_URL:
          'https://kong.example.internal/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({
      oauth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        tokenUrl: 'https://idp/token',
      },
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

  it('uses the native HTTP transport for OAuth token and lookup requests', async () => {
    const requests: Array<{ body: string; path: string }> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        requests.push({
          body: Buffer.concat(chunks).toString('utf8'),
          path: request.url ?? '',
        })
        response.setHeader('Content-Type', 'application/json')
        if (request.url === '/token') {
          response.end(JSON.stringify({ access_token: 'native-token' }))
          return
        }
        response.end(
          JSON.stringify({
            email: 'kalle@example.test',
            givenName: 'Kalle',
            hsaId: HSA_ID,
            middleName: null,
            surname: 'Svensson',
          }),
        )
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No port')
      const origin = `http://127.0.0.1:${address.port}`
      const person = await lookupHsaPerson(HSA_ID, {
        config: {
          oauth: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: `${origin}/token`,
          },
          timeoutMs: 5000,
          url: `${origin}/lookup?source=test`,
        },
      })

      expect(person.hsaId).toBe(HSA_ID)
      expect(requests).toEqual([
        expect.objectContaining({
          body: 'grant_type=client_credentials',
          path: '/token',
        }),
        expect.objectContaining({
          body: JSON.stringify({ hsaId: HSA_ID }),
          path: '/lookup?source=test',
        }),
      ])
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    }
  })

  it('maps unsupported native transports and insecure mTLS to unavailable', async () => {
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: {
          oauth: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: 'ftp://issuer.example.test/token',
          },
          timeoutMs: 5000,
          url: 'https://lookup.example.test/person',
        },
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
    })

    await expect(
      lookupHsaPerson(HSA_ID, {
        config: {
          mtls: { certPath: '/unused/cert', keyPath: '/unused/key' },
          timeoutMs: 5000,
          url: 'http://lookup.example.test/person',
        },
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
    })
  })

  it('aborts a pending lookup at the configured deadline', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ) as unknown as typeof fetch
      const lookup = lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 25, url: 'http://lookup.example.test/person' },
        fetchImpl,
      })
      const rejection = expect(lookup).rejects.toSatisfy(error => {
        expectRequirementsError(error, 'service_unavailable')
        return true
      })
      await vi.advanceTimersByTimeAsync(25)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed when native HTTPS TLS material cannot be read', async () => {
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: {
          mtls: {
            certPath: '/missing/hsa-client.crt',
            keyPath: '/missing/hsa-client.key',
          },
          timeoutMs: 5000,
          url: 'https://lookup.example.test/person',
        },
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
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

  it.each([
    { body: '', status: 200 },
    { body: '{invalid', status: 200 },
    { body: JSON.stringify({ givenName: 'Kalle', hsaId: '' }), status: 200 },
    {
      body: JSON.stringify({
        givenName: 'Kalle',
        hsaId: 'SE5560000001-other1',
      }),
      status: 200,
    },
    { body: JSON.stringify({ code: 'conflict' }), status: 422 },
  ])('rejects invalid or conflicting lookup payload %#', async response => {
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 5000, url: 'https://kong/lookup' },
        httpRequestImpl: vi.fn(async () => ({
          body: response.body,
          headers: {},
          status: response.status,
        })),
      }),
    ).rejects.toSatisfy(error => {
      expect(isRequirementsServiceError(error)).toBe(true)
      return true
    })
  })

  it.each([
    {
      responses: [{ body: '{}', headers: {}, status: 500 }],
    },
    {
      responses: [{ body: '{}', headers: {}, status: 200 }],
    },
    {
      responses: [
        {
          body: JSON.stringify({ token_endpoint: 'https://idp/token' }),
          headers: {},
          status: 200,
        },
        { body: '{}', headers: {}, status: 401 },
      ],
    },
    {
      responses: [
        {
          body: JSON.stringify({ token_endpoint: 'https://idp/token' }),
          headers: {},
          status: 200,
        },
        { body: '{}', headers: {}, status: 200 },
      ],
    },
  ])(
    'fails closed for OAuth discovery and token failures %#',
    async ({ responses }) => {
      const httpRequestImpl = vi.fn()
      for (const response of responses) {
        httpRequestImpl.mockResolvedValueOnce(response)
      }
      await expect(
        lookupHsaPerson(HSA_ID, {
          config: {
            oauth: {
              clientId: 'client-id',
              clientSecret: 'client-secret',
              issuerUrl: 'https://issuer.example.test',
            },
            timeoutMs: 5000,
            url: 'https://kong/lookup',
          },
          httpRequestImpl,
        }),
      ).rejects.toSatisfy(error => {
        expectRequirementsError(error, 'service_unavailable')
        return true
      })
    },
  )

  it('uses default token expiry and omits optional OAuth form fields', async () => {
    const httpRequestImpl = vi
      .fn()
      .mockResolvedValueOnce({
        body: JSON.stringify({
          access_token: 'token-default',
          expires_in: 'invalid',
        }),
        headers: {},
        status: 200,
      })
      .mockResolvedValueOnce({
        body: JSON.stringify({ givenName: 'Kalle', hsaId: HSA_ID }),
        headers: {},
        status: 200,
      })
    await lookupHsaPerson(HSA_ID, {
      config: {
        oauth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          tokenUrl: 'https://idp/token',
        },
        timeoutMs: 5000,
        url: 'https://kong/lookup',
      },
      httpRequestImpl,
    })
    expect(httpRequestImpl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ body: 'grant_type=client_credentials' }),
    )
  })
})
