import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createSecureContext } from 'node:tls'

const ROLE_OIDS = {
  client: '1.3.6.1.5.5.7.3.2',
  server: '1.3.6.1.5.5.7.3.1',
}
const KEY_USAGE_OID = '2.5.29.15'

export class StrictTlsError extends Error {
  constructor(category, message) {
    super(message)
    this.name = 'StrictTlsError'
    this.category = category
  }
}

function fail(category, message) {
  throw new StrictTlsError(category, message)
}

async function readAbsoluteFile(file) {
  if (!path.isAbsolute(file))
    fail('FILE_PATH_INVALID', 'TLS path is not absolute.')
  try {
    const details = await stat(file)
    if (!details.isFile()) fail('FILE_INVALID', 'TLS path is not a file.')
    return await readFile(file)
  } catch (error) {
    if (error instanceof StrictTlsError) throw error
    fail('FILE_INVALID', 'TLS file is unreadable.')
  }
}

function parseCertificate(contents, category) {
  try {
    return new X509Certificate(contents)
  } catch {
    fail(category, 'TLS certificate is malformed.')
  }
}

function assertCurrent(certificate, now) {
  if (certificate.validFromDate > now) {
    fail('CERTIFICATE_NOT_YET_VALID', 'TLS certificate is not yet valid.')
  }
  if (certificate.validToDate <= now) {
    fail('CERTIFICATE_EXPIRED', 'TLS certificate has expired.')
  }
}

function readDerNode(contents, offset) {
  const tag = contents[offset]
  const firstLength = contents[offset + 1]
  if (tag === undefined || firstLength === undefined) {
    fail('CERTIFICATE_INVALID', 'TLS certificate DER is truncated.')
  }
  let length = firstLength
  let headerLength = 2
  if ((firstLength & 0x80) !== 0) {
    const lengthBytes = firstLength & 0x7f
    if (lengthBytes < 1 || lengthBytes > 4) {
      fail('CERTIFICATE_INVALID', 'TLS certificate DER length is invalid.')
    }
    length = 0
    headerLength += lengthBytes
    for (let index = 0; index < lengthBytes; index += 1) {
      const value = contents[offset + 2 + index]
      if (value === undefined) {
        fail('CERTIFICATE_INVALID', 'TLS certificate DER is truncated.')
      }
      length = length * 256 + value
    }
  }
  const start = offset + headerLength
  const end = start + length
  if (end > contents.length) {
    fail('CERTIFICATE_INVALID', 'TLS certificate DER length is invalid.')
  }
  return { end, start, tag }
}

function derChildren(contents, parent) {
  const children = []
  let offset = parent.start
  while (offset < parent.end) {
    const child = readDerNode(contents, offset)
    children.push(child)
    offset = child.end
  }
  if (offset !== parent.end) {
    fail('CERTIFICATE_INVALID', 'TLS certificate DER is malformed.')
  }
  return children
}

function decodeOid(contents, node) {
  const bytes = contents.subarray(node.start, node.end)
  if (node.tag !== 0x06 || bytes.length === 0) {
    fail('CERTIFICATE_INVALID', 'TLS certificate extension OID is invalid.')
  }
  const values = [Math.floor(bytes[0] / 40), bytes[0] % 40]
  let value = 0
  for (const byte of bytes.subarray(1)) {
    value = value * 128 + (byte & 0x7f)
    if ((byte & 0x80) === 0) {
      values.push(value)
      value = 0
    }
  }
  if (value !== 0) {
    fail('CERTIFICATE_INVALID', 'TLS certificate extension OID is invalid.')
  }
  return values.join('.')
}

function certificateExtension(certificate, category, oid) {
  const contents = certificate.raw
  const certificateNode = readDerNode(contents, 0)
  const [tbs] = derChildren(contents, certificateNode)
  const extensions = derChildren(contents, tbs).find(node => node.tag === 0xa3)
  if (!extensions) {
    fail(category, 'TLS certificate extensions are missing.')
  }
  const [extensionSequence] = derChildren(contents, extensions)
  for (const extension of derChildren(contents, extensionSequence)) {
    const fields = derChildren(contents, extension)
    if (decodeOid(contents, fields[0]) !== oid) continue
    const critical = fields[1]?.tag === 0x01
    const valueNode = fields[critical ? 2 : 1]
    if (valueNode?.tag !== 0x04) {
      fail('CERTIFICATE_INVALID', 'TLS certificate extension is malformed.')
    }
    return {
      critical,
      value: contents.subarray(valueNode.start, valueNode.end),
    }
  }
  fail(category, 'TLS certificate key usage is missing.')
}

function assertExactKeyUsage(certificate, category, expectedBits) {
  const extension = certificateExtension(certificate, category, KEY_USAGE_OID)
  const bitString = readDerNode(extension.value, 0)
  if (!extension.critical || bitString.tag !== 0x03) {
    fail(category, 'TLS certificate key usage is invalid.')
  }
  const bytes = extension.value.subarray(bitString.start + 1, bitString.end)
  const actualBits = []
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      if ((bytes[byteIndex] & (0x80 >> bitIndex)) !== 0) {
        actualBits.push(byteIndex * 8 + bitIndex)
      }
    }
  }
  if (JSON.stringify(actualBits) !== JSON.stringify(expectedBits)) {
    fail(category, 'TLS certificate key usage is invalid.')
  }
}

function subjectField(subject, field) {
  return Object.fromEntries(
    subject.split('\n').map(value => value.split(/=(.*)/su).slice(0, 2)),
  )[field]
}

export async function loadStrictTlsMaterial({
  caPath,
  certPath,
  expectedIdentity,
  keyPath,
  now = new Date(),
  role,
}) {
  const [ca, cert, key] = await Promise.all([
    readAbsoluteFile(caPath),
    readAbsoluteFile(certPath),
    readAbsoluteFile(keyPath),
  ])
  const authority = parseCertificate(ca, 'CA_INVALID')
  const leaf = parseCertificate(cert, 'CERTIFICATE_INVALID')
  assertCurrent(authority, now)
  assertCurrent(leaf, now)
  if (
    !authority.ca ||
    !authority.checkIssued(authority) ||
    !authority.verify(authority.publicKey)
  ) {
    fail('CA_INVALID', 'TLS trust root is not a self-signed CA.')
  }
  assertExactKeyUsage(authority, 'CA_INVALID', [5, 6])
  if (
    leaf.ca ||
    leaf.keyUsage?.length !== 1 ||
    leaf.keyUsage[0] !== ROLE_OIDS[role]
  ) {
    fail('LEAF_ROLE_INVALID', `TLS leaf is not limited to ${role}Auth.`)
  }
  assertExactKeyUsage(
    leaf,
    'LEAF_ROLE_INVALID',
    role === 'client' ? [0] : [0, 2],
  )
  if (!leaf.checkIssued(authority) || !leaf.verify(authority.publicKey)) {
    fail('CHAIN_UNTRUSTED', 'TLS leaf is outside the configured trust domain.')
  }
  let privateKey
  try {
    privateKey = createPrivateKey(key)
  } catch {
    fail('KEY_INVALID', 'TLS private key is malformed.')
  }
  if (
    !leaf.publicKey
      .export({ format: 'der', type: 'spki' })
      .equals(
        createPublicKey(privateKey).export({ format: 'der', type: 'spki' }),
      )
  ) {
    fail('KEY_MISMATCH', 'TLS certificate and private key do not match.')
  }
  if (expectedIdentity?.type === 'dns') {
    if (
      leaf.checkHost(expectedIdentity.value, {
        multiLabelWildcards: false,
        partialWildcards: false,
        singleLabelSubdomains: false,
        subject: 'never',
        wildcards: false,
      }) !== expectedIdentity.value
    ) {
      fail('PEER_IDENTITY_INVALID', 'TLS DNS identity is invalid.')
    }
  } else if (expectedIdentity?.type === 'subject') {
    if (leaf.subject !== expectedIdentity.value) {
      fail('PEER_IDENTITY_INVALID', 'TLS subject identity is invalid.')
    }
  } else if (expectedIdentity?.type === 'subject-field') {
    if (
      subjectField(leaf.subject, expectedIdentity.field) !==
      expectedIdentity.value
    ) {
      fail('PEER_IDENTITY_INVALID', 'TLS subject-field identity is invalid.')
    }
  }
  try {
    createSecureContext({ ca, cert, key, minVersion: 'TLSv1.2' })
  } catch {
    fail('TLS_CONTEXT_INVALID', 'TLS context could not be created.')
  }
  return Object.freeze({ ca, cert, key })
}
