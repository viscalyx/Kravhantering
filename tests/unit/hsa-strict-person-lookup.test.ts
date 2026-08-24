import { X509Certificate } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createCertificateChainFixture,
  createInvalidRuntimeCertificateFixture,
  createRuntimeCertificateFixture,
} from '@/containers/hsa-mtls-provisioner/test/runtime-fixture.mjs'
import {
  assertExactCertificateKeyUsage,
  loadStrictCertificateMaterial,
} from '@/lib/hsa/strict-certificate-validation.mjs'
import {
  getStrictHsaPersonLookupSnapshot,
  loadStrictHsaPersonLookupSnapshot,
  lookupHsaPersonStrict,
  resetStrictHsaPersonLookupSnapshotForTests,
  type StrictHsaRequest,
  strictHsaPersonLookupDiagnostic,
} from '@/lib/hsa/strict-person-lookup'
import {
  loadStrictTlsSnapshot,
  readStrictTlsFile,
  StrictTlsMaterialError,
  strictCertificateAuthorityRawValues,
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
let chainFixture: Awaited<ReturnType<typeof createCertificateChainFixture>>

beforeAll(async () => {
  ;[fixture, invalidFixture, chainFixture] = await Promise.all([
    createRuntimeCertificateFixture(),
    createInvalidRuntimeCertificateFixture(),
    createCertificateChainFixture(),
  ])
}, 30_000)

afterAll(async () => {
  await Promise.all([
    fixture?.cleanup(),
    invalidFixture?.cleanup(),
    chainFixture?.cleanup(),
  ])
})

describe('strict HSA person lookup startup snapshot', () => {
  it('caches unavailable startup state until the process is recreated', async () => {
    resetStrictHsaPersonLookupSnapshotForTests()
    const previous = process.env.HSA_PERSON_LOOKUP_URL
    delete process.env.HSA_PERSON_LOOKUP_URL
    try {
      const first = getStrictHsaPersonLookupSnapshot()
      const second = getStrictHsaPersonLookupSnapshot()
      expect(second).toBe(first)
      await expect(first).resolves.toBeNull()
    } finally {
      if (previous === undefined) delete process.env.HSA_PERSON_LOOKUP_URL
      else process.env.HSA_PERSON_LOOKUP_URL = previous
      resetStrictHsaPersonLookupSnapshotForTests()
    }
  })

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
        'adapter',
        'hsa-server-ca.crt',
      ),
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'lookup client+',
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'lookup/secret:',
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

  it('fails closed when OAuth reuses App-to-Kong trust by path or certificate', async () => {
    for (const oauthCaPath of [
      fixture.bundle('app', 'kong-server-ca.crt'),
      fixture.bundle('kong', 'app-client-ca.crt'),
    ]) {
      await expect(
        loadStrictHsaPersonLookupSnapshot({
          ...completeEnv(),
          HSA_PERSON_LOOKUP_OAUTH_CA_PATH: oauthCaPath,
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'lookup-client',
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'lookup-secret',
          HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'https://identity.example/token',
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          strictHsaPersonLookupDiagnostic(error) ===
          'hsa_strict_oauth_trust_reused',
      )
    }
  })

  it('rejects App-to-Kong trust hidden later in an OAuth CA bundle', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hsa-oauth-ca-'))
    const oauthCaPath = path.join(directory, 'oauth-ca-bundle.crt')
    try {
      await writeFile(
        oauthCaPath,
        Buffer.concat([
          await readFile(fixture.bundle('adapter', 'hsa-server-ca.crt')),
          Buffer.from('\n'),
          await readFile(fixture.bundle('app', 'kong-server-ca.crt')),
        ]),
      )

      await expect(
        loadStrictHsaPersonLookupSnapshot({
          ...completeEnv(),
          HSA_PERSON_LOOKUP_OAUTH_CA_PATH: oauthCaPath,
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'lookup-client',
          HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'lookup-secret',
          HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'https://identity.example/token',
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          strictHsaPersonLookupDiagnostic(error) ===
          'hsa_strict_oauth_trust_reused',
      )
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('validates an additive OAuth trust file as a CA at startup', async () => {
    await expect(
      loadStrictHsaPersonLookupSnapshot({
        ...completeEnv(),
        HSA_PERSON_LOOKUP_OAUTH_CA_PATH: path.resolve(
          'lib/hsa/strict-person-lookup.ts',
        ),
        HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'lookup-client',
        HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'lookup-secret',
        HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL: 'https://identity.example/token',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof StrictTlsMaterialError &&
        error.diagnostic === 'tls_ca_invalid',
    )
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
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID: 'lookup client+',
      HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET: 'lookup/secret:',
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
    const expectedClientId = new URLSearchParams({
      clientId: 'lookup client+',
    })
      .toString()
      .slice('clientId='.length)
    const expectedClientSecret = new URLSearchParams({
      clientSecret: 'lookup/secret:',
    })
      .toString()
      .slice('clientSecret='.length)
    expect(requests[1]?.headers.Authorization).toBe(
      `Basic ${Buffer.from(`${expectedClientId}:${expectedClientSecret}`).toString('base64')}`,
    )
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

  it('requires canonical critical Basic Constraints on client and server leaves', async () => {
    const diagnostics = {
      caInvalid: 'ca',
      certificateExpired: 'expired',
      certificateInvalid: 'certificate',
      certificateNotYetValid: 'not-yet-valid',
      chainUntrusted: 'chain',
      fileInvalid: 'file',
      filePathInvalid: 'path',
      keyInvalid: 'key',
      keyMismatch: 'key-mismatch',
      leafRoleInvalid: 'role',
      peerIdentityInvalid: 'identity',
      tlsContextInvalid: 'context',
    }
    const fail = (category: string, message: string): never => {
      throw Object.assign(new Error(message), { category })
    }

    for (const role of ['client', 'server'] as const) {
      for (const suffix of [
        'missing',
        'noncritical',
        'ca-true',
        'path-length',
        'explicit-false',
      ]) {
        const invalid = invalidFixture.entry(
          `${role}-basic-constraints-${suffix}`,
        )
        await expect(
          loadStrictCertificateMaterial({
            caPath: invalidFixture.caCertificate,
            certPath: invalid.certificate,
            diagnostics,
            fail,
            keyPath: invalid.key,
            role,
          }),
        ).rejects.toMatchObject({ category: 'role' })
      }
    }
  })

  it('accepts canonical and rejects malformed exact key usage DER', async () => {
    const fail = (category: string, message: string): never => {
      throw Object.assign(new Error(message), { category })
    }
    for (const valid of [
      { bits: [0], name: 'client-canonical-key-usage' },
      { bits: [0, 2], name: 'server-canonical-key-usage' },
    ]) {
      const material = invalidFixture.entry(valid.name)
      const certificate = new X509Certificate(
        await readFile(material.certificate),
      )
      expect(() =>
        assertExactCertificateKeyUsage(certificate, 'role', valid.bits, fail),
      ).not.toThrow()
    }

    for (const suffix of [
      'unused-bits-overflow',
      'nonzero-padding',
      'trailing-der',
      'truncated',
      'empty',
      'noncanonical-padding',
    ]) {
      const material = invalidFixture.entry(`client-key-usage-${suffix}`)
      const certificate = new X509Certificate(
        await readFile(material.certificate),
      )
      expect(() =>
        assertExactCertificateKeyUsage(certificate, 'role', [0], fail),
      ).toThrow(
        expect.objectContaining({
          category: 'role',
          message: 'TLS certificate key usage is invalid.',
        }),
      )
    }
  })

  it('maps the shared subject-field policy without weakening exact identity', async () => {
    const diagnostics = {
      caInvalid: 'ca',
      certificateExpired: 'expired',
      certificateInvalid: 'certificate',
      certificateNotYetValid: 'not-yet-valid',
      chainUntrusted: 'chain',
      fileInvalid: 'file',
      filePathInvalid: 'path',
      keyInvalid: 'key',
      keyMismatch: 'key-mismatch',
      leafRoleInvalid: 'role',
      peerIdentityInvalid: 'identity',
      tlsContextInvalid: 'context',
    }
    const fail = (category: string, message: string): never => {
      throw Object.assign(new Error(message), { category })
    }
    const base = {
      caPath: fixture.bundle('mock', 'adapter-client-ca.crt'),
      certPath: fixture.bundle('adapter', 'adapter-client.crt'),
      diagnostics,
      fail,
      keyPath: fixture.bundle('adapter', 'adapter-client.key'),
      role: 'client' as const,
    }

    await expect(
      loadStrictCertificateMaterial({
        ...base,
        identity: {
          field: 'serialNumber',
          type: 'subject-field',
          value: 'SE5560000000-MOCK001',
        },
      }),
    ).resolves.toEqual({
      ca: expect.any(Buffer),
      cert: expect.any(Buffer),
      key: expect.any(Buffer),
    })
    await expect(
      loadStrictCertificateMaterial({
        ...base,
        identity: {
          field: 'serialNumber',
          type: 'subject-field',
          value: 'SE5560000000-WRONG',
        },
      }),
    ).rejects.toMatchObject({ category: 'identity' })
  })

  it('accepts complete and rejects incomplete intermediate chains for both leaf roles', async () => {
    const diagnostics = {
      caInvalid: 'ca',
      certificateExpired: 'expired',
      certificateInvalid: 'certificate',
      certificateNotYetValid: 'not-yet-valid',
      chainUntrusted: 'chain',
      fileInvalid: 'file',
      filePathInvalid: 'path',
      keyInvalid: 'key',
      keyMismatch: 'key-mismatch',
      leafRoleInvalid: 'role',
      peerIdentityInvalid: 'identity',
      tlsContextInvalid: 'context',
    }
    const fail = (category: string, message: string): never => {
      throw Object.assign(new Error(message), { category })
    }
    const cases = [
      {
        identity: { type: 'subject' as const, value: 'CN=kravhantering-app' },
        material: chainFixture.client,
        role: 'client' as const,
      },
      {
        identity: {
          type: 'dns' as const,
          value: 'hsa-person-lookup-adapter',
        },
        material: chainFixture.server,
        role: 'server' as const,
      },
    ]

    for (const testCase of cases) {
      const options = {
        caPath: chainFixture.rootCertificate,
        diagnostics,
        fail,
        identity: testCase.identity,
        keyPath: testCase.material.key,
        role: testCase.role,
      }
      await expect(
        loadStrictCertificateMaterial({
          ...options,
          certPath: testCase.material.complete,
        }),
      ).resolves.toEqual({
        ca: expect.any(Buffer),
        cert: expect.any(Buffer),
        key: expect.any(Buffer),
      })
      await expect(
        loadStrictCertificateMaterial({
          ...options,
          allowCaBundle: true,
          caPath: chainFixture.authorityBundle,
          certPath: testCase.material.leaf,
        }),
      ).resolves.toEqual({
        ca: expect.any(Buffer),
        cert: expect.any(Buffer),
        key: expect.any(Buffer),
      })
      await expect(
        loadStrictCertificateMaterial({
          ...options,
          certPath: testCase.material.leaf,
        }),
      ).rejects.toMatchObject({ category: 'chain' })
      await expect(
        loadStrictCertificateMaterial({
          ...options,
          allowCaBundle: true,
          caPath: chainFixture.intermediateCertificate,
          certPath: testCase.material.leaf,
        }),
      ).rejects.toMatchObject({ category: 'ca' })
    }

    const clientOptions = {
      diagnostics,
      fail,
      identity: { type: 'subject' as const, value: 'CN=kravhantering-app' },
      keyPath: chainFixture.client.key,
      role: 'client' as const,
    }
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        caPath: chainFixture.rootCertificate,
        certPath: chainFixture.client.extraneous,
      }),
    ).rejects.toMatchObject({ category: 'chain' })
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        caPath: chainFixture.rootCertificate,
        certPath: chainFixture.client.oversized,
      }),
    ).rejects.toMatchObject({ category: 'certificate' })
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        allowCaBundle: true,
        caPath: chainFixture.duplicateRootBundle,
        certPath: chainFixture.client.complete,
      }),
    ).rejects.toMatchObject({ category: 'chain' })
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        allowCaBundle: true,
        caPath: chainFixture.oversizedAuthorityBundle,
        certPath: chainFixture.client.complete,
      }),
    ).rejects.toMatchObject({ category: 'ca' })
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        caPath: chainFixture.authorityBundle,
        certPath: chainFixture.client.leaf,
      }),
    ).rejects.toMatchObject({ category: 'ca' })
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        allowCaBundle: true,
        caPath: chainFixture.orphanIntermediateBundle,
        certPath: chainFixture.client.complete,
      }),
    ).rejects.toMatchObject({ category: 'ca' })
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        caPath: chainFixture.rootCertificate,
        certPath: chainFixture.nonCaChain,
        keyPath: chainFixture.nonCaLeafKey,
      }),
    ).rejects.toMatchObject({
      category: 'chain',
      message: 'TLS presented chain contains a non-CA issuer.',
    })
    await expect(
      loadStrictCertificateMaterial({
        ...clientOptions,
        caPath: chainFixture.derRootCertificate,
        certPath: chainFixture.derClientCertificate,
        keyPath: chainFixture.derClientKey,
      }),
    ).rejects.toMatchObject({ category: 'context' })
  })

  it('enforces root and intermediate Basic Constraints path lengths', async () => {
    const diagnostics = {
      caInvalid: 'ca',
      certificateExpired: 'expired',
      certificateInvalid: 'certificate',
      certificateNotYetValid: 'not-yet-valid',
      chainUntrusted: 'chain',
      fileInvalid: 'file',
      filePathInvalid: 'path',
      keyInvalid: 'key',
      keyMismatch: 'key-mismatch',
      leafRoleInvalid: 'role',
      peerIdentityInvalid: 'identity',
      tlsContextInvalid: 'context',
    }
    const fail = (category: string, message: string): never => {
      throw Object.assign(new Error(message), { category })
    }
    const base = {
      diagnostics,
      fail,
      identity: { type: 'subject' as const, value: 'CN=kravhantering-app' },
      role: 'client' as const,
    }

    for (const material of [
      chainFixture.pathLength.depthTwo,
      chainFixture.pathLength.unlimited,
    ]) {
      await expect(
        loadStrictCertificateMaterial({
          ...base,
          caPath: material.root,
          certPath: material.cert,
          keyPath: material.key,
        }),
      ).resolves.toEqual({
        ca: expect.any(Buffer),
        cert: expect.any(Buffer),
        key: expect.any(Buffer),
      })
    }

    for (const material of [
      chainFixture.pathLength.rootZeroViolation,
      chainFixture.pathLength.upperZeroViolation,
    ]) {
      await expect(
        loadStrictCertificateMaterial({
          ...base,
          caPath: material.root,
          certPath: material.cert,
          keyPath: material.key,
        }),
      ).rejects.toMatchObject({
        category: 'chain',
        message: 'TLS certificate chain violates a CA path length constraint.',
      })
    }

    for (const malformedRoot of chainFixture.pathLength.malformedRoots) {
      await expect(
        loadStrictCertificateMaterial({
          ...base,
          caPath: malformedRoot.certificate,
          certPath: chainFixture.pathLength.rootZeroViolation.cert,
          keyPath: chainFixture.pathLength.rootZeroViolation.key,
        }),
      ).rejects.toMatchObject({
        category: malformedRoot.expectedCategory,
        ...('expectedMessage' in malformedRoot
          ? { message: malformedRoot.expectedMessage }
          : {}),
      })
    }
  })

  it('rejects trailing non-certificate data in a trust bundle', async () => {
    const certificate = await readFile(
      fixture.bundle('kong', 'app-client-ca.crt'),
    )

    expect(() =>
      strictCertificateAuthorityRawValues(
        Buffer.concat([certificate, Buffer.from('\ninvalid')]),
      ),
    ).toThrow(expect.objectContaining({ diagnostic: 'tls_ca_invalid' }))
  })
})
