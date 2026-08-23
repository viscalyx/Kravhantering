const KEY_USAGE_OID = '2.5.29.15'

/**
 * @typedef {{ end: number, start: number, tag: number }} DerNode
 * @typedef {(category: string, message: string) => never} CertificateFailure
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
  const extension = certificateExtension(
    certificate,
    category,
    KEY_USAGE_OID,
    fail,
  )
  const bitString = readDerNode(extension.value, 0, fail)
  if (!extension.critical || bitString.tag !== 0x03) {
    fail(category, 'TLS certificate key usage is invalid.')
  }
  const bytes = extension.value.subarray(bitString.start + 1, bitString.end)
  const actualBits = []
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      const byte = bytes[byteIndex]
      if (byte !== undefined && (byte & (0x80 >> bitIndex)) !== 0) {
        actualBits.push(byteIndex * 8 + bitIndex)
      }
    }
  }
  if (JSON.stringify(actualBits) !== JSON.stringify(expectedBits)) {
    fail(category, 'TLS certificate key usage is invalid.')
  }
}
