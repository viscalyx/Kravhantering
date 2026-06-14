import { readFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { SaxesParser } from 'saxes'

export const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'
export const ADDRESSING_NS = 'http://www.w3.org/2005/08/addressing'
export const HSA_NS = 'urn:riv:hsa:HsaWsResponder:3'

const EXPECTED_TO = 'SE165565594230-1000'
const SOAP_PATH = '/svr-hsaws2/hsaws'
const HEALTH_PATH = '/health'
const DEFAULT_PORT = 8443
const MAX_BODY_BYTES = 1024 * 1024

const FIXTURE_URL = new URL('../fixtures/hsa-personer.json', import.meta.url)
const DEFAULT_AUTH_MODE = 'realistic-mtls'
const SUPPORTED_AUTH_MODES = new Set(['disabled', 'realistic-mtls'])
const DEFAULT_TLS_CERT_PATH = '/run/hsa-mtls/server.crt'
const DEFAULT_TLS_KEY_PATH = '/run/hsa-mtls/server.key'
const DEFAULT_TLS_CA_PATH = '/run/hsa-mtls/ca.crt'

class SoapFault extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SoapFault'
    this.code = code
  }
}

function elementNode(tag) {
  return {
    children: [],
    local: tag.local,
    name: tag.name,
    text: '',
    uri: tag.uri,
  }
}

export function parseXmlDocument(xml) {
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
    throw new SoapFault(3, `Malformed XML: ${parserError.message}`)
  }

  if (root.children.length !== 1) {
    throw new SoapFault(
      3,
      'SOAP request must contain exactly one root element.',
    )
  }

  return root.children[0]
}

function child(node, uri, local) {
  return node.children.find(candidate => {
    return candidate.uri === uri && candidate.local === local
  })
}

function childText(node, uri, local) {
  const candidate = child(node, uri, local)
  return candidate ? candidate.text.trim() : ''
}

function requiredChild(node, uri, local, message) {
  const candidate = child(node, uri, local)
  if (!candidate) {
    throw new SoapFault(3, message)
  }
  return candidate
}

function extractRequest(xml) {
  const envelope = parseXmlDocument(xml)
  if (envelope.uri !== SOAP_NS || envelope.local !== 'Envelope') {
    throw new SoapFault(3, 'Expected a SOAP 1.1 Envelope.')
  }

  const header = requiredChild(
    envelope,
    SOAP_NS,
    'Header',
    'SOAP Header is required.',
  )
  const messageId = childText(header, ADDRESSING_NS, 'MessageID')
  if (!messageId) {
    throw new SoapFault(3, 'WS-Addressing MessageID is required.')
  }

  const to = childText(header, ADDRESSING_NS, 'To')
  if (to !== EXPECTED_TO) {
    throw new SoapFault(3, `WS-Addressing To must be ${EXPECTED_TO}.`)
  }

  const body = requiredChild(
    envelope,
    SOAP_NS,
    'Body',
    'SOAP Body is required.',
  )
  const getHsaPerson = requiredChild(
    body,
    HSA_NS,
    'GetHsaPerson',
    'GetHsaPerson request is required.',
  )

  const hsaIdentity = childText(getHsaPerson, HSA_NS, 'hsaIdentity')
  const personalIdentityNumber = childText(
    getHsaPerson,
    HSA_NS,
    'personalIdentityNumber',
  )
  const searchBase =
    childText(getHsaPerson, HSA_NS, 'searchBase') ||
    childText(body, HSA_NS, 'searchBase') ||
    'c=SE'

  if (Boolean(hsaIdentity) === Boolean(personalIdentityNumber)) {
    throw new SoapFault(
      3,
      'Exactly one of hsaIdentity or personalIdentityNumber must be supplied.',
    )
  }

  if (searchBase && searchBase !== 'c=SE') {
    throw new SoapFault(6, `Unsupported searchBase: ${searchBase}`)
  }

  return {
    hsaIdentity,
    personalIdentityNumber,
    searchBase,
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function element(name, value) {
  if (value == null || value === '') return ''
  return `<hsa:${name}>${escapeXml(value)}</hsa:${name}>`
}

function userInformationXml(record) {
  return [
    '<hsa:userInformation>',
    element('hsaIdentity', record.hsaIdentity),
    element('givenName', record.givenName),
    element('middleName', record.middleName),
    element('sn', record.sn),
    element('mail', record.mail),
    element('DN', record.DN),
    element('hsaProtectedPerson', record.hsaProtectedPerson),
    '</hsa:userInformation>',
  ].join('')
}

function soapEnvelope(body) {
  return [
    '<soap:Envelope xmlns:soap="',
    SOAP_NS,
    '">',
    '<soap:Body>',
    body,
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('')
}

function successResponse(records) {
  const people = records.map(userInformationXml).join('')
  return soapEnvelope(
    [
      `<hsa:GetHsaPersonResponse xmlns:hsa="${HSA_NS}" xmlns:ns2="${ADDRESSING_NS}">`,
      people
        ? `<hsa:userInformations>${people}</hsa:userInformations>`
        : '<hsa:userInformations/>',
      '</hsa:GetHsaPersonResponse>',
    ].join(''),
  )
}

function faultResponse(code, message) {
  return soapEnvelope(
    [
      '<soap:Fault>',
      '<faultcode>soap:Server</faultcode>',
      '<faultstring>Error executing getHsaPerson()</faultstring>',
      '<detail>',
      `<hsa:HsaWsFault xmlns:hsa="${HSA_NS}" xmlns:ns2="${ADDRESSING_NS}">`,
      `<hsa:code>${escapeXml(code)}</hsa:code>`,
      `<hsa:message>${escapeXml(message)}</hsa:message>`,
      '</hsa:HsaWsFault>',
      '</detail>',
      '</soap:Fault>',
    ].join(''),
  )
}

export async function loadFixtures(fixturesUrl = FIXTURE_URL) {
  const content = await readFile(fixturesUrl, 'utf8')
  const parsed = JSON.parse(content)
  return {
    callerSystems: parsed.callerSystems ?? [],
    hsaPersonRecords: parsed.hsaPersonRecords ?? [],
    notFoundIdentities: new Set(parsed.notFoundIdentities ?? []),
  }
}

function findRecords(fixtures, request) {
  if (request.hsaIdentity) {
    if (fixtures.notFoundIdentities.has(request.hsaIdentity)) return []
    return fixtures.hsaPersonRecords.filter(record => {
      return record.hsaIdentity === request.hsaIdentity
    })
  }

  return fixtures.hsaPersonRecords.filter(record => {
    return record.personalIdentityNumber === request.personalIdentityNumber
  })
}

function xmlResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/xml; charset=utf-8',
  })
  res.end(body)
}

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of req) {
    totalBytes += chunk.length
    if (totalBytes > MAX_BODY_BYTES) {
      throw new SoapFault(3, 'SOAP request body is too large.')
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function readString(name, fallback = undefined, env = process.env) {
  const value = env[name]?.trim()
  return value || fallback
}

function validateAuthMode(mode) {
  if (SUPPORTED_AUTH_MODES.has(mode)) return mode
  throw new Error(
    `Unsupported HSA_MOCK_AUTH_MODE "${mode}". Supported values are: ${[...SUPPORTED_AUTH_MODES].join(', ')}.`,
  )
}

export function readAuthConfig(env = process.env) {
  const mode = readString('HSA_MOCK_AUTH_MODE', DEFAULT_AUTH_MODE, env)
  return {
    caPath: readString('HSA_MOCK_TLS_CA_PATH', DEFAULT_TLS_CA_PATH, env),
    certPath: readString('HSA_MOCK_TLS_CERT_PATH', DEFAULT_TLS_CERT_PATH, env),
    keyPath: readString('HSA_MOCK_TLS_KEY_PATH', DEFAULT_TLS_KEY_PATH, env),
    mode: validateAuthMode(mode),
  }
}

async function readTlsOptions(authConfig) {
  return {
    ca: await readFile(authConfig.caPath),
    cert: await readFile(authConfig.certPath),
    key: await readFile(authConfig.keyPath),
    rejectUnauthorized: false,
    requestCert: true,
  }
}

function certificateSubjectSerialNumber(certificate) {
  const subject = certificate?.subject
  if (!subject || typeof subject !== 'object') return ''
  return (
    subject.serialNumber ?? subject.serialnumber ?? subject['2.5.4.5'] ?? ''
  )
}

function authFailure(statusCode, code, error) {
  return { body: { code, error }, statusCode }
}

function hasEntitlement(callerSystem, property, entitlement) {
  const values =
    callerSystem[property] ??
    callerSystem.entitlements?.[property] ??
    callerSystem.entitlements ??
    []
  return Array.isArray(values) && values.includes(entitlement)
}

function authenticateCaller(req, fixtures, authConfig) {
  if (authConfig.mode === 'disabled') return null

  const certificate = req.socket.getPeerCertificate?.()
  if (!certificate || Object.keys(certificate).length === 0) {
    return authFailure(
      401,
      'missing_client_certificate',
      'Client certificate is required.',
    )
  }

  if (!req.socket.authorized) {
    return authFailure(
      403,
      'untrusted_client_certificate',
      'Client certificate is not trusted by the HSA mock.',
    )
  }

  const callerHsaId = certificateSubjectSerialNumber(certificate).trim()
  if (!callerHsaId) {
    return authFailure(
      401,
      'missing_client_serial_number',
      'Client certificate subject.serialNumber is required.',
    )
  }

  const callerSystem = fixtures.callerSystems.find(candidate => {
    return candidate.hsaIdentity === callerHsaId
  })
  if (!callerSystem) {
    return authFailure(
      403,
      'unknown_caller_system',
      'Client certificate does not match a known caller system.',
    )
  }
  if (!callerSystem.active) {
    return authFailure(
      403,
      'inactive_caller_system',
      'Client certificate matches an inactive caller system.',
    )
  }
  if (!hasEntitlement(callerSystem, 'serviceEntitlements', 'hsaws2')) {
    return authFailure(
      403,
      'missing_hsaws2_entitlement',
      'Caller system lacks hsaws2 entitlement.',
    )
  }
  if (!hasEntitlement(callerSystem, 'methodEntitlements', 'GetHsaPerson')) {
    return authFailure(
      403,
      'missing_get_hsa_person_entitlement',
      'Caller system lacks GetHsaPerson entitlement.',
    )
  }

  return null
}

export function createServer(
  fixtures,
  { authConfig = { mode: 'disabled' }, tlsOptions } = {},
) {
  const requestHandler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://hsa-directory-mock')

    if (url.pathname === HEALTH_PATH && req.method === 'GET') {
      jsonResponse(res, 200, { status: 'ok' })
      return
    }

    if (url.pathname !== SOAP_PATH) {
      jsonResponse(res, 404, { error: 'Not found' })
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405, {
        Allow: 'POST',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      })
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    const authError = authenticateCaller(req, fixtures, authConfig)
    if (authError) {
      jsonResponse(res, authError.statusCode, authError.body)
      return
    }

    try {
      const body = await readBody(req)
      const request = extractRequest(body)
      const records = findRecords(fixtures, request)
      xmlResponse(res, 200, successResponse(records))
    } catch (error) {
      const fault =
        error instanceof SoapFault
          ? error
          : new SoapFault(6, 'Unexpected HSA directory mock error.')
      xmlResponse(res, 500, faultResponse(fault.code, fault.message))
    }
  }

  return tlsOptions
    ? https.createServer(tlsOptions, requestHandler)
    : http.createServer(requestHandler)
}

export async function startServer({
  authConfig = readAuthConfig(),
  fixturesUrl = FIXTURE_URL,
  host = '0.0.0.0',
  port = Number(process.env.PORT ?? DEFAULT_PORT),
} = {}) {
  validateAuthMode(authConfig.mode)
  const fixtures = await loadFixtures(fixturesUrl)
  const tlsOptions =
    authConfig.mode === 'realistic-mtls'
      ? await readTlsOptions(authConfig)
      : undefined
  const server = createServer(fixtures, { authConfig, tlsOptions })
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
  console.log(`HSA directory mock listening on port ${port}`)
}
