import { loadStrictCertificateMaterial } from '../../../lib/hsa/strict-certificate-validation.mjs'

const DIAGNOSTICS = Object.freeze({
  caInvalid: 'CA_INVALID',
  certificateExpired: 'CERTIFICATE_EXPIRED',
  certificateInvalid: 'CERTIFICATE_INVALID',
  certificateNotYetValid: 'CERTIFICATE_NOT_YET_VALID',
  chainUntrusted: 'CHAIN_UNTRUSTED',
  fileInvalid: 'FILE_INVALID',
  filePathInvalid: 'FILE_PATH_INVALID',
  keyInvalid: 'KEY_INVALID',
  keyMismatch: 'KEY_MISMATCH',
  leafRoleInvalid: 'LEAF_ROLE_INVALID',
  peerIdentityInvalid: 'PEER_IDENTITY_INVALID',
  tlsContextInvalid: 'TLS_CONTEXT_INVALID',
})

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

export async function loadStrictTlsMaterial({
  caPath,
  certPath,
  expectedDnsIdentity,
  keyPath,
  now = new Date(),
  role,
}) {
  return loadStrictCertificateMaterial({
    allowCaBundle: true,
    caPath,
    certPath,
    diagnostics: DIAGNOSTICS,
    fail,
    identity: expectedDnsIdentity
      ? { type: 'dns', value: expectedDnsIdentity }
      : undefined,
    keyPath,
    now,
    role,
  })
}
