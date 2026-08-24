import { readFile } from 'node:fs/promises'
import { SaxesParser } from 'saxes'

export const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'
export const ADDRESSING_NS = 'http://www.w3.org/2005/08/addressing'
export const HSA_NS = 'urn:riv:hsa:HsaWsResponder:3'

const EXPECTED_TO = 'SE165565594230-1000'
const MAX_BODY_BYTES = 1024 * 1024
const FIXTURE_URL = new URL('../fixtures/hsa-personer.json', import.meta.url)

export class SoapFault extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SoapFault'
    this.code = code
  }
}

function child(node, uri, local) {
  return node.children.find(candidate => {
    return candidate.uri === uri && candidate.local === local
  })
}

function childText(node, uri, local) {
  return child(node, uri, local)?.text.trim() ?? ''
}

function requiredChild(node, uri, local, message) {
  const candidate = child(node, uri, local)
  if (!candidate) throw new SoapFault(3, message)
  return candidate
}

export function parseXmlDocument(xml) {
  const parser = new SaxesParser({ xmlns: true })
  const root = { children: [] }
  const stack = [root]
  let invalid = false
  parser.on('opentag', tag => {
    const node = {
      children: [],
      local: tag.local,
      name: tag.name,
      text: '',
      uri: tag.uri,
    }
    stack.at(-1).children.push(node)
    stack.push(node)
  })
  parser.on('text', text => {
    stack.at(-1).text += text
  })
  parser.on('cdata', text => {
    stack.at(-1).text += text
  })
  parser.on('closetag', () => stack.pop())
  parser.on('error', () => {
    invalid = true
  })
  parser.write(xml)
  if (!invalid) parser.close()
  if (invalid || root.children.length !== 1) {
    throw new SoapFault(3, 'Invalid HSA directory request.')
  }
  return root.children[0]
}

export function extractRequest(xml) {
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
  if (!messageId) throw new SoapFault(3, 'WS-Addressing MessageID is required.')
  if (childText(header, ADDRESSING_NS, 'To') !== EXPECTED_TO) {
    throw new SoapFault(3, 'WS-Addressing To is invalid.')
  }
  const body = requiredChild(
    envelope,
    SOAP_NS,
    'Body',
    'SOAP Body is required.',
  )
  const operation = requiredChild(
    body,
    HSA_NS,
    'GetHsaPerson',
    'GetHsaPerson request is required.',
  )
  const hsaIdentity = childText(operation, HSA_NS, 'hsaIdentity')
  const personalIdentityNumber = childText(
    operation,
    HSA_NS,
    'personalIdentityNumber',
  )
  if (Boolean(hsaIdentity) === Boolean(personalIdentityNumber)) {
    throw new SoapFault(3, 'Exactly one identity must be supplied.')
  }
  const searchBase =
    childText(operation, HSA_NS, 'searchBase') ||
    childText(body, HSA_NS, 'searchBase') ||
    'c=SE'
  if (searchBase !== 'c=SE') throw new SoapFault(6, 'Unsupported search base.')
  return { hsaIdentity, messageId, personalIdentityNumber, searchBase }
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
  return value == null || value === ''
    ? ''
    : `<hsa:${name}>${escapeXml(value)}</hsa:${name}>`
}

function envelope(body) {
  return `<soap:Envelope xmlns:soap="${SOAP_NS}"><soap:Body>${body}</soap:Body></soap:Envelope>`
}

export function successResponse(records) {
  const people = records
    .map(
      record =>
        `<hsa:userInformation>${[
          element('hsaIdentity', record.hsaIdentity),
          element('givenName', record.givenName),
          element('middleName', record.middleName),
          element('sn', record.sn),
          element('mail', record.mail),
          element('DN', record.DN),
          element('hsaProtectedPerson', record.hsaProtectedPerson),
        ].join('')}</hsa:userInformation>`,
    )
    .join('')
  return envelope(
    `<hsa:GetHsaPersonResponse xmlns:hsa="${HSA_NS}" xmlns:ns2="${ADDRESSING_NS}"><hsa:userInformations>${people}</hsa:userInformations></hsa:GetHsaPersonResponse>`,
  )
}

export function faultResponse(code, message) {
  return envelope(
    `<soap:Fault><faultcode>soap:Server</faultcode><faultstring>Error executing getHsaPerson()</faultstring><detail><hsa:HsaWsFault xmlns:hsa="${HSA_NS}" xmlns:ns2="${ADDRESSING_NS}"><hsa:code>${escapeXml(code)}</hsa:code><hsa:message>${escapeXml(message)}</hsa:message></hsa:HsaWsFault></detail></soap:Fault>`,
  )
}

export async function loadFixtures(fixturesUrl = FIXTURE_URL) {
  const parsed = JSON.parse(await readFile(fixturesUrl, 'utf8'))
  return {
    callerSystems: parsed.callerSystems ?? [],
    hsaPersonRecords: parsed.hsaPersonRecords ?? [],
    notFoundIdentities: new Set(parsed.notFoundIdentities ?? []),
  }
}

export function findRecords(fixtures, request) {
  if (request.hsaIdentity) {
    if (fixtures.notFoundIdentities.has(request.hsaIdentity)) return []
    return fixtures.hsaPersonRecords.filter(
      record => record.hsaIdentity === request.hsaIdentity,
    )
  }
  return fixtures.hsaPersonRecords.filter(
    record => record.personalIdentityNumber === request.personalIdentityNumber,
  )
}

export function xmlResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/xml; charset=utf-8',
  })
  res.end(body)
}

export function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

export async function readBody(req) {
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
