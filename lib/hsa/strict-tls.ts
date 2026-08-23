import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createSecureContext } from 'node:tls'

const CLIENT_AUTH_OID = '1.3.6.1.5.5.7.3.2'
const SERVER_AUTH_OID = '1.3.6.1.5.5.7.3.1'
const KEY_USAGE_OID = '2.5.29.15'

export type StrictTlsMaterialDiagnostic =
  | 'tls_ca_invalid'
  | 'tls_certificate_expired'
  | 'tls_certificate_invalid'
  | 'tls_certificate_not_yet_valid'
  | 'tls_chain_untrusted'
  | 'tls_file_invalid'
  | 'tls_file_path_invalid'
  | 'tls_key_invalid'
  | 'tls_key_mismatch'
  | 'tls_leaf_role_invalid'
  | 'tls_peer_identity_invalid'

export class StrictTlsMaterialError extends Error {
  readonly diagnostic: StrictTlsMaterialDiagnostic

  constructor(diagnostic: StrictTlsMaterialDiagnostic, message: string) {
    super(message)
    this.name = 'StrictTlsMaterialError'
    this.diagnostic = diagnostic
  }
}

function fail(diagnostic: StrictTlsMaterialDiagnostic, message: string): never {
  throw new StrictTlsMaterialError(diagnostic, message)
}

export async function readStrictTlsFile(filePath: string): Promise<Buffer> {
  if (!path.isAbsolute(filePath)) {
    fail('tls_file_path_invalid', 'TLS material path must be absolute.')
  }
  try {
    const details = await stat(filePath)
    if (!details.isFile())
      fail('tls_file_invalid', 'TLS material is not a file.')
    return await readFile(filePath)
  } catch (error) {
    if (error instanceof StrictTlsMaterialError) throw error
    fail('tls_file_invalid', 'TLS material could not be read.')
  }
}

function certificateFrom(contents: Buffer, kind: 'ca' | 'leaf') {
  try {
    return new X509Certificate(contents)
  } catch {
    fail(
      kind === 'ca' ? 'tls_ca_invalid' : 'tls_certificate_invalid',
      'TLS certificate material is malformed.',
    )
  }
}

function assertCurrent(certificate: X509Certificate, now: Date) {
  if (certificate.validFromDate > now) {
    fail('tls_certificate_not_yet_valid', 'TLS certificate is not yet valid.')
  }
  if (certificate.validToDate <= now) {
    fail('tls_certificate_expired', 'TLS certificate has expired.')
  }
}

interface DerNode {
  end: number
  start: number
  tag: number
}

function readDerNode(contents: Buffer, offset: number): DerNode {
  const tag = contents[offset]
  const firstLength = contents[offset + 1]
  if (tag === undefined || firstLength === undefined) {
    fail('tls_certificate_invalid', 'TLS certificate DER is truncated.')
  }
  let length = firstLength
  let headerLength = 2
  if ((firstLength & 0x80) !== 0) {
    const lengthBytes = firstLength & 0x7f
    if (lengthBytes < 1 || lengthBytes > 4) {
      fail('tls_certificate_invalid', 'TLS certificate DER length is invalid.')
    }
    length = 0
    headerLength += lengthBytes
    for (let index = 0; index < lengthBytes; index += 1) {
      const value = contents[offset + 2 + index]
      if (value === undefined) {
        fail('tls_certificate_invalid', 'TLS certificate DER is truncated.')
      }
      length = length * 256 + value
    }
  }
  const start = offset + headerLength
  const end = start + length
  if (end > contents.length) {
    fail('tls_certificate_invalid', 'TLS certificate DER length is invalid.')
  }
  return { end, start, tag }
}

function derChildren(contents: Buffer, parent: DerNode): DerNode[] {
  const children: DerNode[] = []
  let offset = parent.start
  while (offset < parent.end) {
    const child = readDerNode(contents, offset)
    children.push(child)
    offset = child.end
  }
  if (offset !== parent.end) {
    fail('tls_certificate_invalid', 'TLS certificate DER is malformed.')
  }
  return children
}

function decodeOid(contents: Buffer, node: DerNode): string {
  const bytes = contents.subarray(node.start, node.end)
  if (node.tag !== 0x06 || bytes.length === 0) {
    fail('tls_certificate_invalid', 'TLS certificate extension OID is invalid.')
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
    fail('tls_certificate_invalid', 'TLS certificate extension OID is invalid.')
  }
  return values.join('.')
}

function certificateExtension(
  certificate: X509Certificate,
  diagnostic: StrictTlsMaterialDiagnostic,
  oid: string,
): { critical: boolean; value: Buffer } {
  const contents = certificate.raw
  const certificateNode = readDerNode(contents, 0)
  const [tbs] = derChildren(contents, certificateNode)
  const extensions = derChildren(contents, tbs).find(node => node.tag === 0xa3)
  if (!extensions) {
    fail(diagnostic, 'TLS certificate extensions are missing.')
  }
  const [extensionSequence] = derChildren(contents, extensions)
  for (const extension of derChildren(contents, extensionSequence)) {
    const fields = derChildren(contents, extension)
    if (decodeOid(contents, fields[0]) !== oid) continue
    const critical = fields[1]?.tag === 0x01
    const valueNode = fields[critical ? 2 : 1]
    if (valueNode?.tag !== 0x04) {
      fail('tls_certificate_invalid', 'TLS certificate extension is malformed.')
    }
    return {
      critical,
      value: contents.subarray(valueNode.start, valueNode.end),
    }
  }
  fail(diagnostic, 'TLS certificate key usage is missing.')
}

function assertExactKeyUsage(
  certificate: X509Certificate,
  diagnostic: StrictTlsMaterialDiagnostic,
  expectedBits: number[],
) {
  const extension = certificateExtension(certificate, diagnostic, KEY_USAGE_OID)
  const bitString = readDerNode(extension.value, 0)
  if (!extension.critical || bitString.tag !== 0x03) {
    fail(diagnostic, 'TLS certificate key usage is invalid.')
  }
  const bytes = extension.value.subarray(bitString.start + 1, bitString.end)
  const actualBits: number[] = []
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      if ((bytes[byteIndex] & (0x80 >> bitIndex)) !== 0) {
        actualBits.push(byteIndex * 8 + bitIndex)
      }
    }
  }
  if (JSON.stringify(actualBits) !== JSON.stringify(expectedBits)) {
    fail(diagnostic, 'TLS certificate key usage is invalid.')
  }
}

export interface StrictTlsSnapshot {
  ca: Buffer
  cert: Buffer
  key: Buffer
}

export async function loadStrictTlsSnapshot({
  caPath,
  certPath,
  expectedIdentity,
  keyPath,
  now = new Date(),
  role,
}: {
  caPath: string
  certPath: string
  expectedIdentity?: string
  keyPath: string
  now?: Date
  role: 'client' | 'server'
}): Promise<StrictTlsSnapshot> {
  const [ca, cert, key] = await Promise.all([
    readStrictTlsFile(caPath),
    readStrictTlsFile(certPath),
    readStrictTlsFile(keyPath),
  ])
  const authority = certificateFrom(ca, 'ca')
  const leaf = certificateFrom(cert, 'leaf')
  assertCurrent(authority, now)
  assertCurrent(leaf, now)
  if (
    !authority.ca ||
    !authority.checkIssued(authority) ||
    !authority.verify(authority.publicKey)
  ) {
    fail('tls_ca_invalid', 'TLS trust root is not a self-signed CA.')
  }
  assertExactKeyUsage(authority, 'tls_ca_invalid', [5, 6])
  if (leaf.ca) {
    fail('tls_leaf_role_invalid', 'TLS leaf certificate must not be a CA.')
  }
  const expectedUsage = role === 'client' ? CLIENT_AUTH_OID : SERVER_AUTH_OID
  if (leaf.keyUsage?.length !== 1 || leaf.keyUsage[0] !== expectedUsage) {
    fail(
      'tls_leaf_role_invalid',
      `TLS leaf certificate must be limited to ${role}Auth.`,
    )
  }
  if (!leaf.checkIssued(authority) || !leaf.verify(authority.publicKey)) {
    fail('tls_chain_untrusted', 'TLS leaf certificate is not trusted.')
  }
  let privateKey: ReturnType<typeof createPrivateKey>
  try {
    privateKey = createPrivateKey(key)
  } catch {
    fail('tls_key_invalid', 'TLS private key is malformed.')
  }
  const certificateKey = leaf.publicKey.export({ format: 'der', type: 'spki' })
  const suppliedKey = createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  })
  if (!certificateKey.equals(suppliedKey)) {
    fail('tls_key_mismatch', 'TLS certificate and private key do not match.')
  }
  if (expectedIdentity) {
    if (role === 'server') {
      if (
        leaf.checkHost(expectedIdentity, {
          multiLabelWildcards: false,
          partialWildcards: false,
          singleLabelSubdomains: false,
          subject: 'never',
          wildcards: false,
        }) !== expectedIdentity
      ) {
        fail('tls_peer_identity_invalid', 'TLS server identity is invalid.')
      }
    } else if (leaf.subject !== expectedIdentity) {
      fail('tls_peer_identity_invalid', 'TLS client identity is invalid.')
    }
  }
  assertExactKeyUsage(
    leaf,
    'tls_leaf_role_invalid',
    role === 'client' ? [0] : [0, 2],
  )
  try {
    createSecureContext({ ca, cert, key, minVersion: 'TLSv1.2' })
  } catch {
    fail('tls_certificate_invalid', 'TLS material cannot create a context.')
  }
  return Object.freeze({ ca, cert, key })
}
