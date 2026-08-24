import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createSecureContext } from 'node:tls'

const BASIC_CONSTRAINTS_OID = '2.5.29.19'
const KEY_USAGE_OID = '2.5.29.15'
const MAX_CERTIFICATE_CHAIN_LENGTH = 8
const MAX_TRUST_ROOTS = 16
const ROLE_OIDS = {
  client: '1.3.6.1.5.5.7.3.2',
  server: '1.3.6.1.5.5.7.3.1',
}

/**
 * @typedef {{ end: number, start: number, tag: number }} DerNode
 * @typedef {(category: string, message: string) => never} CertificateFailure
 * @typedef {'client' | 'server'} CertificateRole
 * @typedef {{ type: 'dns' | 'subject', value: string } | { field: string, type: 'subject-field', value: string }} CertificateIdentityPolicy
 * @typedef {{
 *   caInvalid: string,
 *   certificateExpired: string,
 *   certificateInvalid: string,
 *   certificateNotYetValid: string,
 *   chainUntrusted: string,
 *   fileInvalid: string,
 *   filePathInvalid: string,
 *   keyInvalid: string,
 *   keyMismatch: string,
 *   leafRoleInvalid: string,
 *   peerIdentityInvalid: string,
 *   tlsContextInvalid: string,
 * }} CertificateDiagnosticMap
 * @typedef {{ ca: Buffer, cert: Buffer, key: Buffer }} StrictCertificateMaterial
 */

/**
 * @param {Buffer} contents
 * @param {number} offset
 * @param {CertificateFailure} fail
 * @returns {DerNode}
 */
function readDerNode(contents, offset, fail) {
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
    const mostSignificantLengthByte = contents[offset + 2]
    if (mostSignificantLengthByte === undefined) {
      fail('CERTIFICATE_INVALID', 'TLS certificate DER is truncated.')
    }
    if (mostSignificantLengthByte === 0) {
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
    if (length < 0x80) {
      fail('CERTIFICATE_INVALID', 'TLS certificate DER length is invalid.')
    }
  }
  const start = offset + headerLength
  if (start > contents.length || length > contents.length - start) {
    fail('CERTIFICATE_INVALID', 'TLS certificate DER length is invalid.')
  }
  const end = start + length
  return { end, start, tag }
}

/**
 * @param {Buffer} contents
 * @param {DerNode} parent
 * @param {CertificateFailure} fail
 * @returns {DerNode[]}
 */
function derChildren(contents, parent, fail) {
  const children = []
  let offset = parent.start
  while (offset < parent.end) {
    const child = readDerNode(contents, offset, fail)
    children.push(child)
    offset = child.end
  }
  if (offset !== parent.end) {
    fail('CERTIFICATE_INVALID', 'TLS certificate DER is malformed.')
  }
  return children
}

/**
 * @param {Buffer} contents
 * @param {DerNode} node
 * @param {CertificateFailure} fail
 * @returns {string}
 */
function decodeOid(contents, node, fail) {
  const bytes = contents.subarray(node.start, node.end)
  if (node.tag !== 0x06 || bytes.length === 0) {
    fail('CERTIFICATE_INVALID', 'TLS certificate extension OID is invalid.')
  }
  const firstByte = bytes[0]
  if (firstByte === undefined) {
    fail('CERTIFICATE_INVALID', 'TLS certificate extension OID is invalid.')
  }
  const values = [Math.floor(firstByte / 40), firstByte % 40]
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

/**
 * @param {import('node:crypto').X509Certificate} certificate
 * @param {string} category
 * @param {string} oid
 * @param {CertificateFailure} fail
 * @returns {{ critical: boolean, value: Buffer }}
 */
function certificateExtension(certificate, category, oid, fail) {
  const contents = certificate.raw
  const certificateNode = readDerNode(contents, 0, fail)
  const [tbs] = derChildren(contents, certificateNode, fail)
  if (!tbs) fail('CERTIFICATE_INVALID', 'TLS certificate DER is malformed.')
  const extensions = derChildren(contents, tbs, fail).find(
    node => node.tag === 0xa3,
  )
  if (!extensions) {
    fail(category, 'TLS certificate extensions are missing.')
  }
  const [extensionSequence] = derChildren(contents, extensions, fail)
  if (!extensionSequence) {
    fail('CERTIFICATE_INVALID', 'TLS certificate extension is malformed.')
  }
  for (const extension of derChildren(contents, extensionSequence, fail)) {
    const fields = derChildren(contents, extension, fail)
    const oidNode = fields[0]
    if (!oidNode) {
      fail('CERTIFICATE_INVALID', 'TLS certificate extension is malformed.')
    }
    if (decodeOid(contents, oidNode, fail) !== oid) continue
    const criticalNode = fields[1]?.tag === 0x01 ? fields[1] : undefined
    let critical = false
    if (criticalNode) {
      const bytes = contents.subarray(criticalNode.start, criticalNode.end)
      if (bytes.length !== 1 || (bytes[0] !== 0x00 && bytes[0] !== 0xff)) {
        fail('CERTIFICATE_INVALID', 'TLS certificate extension is malformed.')
      }
      critical = bytes[0] === 0xff
    }
    const valueNode = fields[criticalNode ? 2 : 1]
    if (valueNode?.tag !== 0x04) {
      fail('CERTIFICATE_INVALID', 'TLS certificate extension is malformed.')
    }
    return {
      critical,
      value: contents.subarray(valueNode.start, valueNode.end),
    }
  }
  fail(category, 'TLS certificate extension is missing.')
}

/**
 * Parse RFC 5280 BasicConstraints without depending on runtime OpenSSL. Node's
 * X509Certificate exposes the CA boolean but not pathLenConstraint.
 *
 * @param {import('node:crypto').X509Certificate} certificate
 * @param {string} category
 * @param {CertificateFailure} fail
 * @returns {{ ca: boolean, caExplicit: boolean, critical: boolean, pathLength: number | undefined }}
 */
function certificateBasicConstraints(certificate, category, fail) {
  const extension = certificateExtension(
    certificate,
    category,
    BASIC_CONSTRAINTS_OID,
    fail,
  )
  const sequence = readDerNode(extension.value, 0, fail)
  if (sequence.tag !== 0x30 || sequence.end !== extension.value.length) {
    fail(category, 'TLS certificate Basic Constraints are invalid.')
  }
  const fields = derChildren(extension.value, sequence, fail)
  let index = 0
  let ca = false
  let caExplicit = false
  if (fields[index]?.tag === 0x01) {
    caExplicit = true
    const boolean = fields[index]
    const bytes = extension.value.subarray(boolean.start, boolean.end)
    if (bytes.length !== 1 || (bytes[0] !== 0x00 && bytes[0] !== 0xff)) {
      fail(category, 'TLS certificate Basic Constraints are invalid.')
    }
    ca = bytes[0] === 0xff
    index += 1
  }
  let pathLength
  if (fields[index]?.tag === 0x02) {
    const integer = fields[index]
    const bytes = extension.value.subarray(integer.start, integer.end)
    if (
      bytes.length < 1 ||
      (bytes[0] & 0x80) !== 0 ||
      (bytes.length > 1 && bytes[0] === 0x00 && (bytes[1] & 0x80) === 0)
    ) {
      fail(category, 'TLS certificate path length constraint is invalid.')
    }
    pathLength = 0
    for (const byte of bytes) {
      pathLength = pathLength * 256 + byte
      if (!Number.isSafeInteger(pathLength)) {
        fail(category, 'TLS certificate path length constraint is invalid.')
      }
    }
    if (!ca) {
      fail(category, 'TLS certificate path length requires CA:TRUE.')
    }
    index += 1
  }
  if (index !== fields.length) {
    fail(category, 'TLS certificate Basic Constraints are invalid.')
  }
  return { ca, caExplicit, critical: extension.critical, pathLength }
}

/**
 * Validate an exact RFC 5280 keyUsage bit set from the certificate's DER.
 * This is the single source used by the App, Adapter, and HSA mock runtimes.
 *
 * @param {import('node:crypto').X509Certificate} certificate
 * @param {string} category
 * @param {number[]} expectedBits
 * @param {CertificateFailure} fail
 * @returns {void}
 */
export function assertExactCertificateKeyUsage(
  certificate,
  category,
  expectedBits,
  fail,
) {
  const invalidKeyUsage = () =>
    fail(category, 'TLS certificate key usage is invalid.')
  const extension = certificateExtension(
    certificate,
    category,
    KEY_USAGE_OID,
    invalidKeyUsage,
  )
  const bitString = readDerNode(extension.value, 0, invalidKeyUsage)
  if (
    !extension.critical ||
    bitString.tag !== 0x03 ||
    bitString.end !== extension.value.length
  ) {
    invalidKeyUsage()
  }
  const contents = extension.value.subarray(bitString.start, bitString.end)
  if (contents.length < 2) invalidKeyUsage()
  const unusedBits = contents[0]
  if (unusedBits === undefined || unusedBits > 7) invalidKeyUsage()
  const bytes = contents.subarray(1)
  const finalByte = bytes.at(-1)
  if (finalByte === undefined || finalByte === 0) invalidKeyUsage()
  const paddingMask = (1 << unusedBits) - 1
  if ((finalByte & paddingMask) !== 0) invalidKeyUsage()
  let canonicalUnusedBits = 0
  while (
    canonicalUnusedBits < 7 &&
    (finalByte & (1 << canonicalUnusedBits)) === 0
  ) {
    canonicalUnusedBits += 1
  }
  if (unusedBits !== canonicalUnusedBits) invalidKeyUsage()

  const significantBitCount = bytes.length * 8 - unusedBits
  const actualBits = []
  for (let bit = 0; bit < significantBitCount; bit += 1) {
    const byte = bytes[Math.floor(bit / 8)]
    if (byte !== undefined && (byte & (0x80 >> (bit % 8))) !== 0) {
      actualBits.push(bit)
    }
  }
  if (JSON.stringify(actualBits) !== JSON.stringify(expectedBits)) {
    invalidKeyUsage()
  }
}

/**
 * @param {string} filePath
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {Promise<Buffer>}
 */
export async function readStrictCertificateFile(filePath, diagnostics, fail) {
  if (!path.isAbsolute(filePath)) {
    fail(diagnostics.filePathInvalid, 'TLS material path must be absolute.')
  }
  let details
  try {
    details = await stat(filePath)
  } catch {
    fail(diagnostics.fileInvalid, 'TLS material could not be read.')
  }
  if (!details.isFile()) {
    fail(diagnostics.fileInvalid, 'TLS material is not a file.')
  }
  try {
    return await readFile(filePath)
  } catch {
    fail(diagnostics.fileInvalid, 'TLS material could not be read.')
  }
}

/**
 * @param {Buffer} contents
 * @param {'ca' | 'leaf'} kind
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {X509Certificate}
 */
function parseCertificate(contents, kind, diagnostics, fail) {
  try {
    return new X509Certificate(contents)
  } catch {
    fail(
      kind === 'ca' ? diagnostics.caInvalid : diagnostics.certificateInvalid,
      'TLS certificate material is malformed.',
    )
  }
}

/**
 * @param {Buffer} contents
 * @param {boolean} allowCaBundle
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {X509Certificate[]}
 */
function parseCertificateSequence(contents, kind, diagnostics, fail) {
  const text = contents.toString('utf8')
  const blocks = text.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu,
  )
  if (!blocks) {
    return [parseCertificate(contents, kind, diagnostics, fail)]
  }
  const remainder = blocks.reduce(
    (value, block) => value.replace(block, ''),
    text,
  )
  if (remainder.trim()) {
    fail(
      kind === 'ca' ? diagnostics.caInvalid : diagnostics.certificateInvalid,
      'TLS certificate bundle contains malformed material.',
    )
  }
  return blocks.map(block =>
    parseCertificate(Buffer.from(block), kind, diagnostics, fail),
  )
}

/**
 * @param {Buffer} contents
 * @param {boolean} allowCaBundle
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {X509Certificate[]}
 */
function parseCertificateAuthorities(
  contents,
  allowCaBundle,
  diagnostics,
  fail,
) {
  const authorities = parseCertificateSequence(
    contents,
    'ca',
    diagnostics,
    fail,
  )
  if (
    authorities.length > MAX_TRUST_ROOTS ||
    (!allowCaBundle && authorities.length !== 1)
  ) {
    fail(diagnostics.caInvalid, 'TLS CA bundle size is invalid.')
  }
  return authorities
}

/**
 * @param {Buffer} contents
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {X509Certificate[]}
 */
function parsePresentedCertificateChain(contents, diagnostics, fail) {
  const certificates = parseCertificateSequence(
    contents,
    'leaf',
    diagnostics,
    fail,
  )
  if (
    certificates.length < 1 ||
    certificates.length > MAX_CERTIFICATE_CHAIN_LENGTH
  ) {
    fail(
      diagnostics.certificateInvalid,
      'TLS presented certificate chain size is invalid.',
    )
  }
  return certificates
}

/**
 * @param {X509Certificate} certificate
 * @param {Date} now
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertCurrent(certificate, now, diagnostics, fail) {
  if (certificate.validFromDate > now) {
    fail(
      diagnostics.certificateNotYetValid,
      'TLS certificate is not yet valid.',
    )
  }
  if (certificate.validToDate <= now) {
    fail(diagnostics.certificateExpired, 'TLS certificate has expired.')
  }
}

/**
 * @param {X509Certificate} certificate
 * @param {string} category
 * @param {number[]} expectedBits
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertExactKeyUsage(
  certificate,
  category,
  expectedBits,
  diagnostics,
  fail,
) {
  assertExactCertificateKeyUsage(
    certificate,
    category,
    expectedBits,
    (failureCategory, message) =>
      fail(
        failureCategory === 'CERTIFICATE_INVALID'
          ? diagnostics.certificateInvalid
          : failureCategory,
        message,
      ),
  )
}

/**
 * @param {string} subject
 * @param {string} field
 * @returns {string | undefined}
 */
function subjectField(subject, field) {
  return Object.fromEntries(
    subject.split('\n').map(value => value.split(/=(.*)/su).slice(0, 2)),
  )[field]
}

/**
 * @param {X509Certificate} leaf
 * @param {CertificateIdentityPolicy | undefined} identity
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertIdentity(leaf, identity, diagnostics, fail) {
  if (!identity) return
  if (identity.type === 'dns') {
    if (
      leaf.checkHost(identity.value, {
        multiLabelWildcards: false,
        partialWildcards: false,
        singleLabelSubdomains: false,
        subject: 'never',
        wildcards: false,
      }) !== identity.value
    ) {
      fail(diagnostics.peerIdentityInvalid, 'TLS DNS identity is invalid.')
    }
    return
  }
  if (identity.type === 'subject') {
    if (leaf.subject !== identity.value) {
      fail(diagnostics.peerIdentityInvalid, 'TLS subject identity is invalid.')
    }
    return
  }
  if (subjectField(leaf.subject, identity.field) !== identity.value) {
    fail(
      diagnostics.peerIdentityInvalid,
      'TLS subject-field identity is invalid.',
    )
  }
}

/**
 * @param {X509Certificate} certificate
 * @returns {boolean}
 */
function isSelfSigned(certificate) {
  return isCertificateIssuedBy(certificate, certificate)
}

/**
 * Discover issuer candidates independently of their CA policy so that Basic
 * Constraints and exact key usage are enforced by the explicit validation
 * step after the cryptographic path is selected.
 *
 * @param {X509Certificate} certificate
 * @param {X509Certificate} issuer
 * @returns {boolean}
 */
function isCertificateIssuedBy(certificate, issuer) {
  return (
    certificate.issuer === issuer.subject &&
    certificate.verify(issuer.publicKey)
  )
}

/**
 * @param {X509Certificate} certificate
 * @param {string} category
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {number | undefined}
 */
function assertAuthorityPolicy(certificate, category, diagnostics, fail) {
  const constraints = certificateBasicConstraints(
    certificate,
    category,
    (failureCategory, message) =>
      fail(
        failureCategory === 'CERTIFICATE_INVALID'
          ? diagnostics.certificateInvalid
          : failureCategory,
        message,
      ),
  )
  if (!constraints.critical || !constraints.ca || !certificate.ca) {
    fail(category, 'TLS trust material is not a constrained CA.')
  }
  assertExactKeyUsage(certificate, category, [5, 6], diagnostics, fail)
  return constraints.pathLength
}

/**
 * Require the canonical RFC 5280 leaf form: a critical BasicConstraints
 * extension containing an empty SEQUENCE. The DEFAULT CA:FALSE value must be
 * omitted and a leaf cannot carry pathLenConstraint.
 *
 * @param {X509Certificate} certificate
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertLeafBasicConstraints(certificate, diagnostics, fail) {
  const constraints = certificateBasicConstraints(
    certificate,
    diagnostics.leafRoleInvalid,
    (failureCategory, message) =>
      fail(
        failureCategory === 'CERTIFICATE_INVALID'
          ? diagnostics.certificateInvalid
          : failureCategory,
        message,
      ),
  )
  if (
    !constraints.critical ||
    constraints.ca ||
    constraints.caExplicit ||
    constraints.pathLength !== undefined
  ) {
    fail(
      diagnostics.leafRoleInvalid,
      'TLS leaf certificate Basic Constraints are invalid.',
    )
  }
}

/**
 * Enforce each CA's RFC 5280 pathLenConstraint against the non-self-issued CA
 * certificates below it in the selected path. Paths are ordered leafward to
 * rootward and may start with either a leaf or an intermediate.
 *
 * @param {X509Certificate[]} selectedPath
 * @param {string} category
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertPathLengthConstraints(
  selectedPath,
  category,
  diagnostics,
  fail,
) {
  for (let index = 0; index < selectedPath.length; index += 1) {
    const authority = selectedPath[index]
    if (!authority?.ca) continue
    const pathLength = assertAuthorityPolicy(
      authority,
      category,
      diagnostics,
      fail,
    )
    if (pathLength === undefined) continue
    const subordinateCaCount = selectedPath
      .slice(0, index)
      .filter(
        certificate =>
          certificate.ca && certificate.subject !== certificate.issuer,
      ).length
    if (subordinateCaCount > pathLength) {
      fail(
        category,
        'TLS certificate chain violates a CA path length constraint.',
      )
    }
  }
}

/**
 * @param {X509Certificate} certificate
 * @param {X509Certificate[]} intermediates
 * @param {X509Certificate[]} roots
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertAuthorityPath(
  certificate,
  intermediates,
  roots,
  diagnostics,
  fail,
) {
  let current = certificate
  const selectedPath = [certificate]
  const visited = new Set([certificate.fingerprint256])
  for (let depth = 0; depth < MAX_CERTIFICATE_CHAIN_LENGTH; depth += 1) {
    const matchingRoots = roots.filter(root =>
      isCertificateIssuedBy(current, root),
    )
    if (matchingRoots.length === 1) {
      selectedPath.push(matchingRoots[0])
      assertPathLengthConstraints(
        selectedPath,
        diagnostics.caInvalid,
        diagnostics,
        fail,
      )
      return
    }
    if (matchingRoots.length > 1) break
    const issuers = intermediates.filter(
      candidate =>
        !visited.has(candidate.fingerprint256) &&
        isCertificateIssuedBy(current, candidate),
    )
    if (issuers.length !== 1) break
    current = issuers[0]
    selectedPath.push(current)
    visited.add(current.fingerprint256)
  }
  fail(
    diagnostics.caInvalid,
    'TLS CA bundle contains an incomplete or ambiguous issuer chain.',
  )
}

/**
 * Validate a CA file and return the original TLS input, self-signed roots, and
 * any complete intermediate paths supplied by the trust bundle.
 *
 * @param {{
 *   allowCaBundle?: boolean,
 *   caPath: string,
 *   diagnostics: CertificateDiagnosticMap,
 *   fail: CertificateFailure,
 *   now?: Date,
 * }} options
 * @returns {Promise<{ authorities: X509Certificate[], contents: Buffer, intermediates: X509Certificate[] }>}
 */
export async function loadStrictCertificateAuthority(options) {
  const {
    allowCaBundle = false,
    caPath,
    diagnostics,
    fail,
    now = new Date(),
  } = options
  const contents = await readStrictCertificateFile(caPath, diagnostics, fail)
  const authorities = parseCertificateAuthorities(
    contents,
    allowCaBundle,
    diagnostics,
    fail,
  )
  for (const authority of authorities) {
    assertCurrent(authority, now, diagnostics, fail)
    assertAuthorityPolicy(authority, diagnostics.caInvalid, diagnostics, fail)
  }
  const roots = authorities.filter(isSelfSigned)
  const intermediates = authorities.filter(
    authority => !isSelfSigned(authority),
  )
  if (roots.length < 1) {
    fail(diagnostics.caInvalid, 'TLS CA bundle has no self-signed trust root.')
  }
  for (const intermediate of intermediates) {
    assertAuthorityPath(intermediate, intermediates, roots, diagnostics, fail)
  }
  return { authorities: roots, contents, intermediates }
}

/**
 * @param {Buffer} contents
 * @param {{
 *   allowCaBundle?: boolean,
 *   diagnostics: CertificateDiagnosticMap,
 *   fail: CertificateFailure,
 * }} options
 * @returns {Buffer[]}
 */
export function strictCertificateAuthorityRawValues(contents, options) {
  const { allowCaBundle = false, diagnostics, fail } = options
  return parseCertificateAuthorities(
    contents,
    allowCaBundle,
    diagnostics,
    fail,
  ).map(authority => authority.raw)
}

/**
 * @param {X509Certificate} certificate
 * @param {Date} now
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertIntermediateAuthority(certificate, now, diagnostics, fail) {
  assertCurrent(certificate, now, diagnostics, fail)
  if (!certificate.ca) {
    fail(
      diagnostics.chainUntrusted,
      'TLS presented chain contains a non-CA issuer.',
    )
  }
  assertAuthorityPolicy(
    certificate,
    diagnostics.chainUntrusted,
    diagnostics,
    fail,
  )
}

/**
 * Build exactly one cryptographically verified path from the leaf through all
 * presented intermediates to one configured self-signed root. Every presented
 * certificate must participate, which rejects incomplete, ambiguous, cyclic,
 * duplicate, and extraneous chains with one bounded diagnostic.
 *
 * @param {X509Certificate} leaf
 * @param {X509Certificate[]} intermediates
 * @param {X509Certificate[]} roots
 * @param {X509Certificate[]} trustedIntermediates
 * @param {Date} now
 * @param {CertificateDiagnosticMap} diagnostics
 * @param {CertificateFailure} fail
 * @returns {void}
 */
function assertTrustedCertificateChain(
  leaf,
  intermediates,
  roots,
  trustedIntermediates,
  now,
  diagnostics,
  fail,
) {
  const remaining = [...intermediates]
  const available = [...intermediates, ...trustedIntermediates]
  const visited = new Set([leaf.fingerprint256])
  const selectedPath = [leaf]
  let current = leaf
  for (let depth = 0; depth < MAX_CERTIFICATE_CHAIN_LENGTH; depth += 1) {
    const matchingRoots = roots.filter(root =>
      isCertificateIssuedBy(current, root),
    )
    if (matchingRoots.length === 1 && remaining.length === 0) {
      selectedPath.push(matchingRoots[0])
      assertPathLengthConstraints(
        selectedPath,
        diagnostics.chainUntrusted,
        diagnostics,
        fail,
      )
      return
    }
    if (matchingRoots.length > 0) {
      fail(
        diagnostics.chainUntrusted,
        'TLS presented certificate chain is ambiguous or contains extra certificates.',
      )
    }

    const matchingIntermediates = available.filter(
      candidate =>
        !visited.has(candidate.fingerprint256) &&
        isCertificateIssuedBy(current, candidate),
    )
    if (matchingIntermediates.length !== 1) {
      fail(
        diagnostics.chainUntrusted,
        'TLS presented certificate chain is incomplete or ambiguous.',
      )
    }
    const issuer = matchingIntermediates[0]
    assertIntermediateAuthority(issuer, now, diagnostics, fail)
    const remainingIndex = remaining.indexOf(issuer)
    if (remainingIndex >= 0) remaining.splice(remainingIndex, 1)
    visited.add(issuer.fingerprint256)
    selectedPath.push(issuer)
    current = issuer
  }
  fail(
    diagnostics.chainUntrusted,
    'TLS presented certificate chain exceeds the supported depth.',
  )
}

/**
 * Shared strict certificate pipeline for the App, Adapter, and HSA mock.
 * Consumers provide only their stable diagnostic names and exact identity
 * policy; file, X.509, validity, role, chain, key, and TLS context validation
 * remain identical.
 *
 * @param {{
 *   allowCaBundle?: boolean,
 *   caPath: string,
 *   certPath: string,
 *   diagnostics: CertificateDiagnosticMap,
 *   fail: CertificateFailure,
 *   identity?: CertificateIdentityPolicy,
 *   keyPath: string,
 *   now?: Date,
 *   role: CertificateRole,
 * }} options
 * @returns {Promise<Readonly<StrictCertificateMaterial>>}
 */
export async function loadStrictCertificateMaterial(options) {
  const {
    allowCaBundle = false,
    caPath,
    certPath,
    diagnostics,
    fail,
    identity,
    keyPath,
    now = new Date(),
    role,
  } = options
  const [authoritySnapshot, cert, key] = await Promise.all([
    loadStrictCertificateAuthority({
      allowCaBundle,
      caPath,
      diagnostics,
      fail,
      now,
    }),
    readStrictCertificateFile(certPath, diagnostics, fail),
    readStrictCertificateFile(keyPath, diagnostics, fail),
  ])
  const [leaf, ...intermediates] = parsePresentedCertificateChain(
    cert,
    diagnostics,
    fail,
  )
  assertCurrent(leaf, now, diagnostics, fail)
  assertLeafBasicConstraints(leaf, diagnostics, fail)
  if (
    leaf.ca ||
    leaf.keyUsage?.length !== 1 ||
    leaf.keyUsage[0] !== ROLE_OIDS[role]
  ) {
    fail(
      diagnostics.leafRoleInvalid,
      `TLS leaf certificate must be limited to ${role}Auth.`,
    )
  }
  assertExactKeyUsage(
    leaf,
    diagnostics.leafRoleInvalid,
    role === 'client' ? [0] : [0, 2],
    diagnostics,
    fail,
  )
  assertTrustedCertificateChain(
    leaf,
    intermediates,
    authoritySnapshot.authorities,
    authoritySnapshot.intermediates,
    now,
    diagnostics,
    fail,
  )
  let privateKey
  try {
    privateKey = createPrivateKey(key)
  } catch {
    fail(diagnostics.keyInvalid, 'TLS private key is malformed.')
  }
  const certificateKey = leaf.publicKey.export({
    format: 'der',
    type: 'spki',
  })
  const suppliedKey = createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  })
  if (!certificateKey.equals(suppliedKey)) {
    fail(
      diagnostics.keyMismatch,
      'TLS certificate and private key do not match.',
    )
  }
  assertIdentity(leaf, identity, diagnostics, fail)
  try {
    createSecureContext({
      ca: authoritySnapshot.contents,
      cert,
      key,
      minVersion: 'TLSv1.2',
    })
  } catch {
    fail(
      diagnostics.tlsContextInvalid,
      'TLS material cannot create a secure context.',
    )
  }
  return Object.freeze({ ca: authoritySnapshot.contents, cert, key })
}
