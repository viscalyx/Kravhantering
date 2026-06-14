import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { SaxesParser } from 'saxes'

export const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'
export const ADDRESSING_NS = 'http://www.w3.org/2005/08/addressing'
export const HSA_NS = 'urn:riv:hsa:HsaWsResponder:3'

const DEFAULT_PORT = 8080
const DEFAULT_SOAP_ENDPOINT = 'https://hsa-directory-mock:8443/svr-hsaws2/hsaws'
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_TO = 'SE165565594230-1000'
const HEALTH_PATH = '/health'
const LOOKUP_PATH = '/hsa/person-records/lookup'
const MAX_BODY_BYTES = 1024 * 1024

class AdapterError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'AdapterError'
    this.status = status
    this.code = code
  }
}

class SoapFault extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SoapFault'
    this.code = code
  }
}

function readString(name, fallback = undefined, env = process.env) {
  const value = env[name]?.trim()
  return value || fallback
}

function readTimeout(env = process.env) {
  const raw = readString('HSA_SOAP_TIMEOUT_MS', undefined, env)
  if (!raw) return DEFAULT_TIMEOUT_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(parsed), 30_000)
}

export function readConfig(env = process.env) {
  return {
    caPath: readString('HSA_SOAP_CA_PATH', '/run/hsa-mtls/ca.crt', env),
    certPath: readString(
      'HSA_SOAP_CLIENT_CERT_PATH',
      '/run/hsa-mtls/client.crt',
      env,
    ),
    endpointUrl: readString(
      'HSA_SOAP_ENDPOINT_URL',
      DEFAULT_SOAP_ENDPOINT,
      env,
    ),
    keyPath: readString(
      'HSA_SOAP_CLIENT_KEY_PATH',
      '/run/hsa-mtls/client.key',
      env,
    ),
    serverName: readString('HSA_SOAP_TLS_SERVER_NAME', undefined, env),
    timeoutMs: readTimeout(env),
    to: readString('HSA_SOAP_TO', DEFAULT_TO, env),
  }
}

function elementNode(tag) {
  return {
    children: [],
    local: tag.local,
    text: '',
    uri: tag.uri,
  }
}

function parseXmlDocument(xml) {
  const parser = new SaxesParser({ xmlns: true })
  const root = { children: [] }
  const stack = [root]
  let parserError = null

  parser.on('opentag', tag => {
    const node = elementNode(tag)
    stack.at(-1).children.push(node)
    stack.push(node)
  })
  parser.on('text', text => {
    stack.at(-1).text += text
  })
  parser.on('cdata', text => {
    stack.at(-1).text += text
  })
  parser.on('closetag', () => {
    stack.pop()
  })
  parser.on('error', error => {
    parserError = error
    parser.close()
  })

  parser.write(xml).close()
  if (parserError) {
    throw new SoapFault(
      'parse_error',
      `Malformed SOAP XML: ${parserError.message}`,
    )
  }
  if (root.children.length !== 1) {
    throw new SoapFault('parse_error', 'SOAP response must contain one root.')
  }
  return root.children[0]
}

function child(node, uri, local) {
  return node.children.find(candidate => {
    return candidate.uri === uri && candidate.local === local
  })
}

function children(node, uri, local) {
  return node.children.filter(candidate => {
    return candidate.uri === uri && candidate.local === local
  })
}

function childText(node, uri, local) {
  const candidate = child(node, uri, local)
  return candidate ? candidate.text.trim() : ''
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function soapRequestXml(
  hsaId,
  { messageId = randomUUID(), to = DEFAULT_TO } = {},
) {
  return [
    '<soap:Envelope',
    ` xmlns:soap="${SOAP_NS}"`,
    ` xmlns:add="${ADDRESSING_NS}"`,
    ` xmlns:urn="${HSA_NS}">`,
    '<soap:Header>',
    `<add:MessageID>${escapeXml(messageId)}</add:MessageID>`,
    `<add:To>${escapeXml(to)}</add:To>`,
    '</soap:Header>',
    '<soap:Body>',
    '<urn:GetHsaPerson>',
    `<urn:hsaIdentity>${escapeXml(hsaId)}</urn:hsaIdentity>`,
    '<urn:searchBase>c=SE</urn:searchBase>',
    '</urn:GetHsaPerson>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('')
}

function booleanFromText(value) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1'
}

function normalizeUserInformation(node) {
  return {
    email: childText(node, HSA_NS, 'mail') || null,
    givenName: childText(node, HSA_NS, 'givenName') || null,
    hasProtectedPersonalData: booleanFromText(
      childText(node, HSA_NS, 'hsaProtectedPerson'),
    ),
    hsaId: childText(node, HSA_NS, 'hsaIdentity') || null,
    middleName: childText(node, HSA_NS, 'middleName') || null,
    surname: childText(node, HSA_NS, 'sn') || null,
  }
}

function personRecordKey(person) {
  return JSON.stringify({
    email: person.email?.toLocaleLowerCase('sv') ?? null,
    givenName: person.givenName,
    hasProtectedPersonalData: person.hasProtectedPersonalData,
    middleName: person.middleName,
    surname: person.surname,
  })
}

export function parseGetHsaPersonResponse(xml) {
  const envelope = parseXmlDocument(xml)
  const body = child(envelope, SOAP_NS, 'Body')
  if (!body) {
    throw new SoapFault('parse_error', 'SOAP Body is missing.')
  }

  const fault = child(body, SOAP_NS, 'Fault')
  if (fault) {
    const detail = child(fault, '', 'detail') ?? child(fault, SOAP_NS, 'detail')
    const hsaFault = detail ? child(detail, HSA_NS, 'HsaWsFault') : null
    const code = hsaFault ? childText(hsaFault, HSA_NS, 'code') : 'soap_fault'
    const message = hsaFault
      ? childText(hsaFault, HSA_NS, 'message')
      : childText(fault, '', 'faultstring')
    throw new SoapFault(code || 'soap_fault', message || 'SOAP Fault')
  }

  const response = child(body, HSA_NS, 'GetHsaPersonResponse')
  if (!response) {
    throw new SoapFault('parse_error', 'GetHsaPersonResponse is missing.')
  }
  const wrapper = child(response, HSA_NS, 'userInformations')
  if (!wrapper) return []
  return children(wrapper, HSA_NS, 'userInformation').map(
    normalizeUserInformation,
  )
}

export function mapSoapPeopleToRest(people, requestedHsaId) {
  const normalized = people.filter(person => {
    return person.hsaId === requestedHsaId && person.givenName
  })
  if (normalized.length === 0) {
    throw new AdapterError(404, 'not_found', 'HSA-id not found.')
  }
  const keys = new Set(normalized.map(personRecordKey))
  if (keys.size > 1) {
    throw new AdapterError(
      409,
      'conflict',
      'HSA-id matched conflicting person records.',
    )
  }
  return normalized[0]
}

async function tlsOptions(config) {
  return {
    ca: await readFile(config.caPath),
    cert: await readFile(config.certPath),
    key: await readFile(config.keyPath),
    ...(config.serverName ? { servername: config.serverName } : {}),
  }
}

export async function postSoap(xml, config) {
  const parsed = new URL(config.endpointUrl)
  const isHttps = parsed.protocol === 'https:'
  if (!isHttps && parsed.protocol !== 'http:') {
    throw new Error(
      `Unsupported HSA SOAP endpoint protocol: ${parsed.protocol}`,
    )
  }
  const options = {
    ...(isHttps ? await tlsOptions(config) : {}),
    headers: {
      Accept: 'text/xml',
      'Content-Length': Buffer.byteLength(xml).toString(),
      'Content-Type': 'text/xml; charset=utf-8',
    },
    hostname: parsed.hostname,
    method: 'POST',
    path: `${parsed.pathname}${parsed.search}`,
    port: parsed.port ? Number(parsed.port) : isHttps ? 443 : 80,
    timeout: config.timeoutMs,
  }

  return new Promise((resolve, reject) => {
    const transport = isHttps ? https : http
    const req = transport.request(options, response => {
      const chunks = []
      response.on('data', chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      response.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          status: response.statusCode ?? 0,
        })
      })
    })
    req.on('timeout', () => {
      req.destroy(
        new AdapterError(504, 'timeout', 'HSA SOAP request timed out.'),
      )
    })
    req.on('error', reject)
    req.write(xml)
    req.end()
  })
}

async function readBody(req) {
  const chunks = []
  let totalBytes = 0
  for await (const chunk of req) {
    totalBytes += chunk.length
    if (totalBytes > MAX_BODY_BYTES) {
      throw new AdapterError(400, 'validation', 'Request body is too large.')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

function stringField(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

async function handleLookup(req, res, config) {
  if (req.method !== 'POST') {
    res.writeHead(405, {
      Allow: 'POST',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    })
    res.end(JSON.stringify({ code: 'method_not_allowed' }))
    return
  }

  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch (error) {
    if (error instanceof AdapterError) throw error
    throw new AdapterError(400, 'validation', 'Request body must be JSON.')
  }

  const hsaId = stringField(payload?.hsaId)
  if (!hsaId) {
    throw new AdapterError(400, 'validation', 'hsaId is required.')
  }

  const soapResponse = await postSoap(
    soapRequestXml(hsaId, { to: config.to }),
    config,
  )
  if (soapResponse.status < 200 || soapResponse.status >= 300) {
    if (soapResponse.status === 401 || soapResponse.status === 403) {
      throw new AdapterError(
        503,
        'service_unavailable',
        'HSA SOAP upstream rejected adapter access.',
      )
    }
    if (!soapResponse.body.trim()) {
      throw new AdapterError(
        503,
        'service_unavailable',
        'HSA SOAP upstream is unavailable.',
      )
    }
  }

  try {
    jsonResponse(
      res,
      200,
      mapSoapPeopleToRest(parseGetHsaPersonResponse(soapResponse.body), hsaId),
    )
  } catch (error) {
    if (error instanceof AdapterError) throw error
    if (error instanceof SoapFault) {
      throw new AdapterError(
        503,
        'service_unavailable',
        'HSA SOAP upstream returned a fault.',
      )
    }
    throw error
  }
}

export function createServer(config = readConfig()) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://hsa-person-lookup-adapter')
    try {
      if (url.pathname === HEALTH_PATH && req.method === 'GET') {
        jsonResponse(res, 200, { status: 'ok' })
        return
      }

      if (url.pathname === LOOKUP_PATH) {
        await handleLookup(req, res, config)
        return
      }

      jsonResponse(res, 404, { code: 'not_found' })
    } catch (error) {
      if (error instanceof AdapterError) {
        jsonResponse(res, error.status, {
          code: error.code,
          error: error.message,
        })
        return
      }
      jsonResponse(res, 503, {
        code: 'service_unavailable',
        error: 'HSA person lookup adapter is unavailable.',
      })
    }
  })
}

export async function startServer({
  config = readConfig(),
  host = '0.0.0.0',
  port = Number(process.env.PORT ?? DEFAULT_PORT),
} = {}) {
  const server = createServer(config)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startServer()
  const address = server.address()
  const port =
    typeof address === 'object' && address ? address.port : DEFAULT_PORT
  console.log(`HSA person lookup adapter listening on port ${port}`)
}
