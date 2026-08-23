import { randomUUID } from 'node:crypto'
import { SaxesParser } from 'saxes'

export const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'
export const ADDRESSING_NS = 'http://www.w3.org/2005/08/addressing'
export const HSA_NS = 'urn:riv:hsa:HsaWsResponder:3'

const DEFAULT_TO = 'SE165565594230-1000'

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

function parseXmlDocument(xml) {
  const parser = new SaxesParser({ xmlns: true })
  const root = { children: [] }
  const stack = [root]
  let parserError = null
  parser.on('opentag', tag => {
    const node = { children: [], local: tag.local, text: '', uri: tag.uri }
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
  parser.on('error', error => {
    parserError = error
    parser.close()
  })
  parser.write(xml).close()
  if (parserError) throw new SoapFault('parse_error', 'Malformed SOAP XML.')
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
  return child(node, uri, local)?.text.trim() ?? ''
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

function normalizeUserInformation(node) {
  const protectedValue = childText(node, HSA_NS, 'hsaProtectedPerson')
  return {
    email: childText(node, HSA_NS, 'mail') || null,
    givenName: childText(node, HSA_NS, 'givenName') || null,
    hasProtectedPersonalData:
      protectedValue.trim().toLowerCase() === 'true' || protectedValue === '1',
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
  if (!body) throw new SoapFault('parse_error', 'SOAP Body is missing.')
  const fault = child(body, SOAP_NS, 'Fault')
  if (fault) {
    const detail = child(fault, '', 'detail') ?? child(fault, SOAP_NS, 'detail')
    const hsaFault = detail ? child(detail, HSA_NS, 'HsaWsFault') : null
    throw new SoapFault(
      hsaFault ? childText(hsaFault, HSA_NS, 'code') : 'soap_fault',
      'HSA SOAP service returned a fault.',
    )
  }
  const response = child(body, HSA_NS, 'GetHsaPersonResponse')
  if (!response) {
    throw new SoapFault('parse_error', 'GetHsaPersonResponse is missing.')
  }
  const wrapper = child(response, HSA_NS, 'userInformations')
  return wrapper
    ? children(wrapper, HSA_NS, 'userInformation').map(normalizeUserInformation)
    : []
}

export function mapSoapPeopleToRest(people, requestedHsaId) {
  const normalized = people.filter(person => {
    return person.hsaId === requestedHsaId && person.givenName
  })
  if (normalized.length === 0) {
    throw new AdapterError(404, 'not_found', 'HSA-id not found.')
  }
  if (new Set(normalized.map(personRecordKey)).size > 1) {
    throw new AdapterError(
      409,
      'conflict',
      'HSA-id matched conflicting person records.',
    )
  }
  return normalized[0]
}
