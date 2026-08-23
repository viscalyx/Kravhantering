import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createInvalidRuntimeCertificateFixture,
  createRuntimeCertificateFixture,
} from '@/containers/hsa-mtls-provisioner/test/runtime-fixture.mjs'
import { generateCertificates } from '@/containers/hsa-person-lookup-adapter/src/generate-certs.mjs'
import {
  loadStrictHsaPersonLookupSnapshot,
  lookupHsaPersonStrict,
  type StrictHsaRequest,
  strictHsaPersonLookupDiagnostic,
} from '@/lib/hsa/strict-person-lookup'
import {
  loadStrictTlsSnapshot,
  readStrictTlsFile,
  StrictTlsMaterialError,
} from '@/lib/hsa/strict-tls'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

interface RuntimeFixture {
  bundle(role: string, filename: string): string
  cleanup(): Promise<void>
  generationDir: string
}

interface InvalidRuntimeFixture {
  caCertificate: string
  cleanup(): Promise<void>
  entry(name: string): { certificate: string; key: string }
}

let fixture: RuntimeFixture
let invalidFixture: InvalidRuntimeFixture

beforeAll(async () => {
  ;[fixture, invalidFixture] = await Promise.all([
    createRuntimeCertificateFixture(),
    createInvalidRuntimeCertificateFixture(),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all([fixture?.cleanup(), invalidFixture?.cleanup()])
})

describe('strict HSA person lookup startup snapshot', () => {
  it('is unavailable when no integration setting is present', async () => {
    await expect(
      loadStrictHsaPersonLookupSnapshot({} as NodeJS.ProcessEnv),
    ).resolves.toBeNull()
  })

  it('fails closed when a configured URL lacks any mTLS field', async () => {
    const required = [
      'HSA_PERSON_LOOKUP_CA_PATH',
      'HSA_PERSON_LOOKUP_CLIENT_CERT_PATH',
      'HSA_PERSON_LOOKUP_CLIENT_KEY_PATH',
      'HSA_PERSON_LOOKUP_TLS_SERVER_NAME',
    ] as const

    for (const missing of required) {
      const env = {
        HSA_PERSON_LOOKUP_CA_PATH: '/run/app/kong-server-ca.crt',
        HSA_PERSON_LOOKUP_CLIENT_CERT_PATH: '/run/app/app-client.crt',
        HSA_PERSON_LOOKUP_CLIENT_KEY_PATH: '/run/app/app-client.key',
        HSA_PERSON_LOOKUP_TLS_SERVER_NAME: 'kong',
        HSA_PERSON_LOOKUP_URL: 'https://kong:8443/hsa/person-records/lookup',
      } as unknown as NodeJS.ProcessEnv
      delete env[missing]

      await expect(loadStrictHsaPersonLookupSnapshot(env)).rejects.toSatisfy(
        (error: unknown) =>
          strictHsaPersonLookupDiagnostic(error) ===
          'hsa_strict_mtls_incomplete',
      )
    }
  })

  function completeEnv(): NodeJS.ProcessEnv {
    return {
      HSA_PERSON_LOOKUP_CA_PATH: fixture.bundle('app', 'kong-server-ca.crt'),
      HSA_PERSON_LOOKUP_CLIENT_CERT_PATH: fixture.bundle(
        'app',
        'app-client.crt',
      ),
      HSA_PERSON_LOOKUP_CLIENT_KEY_PATH: fixture.bundle(
        'app',
        'app-client.key',
      ),
      HSA_PERSON_LOOKUP_TLS_SERVER_NAME: 'kong',
      HSA_PERSON_LOOKUP_URL: 'https://kong:8443/hsa/person-records/lookup',
    } as unknown as NodeJS.ProcessEnv
  }

  it('validates and freezes a complete local App mTLS snapshot', async () => {
    const snapshot = await loadStrictHsaPersonLookupSnapshot(completeEnv())

    expect(snapshot).toMatchObject({
      endpointUrl: 'https://kong:8443/hsa/person-records/lookup',
      timeoutMs: 5000,
      tls: { serverName: 'kong' },
    })
    expect(Buffer.isBuffer(snapshot?.tls.ca)).toBe(true)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot?.tls)).toBe(true)
  })

  it('rejects wrong-role, wrong-domain, and mismatched-key local material', async () => {
    const cases = [
      {
        diagnostic: 'tls_leaf_role_invalid',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_CLIENT_CERT_PATH: fixture.bundle(
            'kong',
            'kong-server.crt',
          ),
          HSA_PERSON_LOOKUP_CLIENT_KEY_PATH: fixture.bundle(
            'kong',
            'kong-server.key',
          ),
        },
      },
      {
        diagnostic: 'tls_chain_untrusted',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_CA_PATH: fixture.bundle(
            'adapter',
            'hsa-server-ca.crt',
          ),
        },
      },
      {
        diagnostic: 'tls_key_mismatch',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_CLIENT_KEY_PATH: fixture.bundle(
            'kong',
            'kong-client.key',
          ),
        },
      },
    ]

    for (const testCase of cases) {
      await expect(
        loadStrictHsaPersonLookupSnapshot(testCase.env),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof StrictTlsMaterialError &&
          error.diagnostic === testCase.diagnostic,
      )
    }
  })

  it('uses independent ordinary HTTPS for additive OAuth and generates correlation', async () => {
    const env = {
      ...completeEnv(),
      HSA_PERSON_LOOKUP_OAUTH_CA_PATH: fixture.bundle(
        'app',
        'kong-server-ca.crt',
      ),
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'lookup-client',
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'lookup-secret',
      HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'https://identity.example/token',
    }
    const snapshot = await loadStrictHsaPersonLookupSnapshot(env)
    const requests: StrictHsaRequest[] = []
    const correlation = '10000000-0000-4000-8000-000000000001'

    const person = await lookupHsaPersonStrict('SE5560000001-kalle1', {
      request: async request => {
        requests.push(request)
        return requests.length === 1
          ? {
              body: JSON.stringify({ access_token: 'access-token' }),
              contentType: 'application/json',
              status: 200,
            }
          : {
              body: JSON.stringify({
                givenName: 'Kalle',
                hsaId: 'SE5560000001-kalle1',
              }),
              contentType: 'application/json',
              status: 200,
            }
      },
      snapshot,
      uuid: () => correlation,
    })

    expect(person.givenName).toBe('Kalle')
    expect(requests).toHaveLength(2)
    expect(requests[0]?.tls).toEqual({ ca: snapshot?.oauth?.ca })
    expect(requests[0]?.tls).not.toHaveProperty('cert')
    expect(requests[0]?.tls).not.toHaveProperty('key')
    expect(requests[1]?.tls).toBe(snapshot?.tls)
    expect(requests[1]?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'X-Kravhantering-HSA-Correlation-ID': correlation,
    })
    expect(JSON.parse(requests[1]?.body ?? '{}')).toEqual({
      hsaId: 'SE5560000001-kalle1',
    })
  })

  it('maps raw remote TLS failures to one bounded unavailable outcome', async () => {
    const snapshot = await loadStrictHsaPersonLookupSnapshot(completeEnv())

    await expect(
      lookupHsaPersonStrict('SE5560000001-kalle1', {
        request: async () => {
          throw new Error(
            'error:0A000086:SSL routines:certificate verify failed',
          )
        },
        snapshot,
        uuid: () => '10000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!isRequirementsServiceError(error)) return false
      expect(error.code).toBe('service_unavailable')
      expect(error.message).toBe('HSA lookup service is unavailable')
      expect(JSON.stringify(error)).not.toContain('SSL routines')
      return true
    })
  })

  it('rejects invalid strict endpoint, identity, timeout, and OAuth settings', async () => {
    const cases: Array<{
      diagnostic: string
      env: NodeJS.ProcessEnv
    }> = [
      {
        diagnostic: 'hsa_strict_auth_requires_url',
        env: {
          HSA_PERSON_LOOKUP_CLIENT_CERT_PATH: '/run/app/app-client.crt',
        } as unknown as NodeJS.ProcessEnv,
      },
      {
        diagnostic: 'hsa_strict_url_invalid',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_URL: 'http://kong/hsa/person-records/lookup',
        },
      },
      {
        diagnostic: 'hsa_strict_url_invalid',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_URL: 'https://kong:0/hsa/person-records/lookup',
        },
      },
      ...['localhost', '*.example.test', '127.0.0.1', 'not a dns name'].map(
        serverName => ({
          diagnostic: 'hsa_strict_server_identity_invalid',
          env: {
            ...completeEnv(),
            HSA_PERSON_LOOKUP_TLS_SERVER_NAME: serverName,
          },
        }),
      ),
      {
        diagnostic: 'hsa_strict_timeout_invalid',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_TIMEOUT_MS: '30001',
        },
      },
      {
        diagnostic: 'hsa_strict_oauth_incomplete',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'client-id',
        },
      },
      {
        diagnostic: 'hsa_strict_oauth_url_invalid',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'client-id',
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'client-secret',
          HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'http://identity.example/token',
        },
      },
      {
        diagnostic: 'hsa_strict_oauth_url_invalid',
        env: {
          ...completeEnv(),
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'client-id',
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'client-secret',
          HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'https://identity.example:0/token',
        },
      },
    ]

    for (const testCase of cases) {
      await expect(
        loadStrictHsaPersonLookupSnapshot(testCase.env),
      ).rejects.toSatisfy(
        (error: unknown) =>
          strictHsaPersonLookupDiagnostic(error) === testCase.diagnostic,
      )
    }
  })

  it('uses the startup snapshot for a real mutually authenticated request', async () => {
    const snapshot = await loadStrictHsaPersonLookupSnapshot(completeEnv())
    if (!snapshot) throw new Error('snapshot missing')
    let correlation = ''
    const server = https.createServer(
      {
        ca: snapshot.tls.ca,
        cert: await readFile(fixture.bundle('kong', 'kong-server.crt')),
        key: await readFile(fixture.bundle('kong', 'kong-server.key')),
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        requestCert: true,
      },
      (request, response) => {
        correlation = String(
          request.headers['x-kravhantering-hsa-correlation-id'],
        )
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            givenName: 'Kalle',
            hsaId: 'SE5560000001-kalle1',
          }),
        )
      },
    )
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('no address')
      const person = await lookupHsaPersonStrict('SE5560000001-kalle1', {
        snapshot: {
          ...snapshot,
          endpointUrl: `https://127.0.0.1:${address.port}/hsa/person-records/lookup`,
        },
        uuid: () => '10000000-0000-4000-8000-000000000001',
      })

      expect(person.givenName).toBe('Kalle')
      expect(correlation).toBe('10000000-0000-4000-8000-000000000001')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('preserves bounded not-found and conflict outcomes', async () => {
    const snapshot = await loadStrictHsaPersonLookupSnapshot(completeEnv())
    const outcomes = [
      { body: { code: 'not_found' }, code: 'validation', status: 404 },
      { body: { code: 'conflict' }, code: 'conflict', status: 409 },
      {
        body: { givenName: 'Other', hsaId: 'SE5560000001-other1' },
        code: 'conflict',
        status: 200,
      },
    ]
    for (const outcome of outcomes) {
      await expect(
        lookupHsaPersonStrict('SE5560000001-kalle1', {
          request: async () => ({
            body: JSON.stringify(outcome.body),
            contentType: 'application/json',
            status: outcome.status,
          }),
          snapshot,
          uuid: () => '10000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          isRequirementsServiceError(error) && error.code === outcome.code,
      )
    }
  })

  it('discovers an independent OAuth endpoint on the configured issuer origin', async () => {
    const snapshot = await loadStrictHsaPersonLookupSnapshot({
      ...completeEnv(),
      HSA_PERSON_LOOKUP_OAUTH_AUDIENCE: 'hsa-api',
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'lookup-client',
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'lookup-secret',
      HSA_PERSON_LOOKUP_OAUTH_ISSUER_URL: 'https://identity.example/',
      HSA_PERSON_LOOKUP_OAUTH_SCOPE: 'lookup:person',
    })
    const requests: StrictHsaRequest[] = []

    await expect(
      lookupHsaPersonStrict('SE5560000001-kalle1', {
        request: async request => {
          requests.push(request)
          if (requests.length === 1) {
            return {
              body: JSON.stringify({
                issuer: 'https://identity.example',
                token_endpoint: 'https://identity.example/oauth/token',
              }),
              contentType: 'application/json',
              status: 200,
            }
          }
          if (requests.length === 2) {
            return {
              body: JSON.stringify({ access_token: 'discovered-token' }),
              contentType: 'application/json',
              status: 200,
            }
          }
          return {
            body: JSON.stringify({
              givenName: 'Kalle',
              hsaId: 'SE5560000001-kalle1',
            }),
            contentType: 'application/json',
            status: 200,
          }
        },
        snapshot,
        uuid: () => '10000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toMatchObject({ givenName: 'Kalle' })
    expect(requests[0]?.url).toBe(
      'https://identity.example/.well-known/openid-configuration',
    )
    expect(requests[1]?.url).toBe('https://identity.example/oauth/token')
    const tokenForm = new URLSearchParams(requests[1]?.body)
    expect(tokenForm.get('scope')).toBe('lookup:person')
    expect(tokenForm.get('audience')).toBe('hsa-api')
  })

  it('bounds invalid identifiers, correlation, response, and remote statuses', async () => {
    const snapshot = await loadStrictHsaPersonLookupSnapshot(completeEnv())
    await expect(
      lookupHsaPersonStrict('invalid', { snapshot }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      lookupHsaPersonStrict('SE5560000001-kalle1', {
        snapshot,
        uuid: () => 'browser-controlled-correlation',
      }),
    ).rejects.toMatchObject({ code: 'service_unavailable' })
    await expect(
      lookupHsaPersonStrict('SE5560000001-kalle1', { snapshot: null }),
    ).rejects.toMatchObject({ code: 'service_unavailable' })

    for (const response of [
      { body: '{}', contentType: 'text/plain', status: 200 },
      { body: '{', contentType: 'application/json', status: 200 },
      { body: '{}', contentType: 'application/json', status: 200 },
      { body: '{}', contentType: 'application/json', status: 502 },
    ]) {
      await expect(
        lookupHsaPersonStrict('SE5560000001-kalle1', {
          request: async () => response,
          snapshot,
          uuid: () => '10000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toMatchObject({ code: 'service_unavailable' })
    }
  })

  it('bounds oversized and timed-out strict HTTPS responses', async () => {
    const snapshot = await loadStrictHsaPersonLookupSnapshot(completeEnv())
    if (!snapshot) throw new Error('snapshot missing')
    let timeoutResponse: ServerResponse | undefined
    const server = https.createServer(
      {
        ca: snapshot.tls.ca,
        cert: await readFile(fixture.bundle('kong', 'kong-server.crt')),
        key: await readFile(fixture.bundle('kong', 'kong-server.key')),
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        requestCert: true,
      },
      (request, response) => {
        if (request.url === '/oversized') {
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(`{"padding":"${'x'.repeat(70 * 1024)}"}`)
          return
        }
        timeoutResponse = response
      },
    )
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('no address')
      const endpoint = `https://127.0.0.1:${address.port}`
      for (const [pathname, timeoutMs] of [
        ['/oversized', 5000],
        ['/timeout', 10],
      ] as const) {
        await expect(
          lookupHsaPersonStrict('SE5560000001-kalle1', {
            snapshot: {
              ...snapshot,
              endpointUrl: `${endpoint}${pathname}`,
              timeoutMs,
            },
            uuid: () => '10000000-0000-4000-8000-000000000001',
          }),
        ).rejects.toMatchObject({ code: 'service_unavailable' })
      }
    } finally {
      timeoutResponse?.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('validates strict TLS files and exact local identities', async () => {
    await expect(
      readStrictTlsFile('relative/client.crt'),
    ).rejects.toMatchObject({ diagnostic: 'tls_file_path_invalid' })
    await expect(
      readStrictTlsFile(fixture.bundle('app', 'missing.crt')),
    ).rejects.toMatchObject({ diagnostic: 'tls_file_invalid' })
    await expect(
      readStrictTlsFile(fixture.generationDir),
    ).rejects.toMatchObject({ diagnostic: 'tls_file_invalid' })
    await expect(
      loadStrictTlsSnapshot({
        caPath: fixture.bundle('adapter', 'kong-client-ca.crt'),
        certPath: fixture.bundle('adapter', 'adapter-server.crt'),
        expectedIdentity: 'hsa-person-lookup-adapter',
        keyPath: fixture.bundle('adapter', 'adapter-server.key'),
        role: 'server',
      }),
    ).resolves.toBeDefined()
    await expect(
      loadStrictTlsSnapshot({
        caPath: fixture.bundle('adapter', 'kong-client-ca.crt'),
        certPath: fixture.bundle('adapter', 'adapter-server.crt'),
        expectedIdentity: 'another-adapter',
        keyPath: fixture.bundle('adapter', 'adapter-server.key'),
        role: 'server',
      }),
    ).rejects.toMatchObject({ diagnostic: 'tls_peer_identity_invalid' })
    await expect(
      loadStrictTlsSnapshot({
        caPath: fixture.bundle('kong', 'app-client-ca.crt'),
        certPath: fixture.bundle('app', 'app-client.crt'),
        expectedIdentity: 'CN=kravhantering-app',
        keyPath: fixture.bundle('app', 'app-client.key'),
        role: 'client',
      }),
    ).resolves.toBeDefined()
    await expect(
      loadStrictTlsSnapshot({
        caPath: fixture.bundle('kong', 'app-client-ca.crt'),
        certPath: fixture.bundle('app', 'app-client.crt'),
        expectedIdentity: 'CN=another-app',
        keyPath: fixture.bundle('app', 'app-client.key'),
        role: 'client',
      }),
    ).rejects.toMatchObject({ diagnostic: 'tls_peer_identity_invalid' })
  })

  it('rejects malformed, non-current, and CA-as-leaf material before startup', async () => {
    const base = {
      caPath: fixture.bundle('kong', 'app-client-ca.crt'),
      certPath: fixture.bundle('app', 'app-client.crt'),
      keyPath: fixture.bundle('app', 'app-client.key'),
      role: 'client' as const,
    }
    await expect(
      loadStrictTlsSnapshot({ ...base, now: new Date('2000-01-01') }),
    ).rejects.toMatchObject({ diagnostic: 'tls_certificate_not_yet_valid' })
    await expect(
      loadStrictTlsSnapshot({ ...base, now: new Date('2100-01-01') }),
    ).rejects.toMatchObject({ diagnostic: 'tls_certificate_expired' })
    await expect(
      loadStrictTlsSnapshot({
        ...base,
        caPath: fixture.bundle('app', 'app-client.crt'),
      }),
    ).rejects.toMatchObject({ diagnostic: 'tls_ca_invalid' })
    await expect(
      loadStrictTlsSnapshot({
        ...base,
        certPath: fixture.bundle('kong', 'app-client-ca.crt'),
      }),
    ).rejects.toMatchObject({ diagnostic: 'tls_leaf_role_invalid' })
    await expect(
      loadStrictTlsSnapshot({ ...base, caPath: path.resolve('package.json') }),
    ).rejects.toMatchObject({ diagnostic: 'tls_ca_invalid' })
    await expect(
      loadStrictTlsSnapshot({
        ...base,
        certPath: path.resolve('package.json'),
      }),
    ).rejects.toMatchObject({ diagnostic: 'tls_certificate_invalid' })
  })

  it(
    'rejects legacy trust roots that omit exact critical key usage',
    async () => {
      const legacyDir = await mkdtemp(path.join(tmpdir(), 'hsa-legacy-tls-'))
      try {
        const legacy = await generateCertificates({
          fileOwnerGid: process.getgid?.() ?? 1000,
          fileOwnerUid: process.getuid?.() ?? 1000,
          outputDir: legacyDir,
        })
        await expect(
          loadStrictTlsSnapshot({
            caPath: legacy.caCert,
            certPath: legacy.clientCert,
            keyPath: legacy.clientKey,
            role: 'client',
          }),
        ).rejects.toMatchObject({ diagnostic: 'tls_ca_invalid' })
      } finally {
        await rm(legacyDir, { force: true, recursive: true })
      }
    },
    15_000,
  )

  it('rejects dual-purpose and wrong-key-usage client leaves', async () => {
    for (const name of [
      'client-dual-eku',
      'client-missing-key-usage',
      'client-noncritical-key-usage',
      'client-wrong-key-usage',
    ]) {
      const invalid = invalidFixture.entry(name)
      await expect(
        loadStrictTlsSnapshot({
          caPath: invalidFixture.caCertificate,
          certPath: invalid.certificate,
          keyPath: invalid.key,
          role: 'client',
        }),
      ).rejects.toMatchObject({ diagnostic: 'tls_leaf_role_invalid' })
    }
    await expect(
      loadStrictTlsSnapshot({
        caPath: fixture.bundle('kong', 'app-client-ca.crt'),
        certPath: fixture.bundle('app', 'app-client.crt'),
        keyPath: path.resolve('package.json'),
        role: 'client',
      }),
    ).rejects.toMatchObject({ diagnostic: 'tls_key_invalid' })
  })
})
