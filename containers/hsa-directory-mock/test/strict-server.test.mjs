import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  createInvalidRuntimeCertificateFixture,
  createRuntimeCertificateFixture,
} from '../../hsa-mtls-provisioner/test/runtime-fixture.mjs'
import { loadFixtures } from '../src/soap-fixture.mjs'
import {
  createStrictMockBusinessServer,
  createStrictMockHealthServer,
  isStrictMockPeerAuthorized,
  loadStrictMockSnapshot,
  readStrictMockConfig,
  STRICT_CORRELATION_CAPACITY,
  StrictCorrelationRecorder,
  startStrictMockServers,
  strictMockDiagnostic,
  strictMockStartupDiagnostic,
} from '../src/strict-server.mjs'
import { loadStrictTlsMaterial, StrictTlsError } from '../src/strict-tls.mjs'

const COMPLETE_ENV = {
  HSA_MOCK_TLS_CA_PATH: '/run/mock/adapter-client-ca.crt',
  HSA_MOCK_TLS_CERT_PATH: '/run/mock/mock-server.crt',
  HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER: 'SE5560000000-MOCK001',
  HSA_MOCK_TLS_KEY_PATH: '/run/mock/mock-server.key',
}

describe('strict HSA directory mock configuration', () => {
  it('has no authentication mode and requires the exact mTLS tuple', () => {
    for (const missing of Object.keys(COMPLETE_ENV)) {
      const env = { ...COMPLETE_ENV, HSA_MOCK_AUTH_MODE: 'disabled' }
      delete env[missing]
      assert.throws(
        () => readStrictMockConfig(env),
        error => strictMockDiagnostic(error) === 'mock_config_incomplete',
      )
    }

    assert.deepEqual(readStrictMockConfig(COMPLETE_ENV), {
      caPath: COMPLETE_ENV.HSA_MOCK_TLS_CA_PATH,
      certPath: COMPLETE_ENV.HSA_MOCK_TLS_CERT_PATH,
      expectedClientSerialNumber:
        COMPLETE_ENV.HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER,
      keyPath: COMPLETE_ENV.HSA_MOCK_TLS_KEY_PATH,
    })
    assert.equal(strictMockDiagnostic(new Error('unrelated')), null)
  })

  it('records only sanitized exactly-once correlation evidence', () => {
    const events = []
    const recorder = new StrictCorrelationRecorder(event => events.push(event))
    const id = '10000000-0000-4000-8000-000000000001'

    recorder.record(id)
    recorder.record(id)

    assert.equal(recorder.count(id), 2)
    assert.deepEqual(events, [
      {
        correlation_id: id,
        event: 'hsa_mock_lookup_handled',
        handling_count: 1,
      },
      {
        correlation_id: id,
        event: 'hsa_mock_lookup_handled',
        handling_count: 2,
      },
    ])
    assert.doesNotMatch(JSON.stringify(events), /hsaId|givenName|person/u)
  })

  it('evicts the oldest correlation after reaching fixed capacity', () => {
    const recorder = new StrictCorrelationRecorder(() => {})
    const oldest = '00000000-0000-4000-8000-000000000000'

    recorder.record(oldest)
    recorder.record(oldest)
    for (let index = 1; index <= STRICT_CORRELATION_CAPACITY; index += 1) {
      recorder.record(
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      )
    }

    assert.equal(recorder.count(oldest), 0)
    recorder.record(oldest)
    assert.equal(recorder.count(oldest), 1)
  })

  it('is an executable fail-closed runtime entrypoint', () => {
    const malformed = path.resolve('src/strict-server.mjs')
    for (const [env, diagnostic] of [
      [{ PATH: process.env.PATH }, 'mock_config_incomplete'],
      [
        {
          HSA_MOCK_TLS_CA_PATH: malformed,
          HSA_MOCK_TLS_CERT_PATH: malformed,
          HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER: 'SE5560000000-MOCK001',
          HSA_MOCK_TLS_KEY_PATH: malformed,
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
        event: 'hsa_mock_strict_startup_failed',
      })
    }
    assert.equal(
      strictMockStartupDiagnostic(new Error('internal')),
      'STARTUP_FAILED',
    )
  })
})

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

function envelope(correlationId = '10000000-0000-4000-8000-000000000001') {
  return [
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"',
    ' xmlns:add="http://www.w3.org/2005/08/addressing"',
    ' xmlns:urn="urn:riv:hsa:HsaWsResponder:3">',
    '<soap:Header>',
    `<add:MessageID>${correlationId}</add:MessageID>`,
    '<add:To>SE165565594230-1000</add:To>',
    '</soap:Header><soap:Body><urn:GetHsaPerson>',
    '<urn:hsaIdentity>SE1000-004</urn:hsaIdentity>',
    '</urn:GetHsaPerson></soap:Body></soap:Envelope>',
  ].join('')
}

async function soapRequest(
  port,
  fixture,
  {
    body = envelope(),
    maxVersion,
    method = 'POST',
    path = '/svr-hsaws2/hsaws',
    withoutClient = false,
  } = {},
) {
  const ca = await readFile(fixture.bundle('adapter', 'hsa-server-ca.crt'))
  const cert = withoutClient
    ? undefined
    : await readFile(fixture.bundle('adapter', 'adapter-client.crt'))
  const key = withoutClient
    ? undefined
    : await readFile(fixture.bundle('adapter', 'adapter-client.key'))
  return await new Promise((resolve, reject) => {
    const request = https.request(
      {
        ca,
        cert,
        headers: {
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'text/xml; charset=utf-8',
        },
        hostname: '127.0.0.1',
        key,
        ...(maxVersion ? { maxVersion } : {}),
        method,
        path,
        port,
        rejectUnauthorized: true,
        servername: 'hsa-directory-mock',
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

describe('strict HSA directory mock network boundary', () => {
  let fixture
  let fixtures
  let invalidFixture
  let snapshot

  before(async () => {
    ;[fixture, invalidFixture] = await Promise.all([
      createRuntimeCertificateFixture(),
      createInvalidRuntimeCertificateFixture(),
    ])
    fixtures = await loadFixtures()
    snapshot = await loadStrictMockSnapshot(
      readStrictMockConfig({
        HSA_MOCK_TLS_CA_PATH: fixture.bundle('mock', 'adapter-client-ca.crt'),
        HSA_MOCK_TLS_CERT_PATH: fixture.bundle('mock', 'mock-server.crt'),
        HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER: 'SE5560000000-MOCK001',
        HSA_MOCK_TLS_KEY_PATH: fixture.bundle('mock', 'mock-server.key'),
      }),
    )
  })

  after(async () => Promise.all([fixture.cleanup(), invalidFixture.cleanup()]))

  it('requires mTLS and records one sanitized event for one lookup', async () => {
    const events = []
    const recorder = new StrictCorrelationRecorder(event => events.push(event))
    const server = createStrictMockBusinessServer(fixtures, snapshot, {
      recorder,
    })
    const port = await listen(server)
    try {
      const response = await soapRequest(port, fixture)

      assert.equal(response.status, 200)
      assert.match(response.body, /<hsa:givenName>Kalle<\/hsa:givenName>/u)
      assert.deepEqual(events, [
        {
          correlation_id: '10000000-0000-4000-8000-000000000001',
          event: 'hsa_mock_lookup_handled',
          handling_count: 1,
        },
      ])
      await assert.rejects(() =>
        soapRequest(port, fixture, { withoutClient: true }),
      )
      await assert.rejects(() =>
        soapRequest(port, fixture, { maxVersion: 'TLSv1.1' }),
      )
    } finally {
      await close(server)
    }
  })

  it('rejects a trusted but wrong serialNumber identity', async () => {
    assert.equal(
      isStrictMockPeerAuthorized(
        true,
        'SE5560000000-ANOTHER',
        'SE5560000000-MOCK001',
      ),
      false,
    )
    assert.equal(
      isStrictMockPeerAuthorized(
        true,
        'SE5560000000-MOCK001',
        'SE5560000000-MOCK001',
      ),
      true,
    )
    const server = createStrictMockBusinessServer(fixtures, {
      ...snapshot,
      expectedClientSerialNumber: 'SE5560000000-ANOTHER',
    })
    const port = await listen(server)
    try {
      assert.equal((await soapRequest(port, fixture)).status, 403)
    } finally {
      await close(server)
    }
  })

  it('rejects wrong-trust-domain and wrong-server-identity snapshots', async () => {
    await assert.rejects(
      () =>
        loadStrictMockSnapshot({
          caPath: fixture.bundle('adapter', 'kong-client-ca.crt'),
          certPath: fixture.bundle('mock', 'mock-server.crt'),
          expectedClientSerialNumber: 'SE5560000000-MOCK001',
          keyPath: fixture.bundle('mock', 'mock-server.key'),
        }),
      error =>
        error instanceof StrictTlsError && error.category === 'CHAIN_UNTRUSTED',
    )
    await assert.rejects(
      () =>
        loadStrictMockSnapshot({
          caPath: fixture.bundle('adapter', 'kong-client-ca.crt'),
          certPath: fixture.bundle('adapter', 'adapter-server.crt'),
          expectedClientSerialNumber: 'SE5560000000-MOCK001',
          keyPath: fixture.bundle('adapter', 'adapter-server.key'),
        }),
      error =>
        error instanceof StrictTlsError &&
        error.category === 'PEER_IDENTITY_INVALID',
    )
  })

  it('categorizes malformed, non-current, and mismatched TLS material', async () => {
    const base = {
      caPath: fixture.bundle('mock', 'adapter-client-ca.crt'),
      certPath: fixture.bundle('mock', 'mock-server.crt'),
      expectedDnsIdentity: 'hsa-directory-mock',
      keyPath: fixture.bundle('mock', 'mock-server.key'),
      role: 'server',
    }
    const sourceFile = path.resolve('src/strict-server.mjs')
    await assert.doesNotReject(() =>
      loadStrictTlsMaterial({ ...base, expectedDnsIdentity: undefined }),
    )
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
        input: { ...base, caPath: fixture.bundle('mock', 'mock-server.crt') },
      },
      {
        category: 'LEAF_ROLE_INVALID',
        input: {
          ...base,
          certPath: fixture.bundle('mock', 'adapter-client-ca.crt'),
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
          keyPath: fixture.bundle('adapter', 'adapter-server.key'),
        },
      },
      {
        category: 'PEER_IDENTITY_INVALID',
        input: { ...base, expectedDnsIdentity: 'another-mock' },
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

  it('rejects dual-purpose and wrong-key-usage server leaves', async () => {
    for (const suffix of [
      'dual-eku',
      'missing-key-usage',
      'noncritical-key-usage',
      'wrong-key-usage',
    ]) {
      const material = invalidFixture.entry(`server-${suffix}`)
      await assert.rejects(
        () =>
          loadStrictTlsMaterial({
            caPath: invalidFixture.caCertificate,
            certPath: material.certificate,
            keyPath: material.key,
            role: 'server',
          }),
        error =>
          error instanceof StrictTlsError &&
          error.category === 'LEAF_ROLE_INVALID',
      )
    }
  })

  it('keeps loopback health separate from the SOAP listener', async () => {
    const health = createStrictMockHealthServer()
    const port = await listen(health)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      assert.deepEqual(await response.json(), { status: 'ok' })
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/svr-hsaws2/hsaws`)).status,
        404,
      )
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/health`, { method: 'POST' }))
          .status,
        404,
      )
    } finally {
      await close(health)
    }
  })

  it('returns bounded outcomes for invalid strict SOAP requests', async () => {
    const server = createStrictMockBusinessServer(fixtures, snapshot)
    const port = await listen(server)
    try {
      assert.equal(
        (await soapRequest(port, fixture, { path: '/another-path' })).status,
        404,
      )
      assert.equal(
        (await soapRequest(port, fixture, { method: 'GET' })).status,
        405,
      )
      assert.equal(
        (
          await soapRequest(port, fixture, {
            body: envelope('caller-controlled-value'),
          })
        ).status,
        400,
      )
      const malformed = await soapRequest(port, fixture, { body: '<secret>' })
      assert.equal(malformed.status, 500)
      assert.match(malformed.body, /<hsa:code>3<\/hsa:code>/u)
      assert.doesNotMatch(malformed.body, /secret|Malformed XML/u)
      const unsupportedSearchBase = await soapRequest(port, fixture, {
        body: envelope().replace(
          '</urn:GetHsaPerson>',
          '<urn:searchBase>ou=wrong</urn:searchBase></urn:GetHsaPerson>',
        ),
      })
      assert.equal(unsupportedSearchBase.status, 500)
      assert.match(unsupportedSearchBase.body, /<hsa:code>6<\/hsa:code>/u)
    } finally {
      await close(server)
    }
  })

  it('starts only the fixed strict business and loopback health listeners', async () => {
    const strictEnvironment = {
      HSA_MOCK_TLS_CA_PATH: fixture.bundle('mock', 'adapter-client-ca.crt'),
      HSA_MOCK_TLS_CERT_PATH: fixture.bundle('mock', 'mock-server.crt'),
      HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER: 'SE5560000000-MOCK001',
      HSA_MOCK_TLS_KEY_PATH: fixture.bundle('mock', 'mock-server.key'),
    }
    const previousEnvironment = Object.fromEntries(
      Object.keys(strictEnvironment).map(name => [name, process.env[name]]),
    )
    Object.assign(process.env, strictEnvironment)
    const servers = await startStrictMockServers()
    const events = []
    const originalLog = console.log
    console.log = value => events.push(JSON.parse(value))
    try {
      const response = await fetch('http://127.0.0.1:8081/health')
      assert.deepEqual(await response.json(), { status: 'ok' })
      assert.deepEqual(servers.businessServer.address(), {
        address: '0.0.0.0',
        family: 'IPv4',
        port: 8443,
      })
      assert.equal((await soapRequest(8443, fixture)).status, 200)
      assert.deepEqual(events, [
        {
          correlation_id: '10000000-0000-4000-8000-000000000001',
          event: 'hsa_mock_lookup_handled',
          handling_count: 1,
        },
      ])
    } finally {
      console.log = originalLog
      await close(servers.businessServer)
      await close(servers.healthServer)
      for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  })

  it('fails closed and cleans up when the fixed health listener is unavailable', async () => {
    const blocker = http.createServer()
    await new Promise((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(8081, '127.0.0.1', resolve)
    })
    try {
      await assert.rejects(() => startStrictMockServers({ fixtures, snapshot }))
    } finally {
      await close(blocker)
    }
  })
})
