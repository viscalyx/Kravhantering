import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  createCertificateChainFixture,
  createInvalidRuntimeCertificateFixture,
  createRuntimeCertificateFixture,
} from '../../hsa-mtls-provisioner/test/runtime-fixture.mjs'
import {
  createStrictAdapterBusinessServer,
  createStrictAdapterHealthServer,
  isStrictAdapterPeerAuthorized,
  loadStrictAdapterSnapshot,
  postStrictSoap,
  readStrictAdapterConfig,
  startStrictAdapterServers,
  strictAdapterDiagnostic,
  strictAdapterStartupDiagnostic,
} from '../src/strict-server.mjs'
import { loadStrictTlsMaterial, StrictTlsError } from '../src/strict-tls.mjs'

const COMPLETE_ENV = {
  HSA_ADAPTER_INGRESS_CA_PATH: '/run/adapter/kong-client-ca.crt',
  HSA_ADAPTER_INGRESS_CERT_PATH: '/run/adapter/adapter-server.crt',
  HSA_ADAPTER_INGRESS_EXPECTED_CLIENT_SUBJECT: 'CN=kravhantering-kong',
  HSA_ADAPTER_INGRESS_KEY_PATH: '/run/adapter/adapter-server.key',
  HSA_SOAP_CA_PATH: '/run/adapter/hsa-server-ca.crt',
  HSA_SOAP_CLIENT_CERT_PATH: '/run/adapter/adapter-client.crt',
  HSA_SOAP_CLIENT_KEY_PATH: '/run/adapter/adapter-client.key',
  HSA_SOAP_ENDPOINT_URL: 'https://hsa-directory-mock:8443/svr-hsaws2/hsaws',
  HSA_SOAP_TLS_SERVER_NAME: 'hsa-directory-mock',
}

describe('strict HSA adapter configuration', () => {
  it('requires every ingress and egress mTLS field', () => {
    for (const missing of Object.keys(COMPLETE_ENV)) {
      const env = { ...COMPLETE_ENV }
      delete env[missing]
      assert.throws(
        () => readStrictAdapterConfig(env),
        error => strictAdapterDiagnostic(error) === 'adapter_config_incomplete',
      )
    }
  })

  it('rejects plaintext and invalid-port SOAP egress', () => {
    for (const endpointUrl of [
      'not-a-url',
      'http://hsa-directory-mock:8080/svr-hsaws2/hsaws',
      'https://hsa-directory-mock:0/svr-hsaws2/hsaws',
    ]) {
      assert.throws(
        () =>
          readStrictAdapterConfig({
            ...COMPLETE_ENV,
            HSA_SOAP_ENDPOINT_URL: endpointUrl,
          }),
        error => strictAdapterDiagnostic(error) === 'adapter_endpoint_invalid',
      )
    }
  })

  it('is an executable fail-closed runtime entrypoint', () => {
    const malformed = path.resolve('src/strict-server.mjs')
    for (const [env, diagnostic] of [
      [{ PATH: process.env.PATH }, 'adapter_config_incomplete'],
      [
        {
          ...COMPLETE_ENV,
          HSA_ADAPTER_INGRESS_CA_PATH: malformed,
          HSA_ADAPTER_INGRESS_CERT_PATH: malformed,
          HSA_ADAPTER_INGRESS_KEY_PATH: malformed,
          HSA_SOAP_CA_PATH: malformed,
          HSA_SOAP_CLIENT_CERT_PATH: malformed,
          HSA_SOAP_CLIENT_KEY_PATH: malformed,
          PATH: process.env.PATH,
        },
        'CA_INVALID',
      ],
    ]) {
      const result = spawnSync(process.execPath, ['src/strict-server.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env,
      })

      assert.equal(result.status, 1)
      assert.deepEqual(JSON.parse(result.stderr), {
        diagnostic,
        event: 'hsa_adapter_strict_startup_failed',
      })
    }
    assert.equal(
      strictAdapterStartupDiagnostic(new Error('internal')),
      'STARTUP_FAILED',
    )
  })
})

function successEnvelope() {
  return [
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<hsa:GetHsaPersonResponse xmlns:hsa="urn:riv:hsa:HsaWsResponder:3">',
    '<hsa:userInformations><hsa:userInformation>',
    '<hsa:hsaIdentity>SE5560000001-kalle1</hsa:hsaIdentity>',
    '<hsa:givenName>Kalle</hsa:givenName>',
    '</hsa:userInformation></hsa:userInformations>',
    '</hsa:GetHsaPersonResponse>',
    '</soap:Body></soap:Envelope>',
  ].join('')
}

function emptyEnvelope() {
  return [
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<hsa:GetHsaPersonResponse xmlns:hsa="urn:riv:hsa:HsaWsResponder:3">',
    '<hsa:userInformations/>',
    '</hsa:GetHsaPersonResponse>',
    '</soap:Body></soap:Envelope>',
  ].join('')
}

function conflictEnvelope() {
  return successEnvelope().replace(
    '</hsa:userInformation>',
    [
      '</hsa:userInformation><hsa:userInformation>',
      '<hsa:hsaIdentity>SE5560000001-kalle1</hsa:hsaIdentity>',
      '<hsa:givenName>Different</hsa:givenName>',
      '</hsa:userInformation>',
    ].join(''),
  )
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server.address().port
}

async function close(server) {
  await new Promise(resolve => server.close(resolve))
}

async function strictRequest(port, fixture, options = {}) {
  const body = options.body ?? JSON.stringify({ hsaId: 'SE5560000001-kalle1' })
  const ca = await readFile(fixture.bundle('kong', 'adapter-server-ca.crt'))
  const cert = options.withoutClient
    ? undefined
    : await readFile(fixture.bundle('kong', 'kong-client.crt'))
  const key = options.withoutClient
    ? undefined
    : await readFile(fixture.bundle('kong', 'kong-client.key'))
  return await new Promise((resolve, reject) => {
    const request = https.request(
      {
        ca,
        cert,
        headers: {
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json',
          'X-Kravhantering-HSA-Correlation-ID':
            options.correlation ?? '10000000-0000-4000-8000-000000000001',
        },
        hostname: '127.0.0.1',
        key,
        ...(options.maxVersion ? { maxVersion: options.maxVersion } : {}),
        method: options.method ?? 'POST',
        path: options.path ?? '/hsa/person-records/lookup',
        port,
        rejectUnauthorized: true,
        servername: 'hsa-person-lookup-adapter',
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            status: response.statusCode,
          }),
        )
      },
    )
    request.on('error', reject)
    request.end(body)
  })
}

describe('strict HSA adapter network boundary', () => {
  let fixture
  let chainFixture
  let invalidFixture
  let snapshot

  before(async () => {
    ;[fixture, invalidFixture, chainFixture] = await Promise.all([
      createRuntimeCertificateFixture(),
      createInvalidRuntimeCertificateFixture(),
      createCertificateChainFixture(),
    ])
    snapshot = await loadStrictAdapterSnapshot(
      readStrictAdapterConfig({
        HSA_ADAPTER_INGRESS_CA_PATH: fixture.bundle(
          'adapter',
          'kong-client-ca.crt',
        ),
        HSA_ADAPTER_INGRESS_CERT_PATH: fixture.bundle(
          'adapter',
          'adapter-server.crt',
        ),
        HSA_ADAPTER_INGRESS_EXPECTED_CLIENT_SUBJECT: 'CN=kravhantering-kong',
        HSA_ADAPTER_INGRESS_KEY_PATH: fixture.bundle(
          'adapter',
          'adapter-server.key',
        ),
        HSA_SOAP_CA_PATH: fixture.bundle('adapter', 'hsa-server-ca.crt'),
        HSA_SOAP_CLIENT_CERT_PATH: fixture.bundle(
          'adapter',
          'adapter-client.crt',
        ),
        HSA_SOAP_CLIENT_KEY_PATH: fixture.bundle(
          'adapter',
          'adapter-client.key',
        ),
        HSA_SOAP_ENDPOINT_URL:
          'https://hsa-directory-mock:8443/svr-hsaws2/hsaws',
        HSA_SOAP_TLS_SERVER_NAME: 'hsa-directory-mock',
      }),
    )
  })

  after(async () =>
    Promise.all([
      fixture.cleanup(),
      invalidFixture.cleanup(),
      chainFixture.cleanup(),
    ]),
  )

  it('requires a trusted exact client and maps correlation to MessageID', async () => {
    let soapRequest = ''
    const server = createStrictAdapterBusinessServer(snapshot, {
      postSoap: async xml => {
        soapRequest = xml
        return { body: successEnvelope(), status: 200 }
      },
    })
    const port = await listen(server)
    try {
      const response = await strictRequest(port, fixture)

      assert.equal(response.status, 200)
      assert.match(response.body, /"givenName":"Kalle"/u)
      assert.match(
        soapRequest,
        /<add:MessageID>10000000-0000-4000-8000-000000000001<\/add:MessageID>/u,
      )
      await assert.rejects(() =>
        strictRequest(port, fixture, { withoutClient: true }),
      )
      await assert.rejects(() =>
        strictRequest(port, fixture, { maxVersion: 'TLSv1.1' }),
      )
    } finally {
      await close(server)
    }
  })

  it('rejects a trusted but wrong exact subject at the authorization boundary', async () => {
    assert.equal(
      isStrictAdapterPeerAuthorized(
        true,
        'CN=another-trusted-client',
        'CN=kravhantering-kong',
      ),
      false,
    )
    assert.equal(
      isStrictAdapterPeerAuthorized(
        true,
        'CN=kravhantering-kong',
        'CN=kravhantering-kong',
      ),
      true,
    )
    const server = createStrictAdapterBusinessServer({
      ...snapshot,
      ingress: {
        ...snapshot.ingress,
        expectedClientSubject: 'CN=another-trusted-client',
      },
    })
    const port = await listen(server)
    try {
      assert.equal((await strictRequest(port, fixture)).status, 403)
    } finally {
      await close(server)
    }
  })

  it('rejects wrong-role and cross-domain startup material', async () => {
    const base = readStrictAdapterConfig({
      HSA_ADAPTER_INGRESS_CA_PATH: fixture.bundle(
        'adapter',
        'kong-client-ca.crt',
      ),
      HSA_ADAPTER_INGRESS_CERT_PATH: fixture.bundle(
        'adapter',
        'adapter-server.crt',
      ),
      HSA_ADAPTER_INGRESS_EXPECTED_CLIENT_SUBJECT: 'CN=kravhantering-kong',
      HSA_ADAPTER_INGRESS_KEY_PATH: fixture.bundle(
        'adapter',
        'adapter-server.key',
      ),
      HSA_SOAP_CA_PATH: fixture.bundle('adapter', 'hsa-server-ca.crt'),
      HSA_SOAP_CLIENT_CERT_PATH: fixture.bundle(
        'adapter',
        'adapter-client.crt',
      ),
      HSA_SOAP_CLIENT_KEY_PATH: fixture.bundle('adapter', 'adapter-client.key'),
      HSA_SOAP_ENDPOINT_URL: 'https://hsa-directory-mock:8443/svr-hsaws2/hsaws',
      HSA_SOAP_TLS_SERVER_NAME: 'hsa-directory-mock',
    })
    const cases = [
      {
        category: 'CHAIN_UNTRUSTED',
        config: {
          ...base,
          ingress: {
            ...base.ingress,
            caPath: fixture.bundle('kong', 'app-client-ca.crt'),
          },
        },
      },
      {
        category: 'LEAF_ROLE_INVALID',
        config: {
          ...base,
          soap: {
            ...base.soap,
            certPath: fixture.bundle('mock', 'mock-server.crt'),
            keyPath: fixture.bundle('mock', 'mock-server.key'),
          },
        },
      },
    ]
    for (const testCase of cases) {
      await assert.rejects(
        () => loadStrictAdapterSnapshot(testCase.config),
        error =>
          error instanceof StrictTlsError &&
          error.category === testCase.category,
      )
    }
  })

  it('categorizes malformed, non-current, and mismatched TLS material', async () => {
    const base = {
      caPath: fixture.bundle('adapter', 'kong-client-ca.crt'),
      certPath: fixture.bundle('adapter', 'adapter-server.crt'),
      expectedIdentity: {
        type: 'dns',
        value: 'hsa-person-lookup-adapter',
      },
      keyPath: fixture.bundle('adapter', 'adapter-server.key'),
      role: 'server',
    }
    const sourceFile = path.resolve('src/strict-server.mjs')
    const cases = [
      {
        category: 'FILE_PATH_INVALID',
        input: { ...base, caPath: 'relative/ca.crt' },
      },
      {
        category: 'FILE_INVALID',
        input: { ...base, caPath: path.resolve('missing-ca.crt') },
      },
      {
        category: 'FILE_INVALID',
        input: { ...base, caPath: path.resolve('.') },
      },
      {
        category: 'CA_INVALID',
        input: { ...base, caPath: sourceFile },
      },
      {
        category: 'CERTIFICATE_INVALID',
        input: { ...base, certPath: sourceFile },
      },
      {
        category: 'CERTIFICATE_NOT_YET_VALID',
        input: { ...base, now: new Date('2000-01-01') },
      },
      {
        category: 'CERTIFICATE_EXPIRED',
        input: { ...base, now: new Date('2100-01-01') },
      },
      {
        category: 'CA_INVALID',
        input: {
          ...base,
          caPath: fixture.bundle('adapter', 'adapter-server.crt'),
        },
      },
      {
        category: 'LEAF_ROLE_INVALID',
        input: {
          ...base,
          certPath: fixture.bundle('adapter', 'kong-client-ca.crt'),
        },
      },
      {
        category: 'KEY_INVALID',
        input: { ...base, keyPath: sourceFile },
      },
      {
        category: 'KEY_MISMATCH',
        input: {
          ...base,
          keyPath: fixture.bundle('mock', 'mock-server.key'),
        },
      },
      {
        category: 'PEER_IDENTITY_INVALID',
        input: {
          ...base,
          expectedIdentity: { type: 'dns', value: 'another-adapter' },
        },
      },
      {
        category: 'PEER_IDENTITY_INVALID',
        input: {
          caPath: fixture.bundle('adapter', 'kong-client-ca.crt'),
          certPath: fixture.bundle('kong', 'kong-client.crt'),
          expectedIdentity: {
            type: 'subject',
            value: 'CN=another-kong',
          },
          keyPath: fixture.bundle('kong', 'kong-client.key'),
          role: 'client',
        },
      },
      {
        category: 'PEER_IDENTITY_INVALID',
        input: {
          caPath: fixture.bundle('adapter', 'hsa-server-ca.crt'),
          certPath: fixture.bundle('adapter', 'adapter-client.crt'),
          expectedIdentity: {
            field: 'serialNumber',
            type: 'subject-field',
            value: 'SE5560000000-WRONG',
          },
          keyPath: fixture.bundle('adapter', 'adapter-client.key'),
          role: 'client',
        },
      },
    ]
    for (const testCase of cases) {
      await assert.rejects(
        () => loadStrictTlsMaterial(testCase.input),
        error =>
          error instanceof StrictTlsError &&
          error.category === testCase.category,
      )
    }
  })

  it('rejects dual-purpose and wrong-key-usage leaves for both roles', async () => {
    for (const role of ['client', 'server']) {
      for (const suffix of [
        'dual-eku',
        'missing-key-usage',
        'noncritical-key-usage',
        'wrong-key-usage',
      ]) {
        const material = invalidFixture.entry(`${role}-${suffix}`)
        await assert.rejects(
          () =>
            loadStrictTlsMaterial({
              caPath: invalidFixture.caCertificate,
              certPath: material.certificate,
              keyPath: material.key,
              role,
            }),
          error =>
            error instanceof StrictTlsError &&
            error.category === 'LEAF_ROLE_INVALID',
        )
      }
    }
  })

  it('accepts complete CA-bundle chains and rejects missing intermediates for both roles', async () => {
    for (const role of ['client', 'server']) {
      const material = chainFixture[role]
      const input = {
        caPath: chainFixture.authorityBundle,
        certPath: material.leaf,
        expectedIdentity:
          role === 'client'
            ? { type: 'subject', value: 'CN=kravhantering-app' }
            : { type: 'dns', value: 'hsa-person-lookup-adapter' },
        keyPath: material.key,
        role,
      }
      await assert.doesNotReject(() => loadStrictTlsMaterial(input))
      await assert.rejects(
        () =>
          loadStrictTlsMaterial({
            ...input,
            caPath: chainFixture.rootCertificate,
          }),
        error =>
          error instanceof StrictTlsError &&
          error.category === 'CHAIN_UNTRUSTED',
      )
    }
  })

  it('uses dedicated client material and exact DNS identity for SOAP egress', async () => {
    let received = ''
    const upstream = https.createServer(
      {
        ca: await readFile(fixture.bundle('mock', 'adapter-client-ca.crt')),
        cert: await readFile(fixture.bundle('mock', 'mock-server.crt')),
        key: await readFile(fixture.bundle('mock', 'mock-server.key')),
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        requestCert: true,
      },
      async (request, response) => {
        for await (const chunk of request) received += chunk
        response.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' })
        response.end(successEnvelope())
      },
    )
    const port = await listen(upstream)
    try {
      const response = await postStrictSoap('<soap-request/>', {
        ...snapshot.soap,
        endpointUrl: `https://127.0.0.1:${port}/svr-hsaws2/hsaws`,
      })

      assert.equal(response.status, 200)
      assert.equal(received, '<soap-request/>')
    } finally {
      await close(upstream)
    }
  })

  it('fails closed on invalid, oversized, and timed-out SOAP responses', async () => {
    let timeoutResponse
    const upstream = https.createServer(
      {
        ca: await readFile(fixture.bundle('mock', 'adapter-client-ca.crt')),
        cert: await readFile(fixture.bundle('mock', 'mock-server.crt')),
        key: await readFile(fixture.bundle('mock', 'mock-server.key')),
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        requestCert: true,
      },
      (request, response) => {
        if (request.url === '/bad-media') {
          response.writeHead(200, { 'Content-Type': 'text/plain' })
          response.end('not soap')
          return
        }
        if (request.url === '/oversized') {
          response.writeHead(200, { 'Content-Type': 'text/xml' })
          response.end('x'.repeat(1024 * 1024 + 1))
          return
        }
        timeoutResponse = response
      },
    )
    const port = await listen(upstream)
    try {
      for (const [pathname, timeoutMs] of [
        ['/bad-media', 5000],
        ['/oversized', 5000],
        ['/timeout', 10],
      ]) {
        await assert.rejects(() =>
          postStrictSoap('<soap-request/>', {
            ...snapshot.soap,
            endpointUrl: `https://127.0.0.1:${port}${pathname}`,
            timeoutMs,
          }),
        )
      }
    } finally {
      timeoutResponse?.destroy()
      await close(upstream)
    }
  })

  it('keeps health plaintext and separate from business traffic', async () => {
    const health = createStrictAdapterHealthServer()
    const healthPort = await listen(health)
    const business = createStrictAdapterBusinessServer(snapshot, {
      postSoap: async () => ({ body: successEnvelope(), status: 200 }),
    })
    const businessPort = await listen(business)
    try {
      const healthResponse = await fetch(
        `http://127.0.0.1:${healthPort}/health`,
      )
      assert.deepEqual(await healthResponse.json(), { status: 'ok' })
      assert.equal(
        (await fetch(`http://127.0.0.1:${healthPort}/svr-hsaws2/hsaws`)).status,
        404,
      )
      assert.equal(
        (await strictRequest(businessPort, fixture, { path: '/health' }))
          .status,
        404,
      )
    } finally {
      await close(health)
      await close(business)
    }
  })

  it('returns only bounded diagnostics for invalid requests and SOAP failures', async () => {
    const server = createStrictAdapterBusinessServer(snapshot, {
      postSoap: async () => {
        throw new Error('error:0A000086:SSL routines:certificate verify failed')
      },
    })
    const port = await listen(server)
    try {
      const invalidCorrelation = await strictRequest(port, fixture, {
        correlation: 'browser-value',
      })
      assert.equal(invalidCorrelation.status, 400)
      assert.deepEqual(JSON.parse(invalidCorrelation.body), {
        code: 'invalid_correlation',
      })
      const invalidBody = await strictRequest(port, fixture, { body: '{}' })
      assert.equal(invalidBody.status, 400)
      assert.equal(
        (await strictRequest(port, fixture, { method: 'GET' })).status,
        405,
      )
      assert.equal(
        (await strictRequest(port, fixture, { body: '{' })).status,
        400,
      )
      const unavailable = await strictRequest(port, fixture)
      assert.equal(unavailable.status, 503)
      assert.deepEqual(JSON.parse(unavailable.body), {
        code: 'service_unavailable',
        error: 'HSA person lookup adapter is unavailable.',
      })
      assert.doesNotMatch(unavailable.body, /SSL routines/u)
    } finally {
      await close(server)
    }
  })

  it('maps an upstream timeout to the bounded OpenAPI 504 outcome', async () => {
    const server = createStrictAdapterBusinessServer(snapshot, {
      postSoap: async () => {
        throw new Error('soap_timeout')
      },
    })
    const port = await listen(server)
    try {
      const response = await strictRequest(port, fixture)
      assert.equal(response.status, 504)
      assert.deepEqual(JSON.parse(response.body), {
        code: 'timeout',
        error: 'HSA person lookup timed out.',
      })
    } finally {
      await close(server)
    }
  })

  it('preserves bounded not-found and conflict REST outcomes', async () => {
    const responses = [
      { body: '', status: 502 },
      { body: emptyEnvelope(), status: 200 },
      { body: conflictEnvelope(), status: 200 },
    ]
    const server = createStrictAdapterBusinessServer(snapshot, {
      postSoap: async () => responses.shift(),
    })
    const port = await listen(server)
    try {
      assert.equal((await strictRequest(port, fixture)).status, 503)
      assert.equal((await strictRequest(port, fixture)).status, 404)
      assert.equal((await strictRequest(port, fixture)).status, 409)
    } finally {
      await close(server)
    }
  })

  it('starts only the fixed strict business and loopback health listeners', async () => {
    const servers = await startStrictAdapterServers({ snapshot })
    try {
      const response = await fetch('http://127.0.0.1:8081/health')
      assert.deepEqual(await response.json(), { status: 'ok' })
      assert.deepEqual(servers.businessServer.address(), {
        address: '0.0.0.0',
        family: 'IPv4',
        port: 8443,
      })
    } finally {
      await close(servers.businessServer)
      await close(servers.healthServer)
    }
  })
})
