import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { checkServerIdentity } from 'node:tls'

import {
  mapSoapPeopleToRest,
  parseGetHsaPersonResponse,
  soapRequestXml,
} from './soap-contract.mjs'
import { loadStrictTlsMaterial, StrictTlsError } from './strict-tls.mjs'

const CORRELATION_HEADER = 'x-kravhantering-hsa-correlation-id'
const HEALTH_HOST = '127.0.0.1'
const HEALTH_PORT = 8081
const BUSINESS_HOST = '0.0.0.0'
const BUSINESS_PORT = 8443
const LOOKUP_PATH = '/hsa/person-records/lookup'
const MAX_BODY_BYTES = 1024 * 1024
const MAX_SOAP_BYTES = 1024 * 1024
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export class StrictAdapterError extends Error {
  constructor(diagnostic, message) {
    super(message)
    this.name = 'StrictAdapterError'
    this.diagnostic = diagnostic
  }
}

export function strictAdapterDiagnostic(error) {
  return error instanceof StrictAdapterError ? error.diagnostic : null
}

export function strictAdapterStartupDiagnostic(error) {
  if (error instanceof StrictAdapterError) return error.diagnostic
  if (error instanceof StrictTlsError) return error.category
  return 'STARTUP_FAILED'
}

function envValue(env, name) {
  return env[name]?.trim() || undefined
}

function exactDnsName(value) {
  return (
    value !== 'localhost' &&
    !value.includes('*') &&
    net.isIP(value) === 0 &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value)
  )
}

export function readStrictAdapterConfig(env = process.env) {
  const config = {
    ingress: {
      caPath: envValue(env, 'HSA_ADAPTER_INGRESS_CA_PATH'),
      certPath: envValue(env, 'HSA_ADAPTER_INGRESS_CERT_PATH'),
      expectedClientSubject: envValue(
        env,
        'HSA_ADAPTER_INGRESS_EXPECTED_CLIENT_SUBJECT',
      ),
      keyPath: envValue(env, 'HSA_ADAPTER_INGRESS_KEY_PATH'),
    },
    soap: {
      caPath: envValue(env, 'HSA_SOAP_CA_PATH'),
      certPath: envValue(env, 'HSA_SOAP_CLIENT_CERT_PATH'),
      endpointUrl: envValue(env, 'HSA_SOAP_ENDPOINT_URL'),
      keyPath: envValue(env, 'HSA_SOAP_CLIENT_KEY_PATH'),
      serverName: envValue(env, 'HSA_SOAP_TLS_SERVER_NAME'),
      timeoutMs: Number(envValue(env, 'HSA_SOAP_TIMEOUT_MS') ?? 5000),
      to: envValue(env, 'HSA_SOAP_TO') ?? 'SE165565594230-1000',
    },
  }
  if (
    Object.values(config.ingress).some(value => !value) ||
    [
      config.soap.caPath,
      config.soap.certPath,
      config.soap.endpointUrl,
      config.soap.keyPath,
      config.soap.serverName,
    ].some(value => !value)
  ) {
    throw new StrictAdapterError(
      'adapter_config_incomplete',
      'Strict Adapter ingress and SOAP egress require complete mTLS tuples.',
    )
  }
  let endpoint
  try {
    endpoint = new URL(config.soap.endpointUrl)
  } catch {
    throw new StrictAdapterError(
      'adapter_endpoint_invalid',
      'Strict Adapter SOAP endpoint is invalid.',
    )
  }
  if (
    endpoint.protocol !== 'https:' ||
    (endpoint.port !== '' && Number(endpoint.port) < 1) ||
    !exactDnsName(config.soap.serverName) ||
    !Number.isInteger(config.soap.timeoutMs) ||
    config.soap.timeoutMs < 1 ||
    config.soap.timeoutMs > 30_000
  ) {
    throw new StrictAdapterError(
      'adapter_endpoint_invalid',
      'Strict Adapter SOAP endpoint contract is invalid.',
    )
  }
  return config
}

export async function loadStrictAdapterSnapshot(
  config = readStrictAdapterConfig(),
) {
  const [ingressTls, soapTls] = await Promise.all([
    loadStrictTlsMaterial({
      caPath: config.ingress.caPath,
      certPath: config.ingress.certPath,
      expectedIdentity: { type: 'dns', value: 'hsa-person-lookup-adapter' },
      keyPath: config.ingress.keyPath,
      role: 'server',
    }),
    loadStrictTlsMaterial({
      caPath: config.soap.caPath,
      certPath: config.soap.certPath,
      expectedIdentity: {
        field: 'serialNumber',
        type: 'subject-field',
        value: 'SE5560000000-MOCK001',
      },
      keyPath: config.soap.keyPath,
      role: 'client',
    }),
  ])
  return Object.freeze({
    ingress: Object.freeze({ ...config.ingress, tls: ingressTls }),
    soap: Object.freeze({ ...config.soap, tls: soapTls }),
  })
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('request_too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function isSoapMediaType(value) {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'text/xml' || mediaType === 'application/soap+xml'
}

export async function postStrictSoap(xml, soap) {
  const endpoint = new URL(soap.endpointUrl)
  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = action => {
      if (settled) return
      settled = true
      action()
    }
    const request = https.request(
      {
        ca: soap.tls.ca,
        cert: soap.tls.cert,
        checkServerIdentity: (_hostname, certificate) => {
          if (certificate.subjectaltname !== `DNS:${soap.serverName}`) {
            return new Error('strict_server_identity_rejected')
          }
          return checkServerIdentity(soap.serverName, certificate)
        },
        headers: {
          Accept: 'text/xml',
          'Content-Length': Buffer.byteLength(xml),
          'Content-Type': 'text/xml; charset=utf-8',
        },
        hostname: endpoint.hostname,
        key: soap.tls.key,
        method: 'POST',
        minVersion: 'TLSv1.2',
        path: `${endpoint.pathname}${endpoint.search}`,
        port: endpoint.port ? Number(endpoint.port) : 443,
        rejectUnauthorized: true,
        servername: soap.serverName,
        timeout: soap.timeoutMs,
      },
      response => {
        if (!isSoapMediaType(response.headers['content-type'])) {
          response.destroy()
          finish(() => reject(new Error('invalid_soap_media_type')))
          return
        }
        const chunks = []
        let total = 0
        response.on('data', chunk => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          total += buffer.byteLength
          if (total > MAX_SOAP_BYTES) {
            response.destroy()
            finish(() => reject(new Error('soap_response_too_large')))
            return
          }
          chunks.push(buffer)
        })
        response.on('error', error => finish(() => reject(error)))
        response.on('end', () =>
          finish(() =>
            resolve({
              body: Buffer.concat(chunks).toString('utf8'),
              status: response.statusCode ?? 0,
            }),
          ),
        )
      },
    )
    request.on('timeout', () => request.destroy(new Error('soap_timeout')))
    request.on('error', error => finish(() => reject(error)))
    request.write(xml)
    request.end()
  })
}

function peerSubject(req) {
  const certificate = req.socket.getPeerCertificate?.()
  const subject = certificate?.subject
  if (!subject || typeof subject !== 'object') return null
  return Object.entries(subject)
    .reverse()
    .map(([name, value]) => `${name}=${value}`)
    .join(',')
}

export function isStrictAdapterPeerAuthorized(
  authorized,
  subject,
  expectedSubject,
) {
  return authorized === true && subject === expectedSubject
}

export function createStrictAdapterBusinessServer(
  snapshot,
  { postSoap = postStrictSoap } = {},
) {
  return https.createServer(
    {
      ca: snapshot.ingress.tls.ca,
      cert: snapshot.ingress.tls.cert,
      key: snapshot.ingress.tls.key,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      requestCert: true,
    },
    async (req, res) => {
      try {
        if (
          !isStrictAdapterPeerAuthorized(
            req.socket.authorized,
            peerSubject(req),
            snapshot.ingress.expectedClientSubject,
          )
        ) {
          jsonResponse(res, 403, { code: 'client_identity_rejected' })
          return
        }
        const url = new URL(req.url ?? '/', 'https://adapter')
        if (url.pathname !== LOOKUP_PATH) {
          jsonResponse(res, 404, { code: 'not_found' })
          return
        }
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          jsonResponse(res, 405, { code: 'method_not_allowed' })
          return
        }
        const correlation = String(req.headers[CORRELATION_HEADER] ?? '')
        if (!UUID_PATTERN.test(correlation)) {
          jsonResponse(res, 400, { code: 'invalid_correlation' })
          return
        }
        let payload
        try {
          payload = JSON.parse(await readBody(req))
        } catch {
          jsonResponse(res, 400, { code: 'validation' })
          return
        }
        const hsaId =
          typeof payload?.hsaId === 'string' ? payload.hsaId.trim() : ''
        if (!hsaId) {
          jsonResponse(res, 400, { code: 'validation' })
          return
        }
        console.log(
          JSON.stringify({
            correlation_id: correlation,
            event: 'hsa_adapter_lookup_forwarded',
          }),
        )
        const response = await postSoap(
          soapRequestXml(hsaId, {
            messageId: correlation,
            to: snapshot.soap.to,
          }),
          snapshot.soap,
        )
        if (response.status < 200 || response.status >= 300) {
          throw new Error('soap_status')
        }
        try {
          jsonResponse(
            res,
            200,
            mapSoapPeopleToRest(
              parseGetHsaPersonResponse(response.body),
              hsaId,
            ),
          )
        } catch (error) {
          if (error?.code === 'not_found') {
            jsonResponse(res, 404, { code: 'not_found' })
            return
          }
          if (error?.code === 'conflict') {
            jsonResponse(res, 409, { code: 'conflict' })
            return
          }
          throw error
        }
      } catch (error) {
        if (error?.message === 'soap_timeout') {
          jsonResponse(res, 504, {
            code: 'timeout',
            error: 'HSA person lookup timed out.',
          })
          return
        }
        jsonResponse(res, 503, {
          code: 'service_unavailable',
          error: 'HSA person lookup adapter is unavailable.',
        })
      }
    },
  )
}

export function createStrictAdapterHealthServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://adapter-health')
    if (req.method === 'GET' && url.pathname === '/health') {
      jsonResponse(res, 200, { status: 'ok' })
      return
    }
    jsonResponse(res, 404, { code: 'not_found' })
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

export async function startStrictAdapterServers({ snapshot } = {}) {
  const resolved = snapshot ?? (await loadStrictAdapterSnapshot())
  const businessServer = createStrictAdapterBusinessServer(resolved)
  const healthServer = createStrictAdapterHealthServer()
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
  startStrictAdapterServers().catch(error => {
    console.error(
      JSON.stringify({
        diagnostic: strictAdapterStartupDiagnostic(error),
        event: 'hsa_adapter_strict_startup_failed',
      }),
    )
    process.exitCode = 1
  })
}
