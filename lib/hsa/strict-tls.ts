import {
  loadStrictCertificateAuthority as loadSharedCertificateAuthority,
  loadStrictCertificateMaterial,
  readStrictCertificateFile,
  strictCertificateAuthorityRawValues as sharedCertificateAuthorityRawValues,
} from '@/lib/hsa/strict-certificate-validation.mjs'

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

const DIAGNOSTICS = Object.freeze({
  caInvalid: 'tls_ca_invalid',
  certificateExpired: 'tls_certificate_expired',
  certificateInvalid: 'tls_certificate_invalid',
  certificateNotYetValid: 'tls_certificate_not_yet_valid',
  chainUntrusted: 'tls_chain_untrusted',
  fileInvalid: 'tls_file_invalid',
  filePathInvalid: 'tls_file_path_invalid',
  keyInvalid: 'tls_key_invalid',
  keyMismatch: 'tls_key_mismatch',
  leafRoleInvalid: 'tls_leaf_role_invalid',
  peerIdentityInvalid: 'tls_peer_identity_invalid',
  tlsContextInvalid: 'tls_certificate_invalid',
})

export class StrictTlsMaterialError extends Error {
  readonly diagnostic: StrictTlsMaterialDiagnostic

  constructor(diagnostic: StrictTlsMaterialDiagnostic, message: string) {
    super(message)
    this.name = 'StrictTlsMaterialError'
    this.diagnostic = diagnostic
  }
}

function fail(diagnostic: string, message: string): never {
  throw new StrictTlsMaterialError(
    diagnostic as StrictTlsMaterialDiagnostic,
    message,
  )
}

export async function readStrictTlsFile(filePath: string): Promise<Buffer> {
  return readStrictCertificateFile(filePath, DIAGNOSTICS, fail)
}

export interface StrictTlsSnapshot {
  ca: Buffer
  cert: Buffer
  key: Buffer
}

export async function loadStrictCertificateAuthority({
  caPath,
  now = new Date(),
}: {
  caPath: string
  now?: Date
}): Promise<Buffer> {
  const snapshot = await loadSharedCertificateAuthority({
    allowCaBundle: true,
    caPath,
    diagnostics: DIAGNOSTICS,
    fail,
    now,
  })
  return snapshot.contents
}

export function strictCertificateAuthorityRawValues(
  contents: Buffer,
): Buffer[] {
  return sharedCertificateAuthorityRawValues(contents, {
    allowCaBundle: true,
    diagnostics: DIAGNOSTICS,
    fail,
  })
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
  return loadStrictCertificateMaterial({
    allowCaBundle: true,
    caPath,
    certPath,
    diagnostics: DIAGNOSTICS,
    fail,
    identity: expectedIdentity
      ? {
          type: role === 'server' ? ('dns' as const) : ('subject' as const),
          value: expectedIdentity,
        }
      : undefined,
    keyPath,
    now,
    role,
  })
}
