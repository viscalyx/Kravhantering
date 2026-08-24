import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID, X509Certificate } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { loadCertificateProfile } from '../src/profile.mjs'
import {
  validateCertificateAuthorityMaterial,
  validateCertificateMaterial,
} from '../src/provisioner.mjs'

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const profilePath = path.resolve(
  packageDir,
  '../hsa-mtls/certificate-profile.json',
)

let caCertificate
let caKey
let fixtureDir
let profile

async function openssl(args) {
  await execFileAsync('openssl', args, { maxBuffer: 1024 * 1024 })
}

async function issueClient({
  eku = 'clientAuth',
  keyUsage = 'digitalSignature',
  name,
  signature = '-sha256',
  subject = '/CN=kravhantering-app',
}) {
  const key = path.join(fixtureDir, `${name}.key`)
  const request = path.join(fixtureDir, `${name}.csr`)
  const certificate = path.join(fixtureDir, `${name}.crt`)
  const extensions = path.join(fixtureDir, `${name}.ext`)
  await writeFile(
    extensions,
    [
      'basicConstraints=critical,CA:FALSE',
      `keyUsage=critical,${keyUsage}`,
      `extendedKeyUsage=${eku}`,
      '',
    ].join('\n'),
  )
  await openssl([
    'genpkey',
    '-algorithm',
    'RSA',
    '-pkeyopt',
    'rsa_keygen_bits:2048',
    '-out',
    key,
  ])
  await openssl(['req', '-new', '-key', key, '-subj', subject, '-out', request])
  await openssl([
    'x509',
    '-req',
    '-in',
    request,
    '-CA',
    caCertificate,
    '-CAkey',
    caKey,
    '-set_serial',
    `0x${randomUUID().replaceAll('-', '')}`,
    '-days',
    '7',
    signature,
    '-extfile',
    extensions,
    '-out',
    certificate,
  ])
  return { certificate, key }
}

describe('certificate material validation', () => {
  before(async () => {
    profile = await loadCertificateProfile(profilePath)
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'hsa-validator-'))
    caKey = path.join(fixtureDir, 'ca.key')
    caCertificate = path.join(fixtureDir, 'ca.crt')
    await openssl([
      'genpkey',
      '-algorithm',
      'RSA',
      '-pkeyopt',
      'rsa_keygen_bits:4096',
      '-out',
      caKey,
    ])
    await openssl([
      'req',
      '-x509',
      '-new',
      '-key',
      caKey,
      '-sha256',
      '-days',
      '7',
      '-subj',
      '/CN=Validator Test CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
      '-out',
      caCertificate,
    ])
  })

  after(() => rm(fixtureDir, { force: true, recursive: true }))

  it('accepts the exact trusted single-purpose client', async () => {
    const material = await issueClient({ name: 'valid-client' })
    const result = await validateCertificateMaterial({
      caPath: caCertificate,
      certificatePath: material.certificate,
      keyPath: material.key,
      kind: 'client',
      leaf: profile.trustDomains['app-to-kong'].client,
      now: new Date(),
      profile,
    })

    assert.deepEqual(result, { valid: true })
  })

  it('rejects a trusted client with the wrong exact subject', async () => {
    const material = await issueClient({
      name: 'wrong-identity',
      subject: '/CN=trusted-but-wrong-app',
    })

    await assert.rejects(
      validateCertificateMaterial({
        caPath: caCertificate,
        certificatePath: material.certificate,
        keyPath: material.key,
        kind: 'client',
        leaf: profile.trustDomains['app-to-kong'].client,
        now: new Date(),
        profile,
      }),
      error => error.category === 'PEER_IDENTITY_INVALID',
    )
  })

  it('rejects dual EKU, wrong key usage, and SHA-1 signatures', async t => {
    const fixtures = [
      {
        category: 'EXTENDED_KEY_USAGE_INVALID',
        material: await issueClient({
          eku: 'clientAuth,serverAuth',
          name: 'dual-eku',
        }),
        name: 'a dual-purpose EKU',
      },
      {
        category: 'KEY_USAGE_INVALID',
        material: await issueClient({
          keyUsage: 'keyEncipherment',
          name: 'wrong-key-usage',
        }),
        name: 'client-inappropriate key usage',
      },
      {
        category: 'KEY_USAGE_INVALID',
        material: await issueClient({
          keyUsage: 'digitalSignature,dataEncipherment',
          name: 'extra-key-usage',
        }),
        name: 'an additional client key usage',
      },
      {
        category: 'SIGNATURE_ALGORITHM_INVALID',
        material: await issueClient({
          name: 'sha1-signature',
          signature: '-sha1',
        }),
        name: 'a non-profile signature',
      },
    ]

    for (const fixture of fixtures) {
      await t.test(`rejects ${fixture.name}`, async () => {
        await assert.rejects(
          validateCertificateMaterial({
            caPath: caCertificate,
            certificatePath: fixture.material.certificate,
            keyPath: fixture.material.key,
            kind: 'client',
            leaf: profile.trustDomains['app-to-kong'].client,
            now: new Date(),
            profile,
          }),
          error => error.category === fixture.category,
        )
      })
    }
  })

  it('rejects a CA with an additional key usage', async () => {
    const overbroadCaKey = path.join(fixtureDir, 'overbroad-ca.key')
    const overbroadCaCertificate = path.join(fixtureDir, 'overbroad-ca.crt')
    await openssl([
      'genpkey',
      '-algorithm',
      'RSA',
      '-pkeyopt',
      'rsa_keygen_bits:4096',
      '-out',
      overbroadCaKey,
    ])
    await openssl([
      'req',
      '-x509',
      '-new',
      '-key',
      overbroadCaKey,
      '-sha256',
      '-days',
      '7',
      '-subj',
      '/CN=Kravhantering App to Kong Test CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign,digitalSignature',
      '-out',
      overbroadCaCertificate,
    ])

    await assert.rejects(
      validateCertificateAuthorityMaterial({
        caPath: overbroadCaCertificate,
        domain: profile.trustDomains['app-to-kong'],
        now: new Date(),
        profile,
      }),
      error => error.category === 'KEY_USAGE_INVALID',
    )
  })

  it('rejects not-yet-valid and expired material at the evaluation time', async () => {
    const material = await issueClient({ name: 'validity-client' })
    const certificate = new X509Certificate(
      await readFile(material.certificate),
    )
    const options = {
      caPath: caCertificate,
      certificatePath: material.certificate,
      keyPath: material.key,
      kind: 'client',
      leaf: profile.trustDomains['app-to-kong'].client,
      profile,
    }

    await assert.rejects(
      validateCertificateMaterial({
        ...options,
        now: new Date(certificate.validFromDate.getTime() - 1),
      }),
      error => error.category === 'CERTIFICATE_NOT_YET_VALID',
    )
    await assert.rejects(
      validateCertificateMaterial({
        ...options,
        now: new Date(certificate.validToDate.getTime() + 1),
      }),
      error => error.category === 'CERTIFICATE_EXPIRED',
    )
  })

  it('rejects a CA leaf and malformed PEM', async () => {
    const malformed = path.join(fixtureDir, 'malformed.crt')
    await writeFile(malformed, 'not a certificate')
    const leaf = profile.trustDomains['app-to-kong'].client

    await assert.rejects(
      validateCertificateMaterial({
        caPath: caCertificate,
        certificatePath: caCertificate,
        keyPath: caKey,
        kind: 'client',
        leaf,
        now: new Date(),
        profile,
      }),
      error => error.category === 'LEAF_CONSTRAINT_INVALID',
    )
    await assert.rejects(
      validateCertificateMaterial({
        caPath: caCertificate,
        certificatePath: malformed,
        keyPath: caKey,
        kind: 'client',
        leaf,
        now: new Date(),
        profile,
      }),
      error => error.category === 'CERTIFICATE_MALFORMED',
    )
  })
})
