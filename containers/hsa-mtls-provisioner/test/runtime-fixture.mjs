import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { loadCertificateProfile } from '../src/profile.mjs'
import { stageGeneration } from '../src/provisioner.mjs'

const execFileAsync = promisify(execFile)

const PROFILE_PATH = path.resolve(
  process.cwd(),
  process.cwd().endsWith('hsa-person-lookup-adapter') ||
    process.cwd().endsWith('hsa-directory-mock')
    ? '../hsa-mtls/certificate-profile.json'
    : 'containers/hsa-mtls/certificate-profile.json',
)

export async function createRuntimeCertificateFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'hsa-runtime-fixture-'))
  const issuerRoot = await mkdtemp('/dev/shm/hsa-runtime-issuer-')
  const profile = await loadCertificateProfile(PROFILE_PATH)
  const uid = process.getuid?.() ?? 1000
  const gid = process.getgid?.() ?? 1000
  for (const bundle of Object.values(profile.runtimeBundles)) {
    bundle.owner = { gid, uid }
  }
  const metadata = await stageGeneration({
    issuerRoot,
    lifetime: 'ephemeral',
    profile,
    rootDir,
  })
  const generationDir = path.join(rootDir, 'staged', metadata.generationId)
  return {
    bundle(role, filename) {
      return path.join(generationDir, 'bundles', role, filename)
    },
    async cleanup() {
      await Promise.all([
        rm(rootDir, { force: true, recursive: true }),
        rm(issuerRoot, { force: true, recursive: true }),
      ])
    },
    generationDir,
    profile,
  }
}

async function openssl(args) {
  await execFileAsync('openssl', args, { maxBuffer: 1024 * 1024 })
}

async function issueInvalidRoleFixture({
  caCertificate,
  caKey,
  extendedKeyUsage,
  keyUsage,
  keyUsageCritical = true,
  name,
  rootDir,
  role,
}) {
  const key = path.join(rootDir, `${name}.key`)
  const request = path.join(rootDir, `${name}.csr`)
  const certificate = path.join(rootDir, `${name}.crt`)
  const extensions = path.join(rootDir, `${name}.ext`)
  await writeFile(
    extensions,
    [
      'basicConstraints=critical,CA:FALSE',
      ...(keyUsage
        ? [`keyUsage=${keyUsageCritical ? 'critical,' : ''}${keyUsage}`]
        : []),
      `extendedKeyUsage=${extendedKeyUsage}`,
      ...(role === 'server'
        ? ['subjectAltName=DNS:hsa-person-lookup-adapter']
        : []),
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
  await openssl([
    'req',
    '-new',
    '-key',
    key,
    '-subj',
    role === 'server'
      ? '/CN=hsa-person-lookup-adapter'
      : '/CN=kravhantering-kong/serialNumber=SE5560000000-MOCK001',
    '-out',
    request,
  ])
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
    '-sha256',
    '-extfile',
    extensions,
    '-out',
    certificate,
  ])
  return { certificate, key }
}

export async function createInvalidRuntimeCertificateFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'hsa-invalid-runtime-'))
  const caKey = path.join(rootDir, 'ca.key')
  const caCertificate = path.join(rootDir, 'ca.crt')
  await openssl([
    'genpkey',
    '-algorithm',
    'RSA',
    '-pkeyopt',
    'rsa_keygen_bits:2048',
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
    '/CN=Strict Runtime Invalid-Material Test CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-out',
    caCertificate,
  ])
  const entries = Object.fromEntries(
    await Promise.all(
      [
        {
          extendedKeyUsage: 'clientAuth,serverAuth',
          keyUsage: 'digitalSignature',
          name: 'client-dual-eku',
          role: 'client',
        },
        {
          extendedKeyUsage: 'clientAuth',
          keyUsage: 'keyEncipherment',
          name: 'client-wrong-key-usage',
          role: 'client',
        },
        {
          extendedKeyUsage: 'clientAuth',
          name: 'client-missing-key-usage',
          role: 'client',
        },
        {
          extendedKeyUsage: 'clientAuth',
          keyUsage: 'digitalSignature',
          keyUsageCritical: false,
          name: 'client-noncritical-key-usage',
          role: 'client',
        },
        {
          extendedKeyUsage: 'clientAuth,serverAuth',
          keyUsage: 'digitalSignature,keyEncipherment',
          name: 'server-dual-eku',
          role: 'server',
        },
        {
          extendedKeyUsage: 'serverAuth',
          keyUsage: 'digitalSignature',
          name: 'server-wrong-key-usage',
          role: 'server',
        },
        {
          extendedKeyUsage: 'serverAuth',
          name: 'server-missing-key-usage',
          role: 'server',
        },
        {
          extendedKeyUsage: 'serverAuth',
          keyUsage: 'digitalSignature,keyEncipherment',
          keyUsageCritical: false,
          name: 'server-noncritical-key-usage',
          role: 'server',
        },
      ].map(async specification => [
        specification.name,
        await issueInvalidRoleFixture({
          ...specification,
          caCertificate,
          caKey,
          rootDir,
        }),
      ]),
    ),
  )
  return {
    caCertificate,
    cleanup: () => rm(rootDir, { force: true, recursive: true }),
    entry(name) {
      return entries[name]
    },
  }
}
