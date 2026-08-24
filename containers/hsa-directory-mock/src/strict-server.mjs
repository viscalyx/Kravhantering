import http from 'node:http'
import https from 'node:https'

import {
  extractRequest,
  faultResponse,
  findRecords,
  jsonResponse,
  loadFixtures,
  readBody,
  SoapFault,
  successResponse,
  xmlResponse,
} from './soap-fixture.mjs'
import { loadStrictTlsMaterial, StrictTlsError } from './strict-tls.mjs'

const BUSINESS_HOST = '0.0.0.0'
const BUSINESS_PORT = 8443
const HEALTH_HOST = '127.0.0.1'
const HEALTH_PORT = 8081
const SOAP_PATH = '/svr-hsaws2/hsaws'
export const STRICT_CORRELATION_CAPACITY = 10_000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export class StrictMockError extends Error {
  constructor(diagnostic, message) {
    super(message)
    this.name = 'StrictMockError'
    this.diagnostic = diagnostic
  }
}

export function strictMockDiagnostic(error) {
  return error instanceof StrictMockError ? error.diagnostic : null
}

export function strictMockStartupDiagnostic(error) {
  if (error instanceof StrictMockError) return error.diagnostic
  if (error instanceof StrictTlsError) return error.category
  return 'STARTUP_FAILED'
}

function envValue(env, name) {
  return env[name]?.trim() || undefined
}

export function readStrictMockConfig(env = process.env) {
  const config = {
    caPath: envValue(env, 'HSA_MOCK_TLS_CA_PATH'),
    certPath: envValue(env, 'HSA_MOCK_TLS_CERT_PATH'),
    expectedClientSerialNumber: envValue(
      env,
      'HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER',
    ),
    keyPath: envValue(env, 'HSA_MOCK_TLS_KEY_PATH'),
  }
  if (Object.values(config).some(value => !value)) {
    throw new StrictMockError(
      'mock_config_incomplete',
      'Strict HSA mock requires the complete mTLS tuple.',
    )
  }
  return config
}

export async function loadStrictMockSnapshot(config = readStrictMockConfig()) {
  const tls = await loadStrictTlsMaterial({
    caPath: config.caPath,
    certPath: config.certPath,
    expectedDnsIdentity: 'hsa-directory-mock',
    keyPath: config.keyPath,
    role: 'server',
  })
  return Object.freeze({ ...config, tls })
}

export class StrictCorrelationRecorder {
  #counts = new Map()
  #write

  constructor(write = event => console.log(JSON.stringify(event))) {
    this.#write = write
  }

  count(correlationId) {
    return this.#counts.get(correlationId) ?? 0
  }

  record(correlationId) {
    const handlingCount = this.count(correlationId) + 1
    if (
      !this.#counts.has(correlationId) &&
      this.#counts.size >= STRICT_CORRELATION_CAPACITY
    ) {
      this.#counts.delete(this.#counts.keys().next().value)
    }
    this.#counts.set(correlationId, handlingCount)
    this.#write({
      correlation_id: correlationId,
      event: 'hsa_mock_lookup_handled',
      handling_count: handlingCount,
    })
  }
}

function clientSerialNumber(req) {
  const certificate = req.socket.getPeerCertificate?.()
  const subject = certificate?.subject
  if (!subject || typeof subject !== 'object') return ''
  return String(
    subject.serialNumber ?? subject.serialnumber ?? subject['2.5.4.5'] ?? '',
  ).trim()
}

export function isStrictMockPeerAuthorized(
  authorized,
  serialNumber,
  expectedSerialNumber,
) {
  return authorized === true && serialNumber === expectedSerialNumber
}

export function createStrictMockBusinessServer(
  fixtures,
  snapshot,
  { recorder = new StrictCorrelationRecorder() } = {},
) {
  return https.createServer(
    {
      ca: snapshot.tls.ca,
      cert: snapshot.tls.cert,
      key: snapshot.tls.key,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      requestCert: true,
    },
    async (req, res) => {
      if (
        !isStrictMockPeerAuthorized(
          req.socket.authorized,
          clientSerialNumber(req),
          snapshot.expectedClientSerialNumber,
        )
      ) {
        jsonResponse(res, 403, { code: 'client_identity_rejected' })
        return
      }
      const url = new URL(req.url ?? '/', 'https://hsa-directory-mock')
      if (url.pathname !== SOAP_PATH) {
        jsonResponse(res, 404, { error: 'Not found' })
        return
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        jsonResponse(res, 405, { error: 'Method not allowed' })
        return
      }
      try {
        const request = extractRequest(await readBody(req))
        if (!UUID_PATTERN.test(request.messageId)) {
          jsonResponse(res, 400, { code: 'invalid_correlation' })
          return
        }
        recorder.record(request.messageId)
        xmlResponse(res, 200, successResponse(findRecords(fixtures, request)))
      } catch (error) {
        const code = error instanceof SoapFault ? error.code : 6
        xmlResponse(
          res,
          500,
          faultResponse(code, 'Invalid HSA directory request.'),
        )
      }
    },
  )
}

export function createStrictMockHealthServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://hsa-mock-health')
    if (req.method === 'GET' && url.pathname === '/health') {
      jsonResponse(res, 200, { status: 'ok' })
      return
    }
    jsonResponse(res, 404, { error: 'Not found' })
  })
}

async function listen(server, port, host) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

export async function startStrictMockServers({ fixtures, snapshot } = {}) {
  const resolvedSnapshot = snapshot ?? (await loadStrictMockSnapshot())
  const resolvedFixtures = fixtures ?? (await loadFixtures())
  const businessServer = createStrictMockBusinessServer(
    resolvedFixtures,
    resolvedSnapshot,
  )
  const healthServer = createStrictMockHealthServer()
  try {
    await listen(healthServer, HEALTH_PORT, HEALTH_HOST)
    await listen(businessServer, BUSINESS_PORT, BUSINESS_HOST)
  } catch (error) {
    healthServer.close()
    businessServer.close()
    throw error
  }
  return { businessServer, healthServer }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startStrictMockServers().catch(error => {
    console.error(
      JSON.stringify({
        diagnostic: strictMockStartupDiagnostic(error),
        event: 'hsa_mock_strict_startup_failed',
      }),
    )
    process.exitCode = 1
  })
}
