import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createSecureContext } from 'node:tls'
import { assertExactCertificateKeyUsage } from '../../../lib/hsa/strict-certificate-validation.mjs'

const ROLE_OIDS = {
  client: '1.3.6.1.5.5.7.3.2',
  server: '1.3.6.1.5.5.7.3.1',
}

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
  assertExactCertificateKeyUsage(authority, 'CA_INVALID', [5, 6], fail)
  if (
    leaf.ca ||
    leaf.keyUsage?.length !== 1 ||
    leaf.keyUsage[0] !== ROLE_OIDS[role]
  ) {
    fail('LEAF_ROLE_INVALID', `TLS leaf is not limited to ${role}Auth.`)
  }
  assertExactCertificateKeyUsage(
    leaf,
    'LEAF_ROLE_INVALID',
    role === 'client' ? [0] : [0, 2],
    fail,
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
