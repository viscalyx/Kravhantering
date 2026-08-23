import { execFile } from 'node:child_process'
import { randomUUID, X509Certificate } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

async function issueWithIssuer({
  certificate,
  extensions,
  issuerCertificate,
  issuerKey,
  key,
  subject,
}) {
  const request = `${certificate}.csr`
  const extensionPath = `${certificate}.ext`
  await writeFile(extensionPath, `${extensions.join('\n')}\n`)
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
    issuerCertificate,
    '-CAkey',
    issuerKey,
    '-set_serial',
    `0x${randomUUID().replaceAll('-', '')}`,
    '-days',
    '7',
    '-sha256',
    '-extfile',
    extensionPath,
    '-out',
    certificate,
  ])
}

export async function createCertificateChainFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'hsa-chain-fixture-'))
  const rootKey = path.join(rootDir, 'root.key')
  const rootCertificate = path.join(rootDir, 'root.crt')
  await openssl([
    'genpkey',
    '-algorithm',
    'RSA',
    '-pkeyopt',
    'rsa_keygen_bits:2048',
    '-out',
    rootKey,
  ])
  await openssl([
    'req',
    '-x509',
    '-new',
    '-key',
    rootKey,
    '-sha256',
    '-days',
    '7',
    '-subj',
    '/CN=Strict Runtime Chain Root',
    '-addext',
    'basicConstraints=critical,CA:TRUE,pathlen:1',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-out',
    rootCertificate,
  ])

  const intermediateKey = path.join(rootDir, 'intermediate.key')
  const intermediateCertificate = path.join(rootDir, 'intermediate.crt')
  const authorityBundle = path.join(rootDir, 'authority-bundle.crt')
  const duplicateRootBundle = path.join(rootDir, 'duplicate-root-bundle.crt')
  const orphanIntermediateBundle = path.join(
    rootDir,
    'orphan-intermediate-bundle.crt',
  )
  const oversizedAuthorityBundle = path.join(
    rootDir,
    'oversized-authority-bundle.crt',
  )
  await issueWithIssuer({
    certificate: intermediateCertificate,
    extensions: [
      'basicConstraints=critical,CA:TRUE,pathlen:0',
      'keyUsage=critical,keyCertSign,cRLSign',
      'subjectKeyIdentifier=hash',
      'authorityKeyIdentifier=keyid:always',
    ],
    issuerCertificate: rootCertificate,
    issuerKey: rootKey,
    key: intermediateKey,
    subject: '/CN=Strict Runtime Chain Intermediate',
  })
  await writeFile(
    authorityBundle,
    Buffer.concat([
      await readFile(intermediateCertificate),
      Buffer.from('\n'),
      await readFile(rootCertificate),
    ]),
  )
  const rootContents = await readFile(rootCertificate)
  await writeFile(
    duplicateRootBundle,
    Buffer.concat([rootContents, Buffer.from('\n'), rootContents]),
  )
  await writeFile(
    oversizedAuthorityBundle,
    Buffer.concat(
      Array.from({ length: 17 }, () =>
        Buffer.concat([rootContents, Buffer.from('\n')]),
      ),
    ),
  )

  const orphanRootKey = path.join(rootDir, 'orphan-root.key')
  const orphanRootCertificate = path.join(rootDir, 'orphan-root.crt')
  await openssl([
    'genpkey',
    '-algorithm',
    'RSA',
    '-pkeyopt',
    'rsa_keygen_bits:2048',
    '-out',
    orphanRootKey,
  ])
  await openssl([
    'req',
    '-x509',
    '-new',
    '-key',
    orphanRootKey,
    '-sha256',
    '-days',
    '7',
    '-subj',
    '/CN=Orphan Chain Root',
    '-addext',
    'basicConstraints=critical,CA:TRUE,pathlen:1',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-out',
    orphanRootCertificate,
  ])
  const orphanIntermediateKey = path.join(rootDir, 'orphan-intermediate.key')
  const orphanIntermediateCertificate = path.join(
    rootDir,
    'orphan-intermediate.crt',
  )
  await issueWithIssuer({
    certificate: orphanIntermediateCertificate,
    extensions: [
      'basicConstraints=critical,CA:TRUE,pathlen:0',
      'keyUsage=critical,keyCertSign,cRLSign',
    ],
    issuerCertificate: orphanRootCertificate,
    issuerKey: orphanRootKey,
    key: orphanIntermediateKey,
    subject: '/CN=Orphan Chain Intermediate',
  })
  await writeFile(
    orphanIntermediateBundle,
    Buffer.concat([
      await readFile(orphanIntermediateCertificate),
      Buffer.from('\n'),
      rootContents,
    ]),
  )

  const nonCaIssuerKey = path.join(rootDir, 'non-ca-issuer.key')
  const nonCaIssuerCertificate = path.join(rootDir, 'non-ca-issuer.crt')
  await issueWithIssuer({
    certificate: nonCaIssuerCertificate,
    extensions: [
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,keyCertSign,cRLSign',
    ],
    issuerCertificate: rootCertificate,
    issuerKey: rootKey,
    key: nonCaIssuerKey,
    subject: '/CN=Invalid Non-CA Issuer',
  })
  const nonCaLeafKey = path.join(rootDir, 'non-ca-leaf.key')
  const nonCaLeafCertificate = path.join(rootDir, 'non-ca-leaf.crt')
  const nonCaChain = path.join(rootDir, 'non-ca-chain.crt')
  await issueWithIssuer({
    certificate: nonCaLeafCertificate,
    extensions: [
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=clientAuth',
    ],
    issuerCertificate: nonCaIssuerCertificate,
    issuerKey: nonCaIssuerKey,
    key: nonCaLeafKey,
    subject: '/CN=kravhantering-app',
  })
  await writeFile(
    nonCaChain,
    Buffer.concat([
      await readFile(nonCaLeafCertificate),
      Buffer.from('\n'),
      await readFile(nonCaIssuerCertificate),
    ]),
  )

  const entries = {}
  for (const role of ['client', 'server']) {
    const key = path.join(rootDir, `${role}.key`)
    const leaf = path.join(rootDir, `${role}-leaf.crt`)
    const complete = path.join(rootDir, `${role}-complete-chain.crt`)
    const extraneous = path.join(rootDir, `${role}-extraneous-chain.crt`)
    const oversized = path.join(rootDir, `${role}-oversized-chain.crt`)
    await issueWithIssuer({
      certificate: leaf,
      extensions: [
        'basicConstraints=critical,CA:FALSE',
        `keyUsage=critical,${role === 'client' ? 'digitalSignature' : 'digitalSignature,keyEncipherment'}`,
        `extendedKeyUsage=${role}Auth`,
        ...(role === 'server'
          ? ['subjectAltName=DNS:hsa-person-lookup-adapter']
          : []),
      ],
      issuerCertificate: intermediateCertificate,
      issuerKey: intermediateKey,
      key,
      subject:
        role === 'client'
          ? '/CN=kravhantering-app'
          : '/CN=hsa-person-lookup-adapter',
    })
    await writeFile(
      complete,
      Buffer.concat([
        await readFile(leaf),
        Buffer.from('\n'),
        await readFile(intermediateCertificate),
      ]),
    )
    const leafContents = await readFile(leaf)
    const intermediateContents = await readFile(intermediateCertificate)
    await writeFile(
      extraneous,
      Buffer.concat([
        leafContents,
        Buffer.from('\n'),
        intermediateContents,
        Buffer.from('\n'),
        rootContents,
      ]),
    )
    await writeFile(
      oversized,
      Buffer.concat([
        leafContents,
        Buffer.from('\n'),
        ...Array.from({ length: 8 }, () =>
          Buffer.concat([intermediateContents, Buffer.from('\n')]),
        ),
      ]),
    )
    entries[role] = { complete, extraneous, key, leaf, oversized }
  }
  const derRootCertificate = path.join(rootDir, 'root.der')
  const derClientCertificate = path.join(rootDir, 'client.der')
  const derClientPem = path.join(rootDir, 'client-der-source.crt')
  const derClientKey = path.join(rootDir, 'client-der-source.key')
  await issueWithIssuer({
    certificate: derClientPem,
    extensions: [
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=clientAuth',
    ],
    issuerCertificate: rootCertificate,
    issuerKey: rootKey,
    key: derClientKey,
    subject: '/CN=kravhantering-app',
  })
  await writeFile(derRootCertificate, new X509Certificate(rootContents).raw)
  await writeFile(
    derClientCertificate,
    new X509Certificate(await readFile(derClientPem)).raw,
  )
  return {
    authorityBundle,
    cleanup: () => rm(rootDir, { force: true, recursive: true }),
    client: entries.client,
    derClientCertificate,
    derClientKey,
    derRootCertificate,
    duplicateRootBundle,
    intermediateCertificate,
    nonCaChain,
    nonCaLeafKey,
    orphanIntermediateBundle,
    rootCertificate,
    server: entries.server,
    oversizedAuthorityBundle,
  }
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
