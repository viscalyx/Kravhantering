import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createSecureContext } from 'node:tls'
import { assertExactCertificateKeyUsage } from '@/lib/hsa/strict-certificate-validation.mjs'

const CLIENT_AUTH_OID = '1.3.6.1.5.5.7.3.2'
const SERVER_AUTH_OID = '1.3.6.1.5.5.7.3.1'

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

function certificateFrom(
  contents: Buffer,
  kind: 'ca' | 'leaf',
): X509Certificate {
  try {
    return new X509Certificate(contents)
  } catch {
    fail(
      kind === 'ca' ? 'tls_ca_invalid' : 'tls_certificate_invalid',
      'TLS certificate material is malformed.',
    )
  }
}

function certificateAuthoritiesFrom(contents: Buffer): X509Certificate[] {
  const text = contents.toString('utf8')
  const blocks = text.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu,
  )
  if (!blocks) return [certificateFrom(contents, 'ca')]
  const remainder = blocks.reduce(
    (value, block) => value.replace(block, ''),
    text,
  )
  if (remainder.trim()) {
    fail('tls_ca_invalid', 'TLS CA bundle contains malformed material.')
  }
  return blocks.map(block => certificateFrom(Buffer.from(block), 'ca'))
}

function assertCurrent(certificate: X509Certificate, now: Date): void {
  if (certificate.validFromDate > now) {
    fail('tls_certificate_not_yet_valid', 'TLS certificate is not yet valid.')
  }
  if (certificate.validToDate <= now) {
    fail('tls_certificate_expired', 'TLS certificate has expired.')
  }
}

function assertExactKeyUsage(
  certificate: X509Certificate,
  diagnostic: StrictTlsMaterialDiagnostic,
  expectedBits: number[],
): void {
  assertExactCertificateKeyUsage(
    certificate,
    diagnostic,
    expectedBits,
    (category, message) =>
      fail(
        category === 'CERTIFICATE_INVALID'
          ? 'tls_certificate_invalid'
          : diagnostic,
        message,
      ),
  )
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
  const ca = await readStrictTlsFile(caPath)
  for (const authority of certificateAuthoritiesFrom(ca)) {
    assertCurrent(authority, now)
    if (
      !authority.ca ||
      !authority.checkIssued(authority) ||
      !authority.verify(authority.publicKey)
    ) {
      fail('tls_ca_invalid', 'TLS trust root is not a self-signed CA.')
    }
    assertExactKeyUsage(authority, 'tls_ca_invalid', [5, 6])
  }
  return ca
}

export function strictCertificateAuthorityRawValues(
  contents: Buffer,
): Buffer[] {
  return certificateAuthoritiesFrom(contents).map(authority => authority.raw)
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
    loadStrictCertificateAuthority({ caPath, now }),
    readStrictTlsFile(certPath),
    readStrictTlsFile(keyPath),
  ])
  const authorities = certificateAuthoritiesFrom(ca)
  const leaf = certificateFrom(cert, 'leaf')
  assertCurrent(leaf, now)
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
  if (
    !authorities.some(
      authority =>
        leaf.checkIssued(authority) && leaf.verify(authority.publicKey),
    )
  ) {
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
