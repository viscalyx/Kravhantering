import { execFile } from 'node:child_process'
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  X509Certificate,
} from 'node:crypto'
import {
  chmod,
  chown,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { fail, ProvisionerError } from './errors.mjs'
import {
  certificateProfileContract,
  digestCertificateProfile,
} from './profile.mjs'

const execFileAsync = promisify(execFile)
const TMPFS_MAGIC = 0x01021994
const EXTENDED_KEY_USAGE_OIDS = {
  clientAuth: '1.3.6.1.5.5.7.3.2',
  serverAuth: '1.3.6.1.5.5.7.3.1',
}
const OPENSSL_KEY_USAGE_NAMES = {
  cRLSign: 'CRL Sign',
  digitalSignature: 'Digital Signature',
  keyCertSign: 'Certificate Sign',
  keyEncipherment: 'Key Encipherment',
}

function assert(condition, category, message) {
  if (!condition) fail(category, message)
}

async function runOpenSsl(args, { cwd } = {}) {
  try {
    return await execFileAsync('openssl', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
  } catch (error) {
    fail(
      'OPENSSL_OPERATION_FAILED',
      'OpenSSL could not complete the certificate operation',
      {
        cause: error,
      },
    )
  }
}

function subjectArgument(subjectRfc2253) {
  const attributes = subjectRfc2253.split(',').map(value => value.trim())
  return `/${attributes.reverse().join('/')}`
}

function extensionConfiguration(leaf) {
  const lines = [
    '[leaf]',
    'basicConstraints=critical,CA:FALSE',
    `keyUsage=critical,${leaf.keyUsage.values.join(',')}`,
    `extendedKeyUsage=${leaf.extendedKeyUsage.join(',')}`,
    'subjectKeyIdentifier=hash',
    'authorityKeyIdentifier=keyid:always',
  ]
  if (leaf.dnsSans.length > 0) {
    lines.push(
      `subjectAltName=${leaf.dnsSans.map(value => `DNS:${value}`).join(',')}`,
    )
  }
  return `${lines.join('\n')}\n`
}

function caConfiguration(ca) {
  return [
    '[req]',
    'prompt=no',
    'distinguished_name=subject',
    'x509_extensions=ca_extensions',
    '[subject]',
    ...ca.subjectRfc2253.split(',').reverse(),
    '[ca_extensions]',
    `basicConstraints=critical,CA:TRUE,pathlen:${ca.basicConstraints.pathLength}`,
    `keyUsage=critical,${ca.keyUsage.values.join(',')}`,
    'subjectKeyIdentifier=hash',
    'authorityKeyIdentifier=keyid:always',
    '',
  ].join('\n')
}

async function assertTmpfs(issuerRoot) {
  assert(
    path.isAbsolute(issuerRoot),
    'ISSUER_WORKSPACE_INVALID',
    'Issuer workspace must be absolute',
  )
  await mkdir(issuerRoot, { recursive: true, mode: 0o700 })
  const details = await statfs(issuerRoot)
  assert(
    Number(details.type) === TMPFS_MAGIC,
    'ISSUER_WORKSPACE_NOT_TMPFS',
    'Issuer workspace must use tmpfs',
  )
}

async function setRuntimeFileSecurity(file, filename, owner, profile) {
  const mode = Number.parseInt(
    filename.endsWith('.key')
      ? profile.fileModes.privateKey
      : profile.fileModes.publicCertificate,
    8,
  )
  await chmod(file, mode)
  if (process.getuid?.() === 0) {
    await chown(file, owner.uid, owner.gid)
    return
  }
  assert(
    owner.uid === process.getuid() && owner.gid === process.getgid(),
    'OWNERSHIP_UNAVAILABLE',
    'Provisioner must run as root to assign pinned runtime ownership',
  )
}

async function setRuntimeDirectorySecurity(directory, owner) {
  await chmod(directory, 0o700)
  if (process.getuid?.() === 0) {
    await chown(directory, owner.uid, owner.gid)
    return
  }
  assert(
    owner.uid === process.getuid() && owner.gid === process.getgid(),
    'OWNERSHIP_UNAVAILABLE',
    'Provisioner must run as root to assign pinned runtime ownership',
  )
}

async function issueLeaf({
  caCertificate,
  caPrivateKey,
  days,
  leaf,
  name,
  workspace,
  profile,
}) {
  const privateKey = path.join(workspace, `${name}.key`)
  const request = path.join(workspace, `${name}.csr`)
  const certificate = path.join(workspace, `${name}.crt`)
  const extensions = path.join(workspace, `${name}.ext`)
  await runOpenSsl([
    'genpkey',
    '-algorithm',
    profile.algorithms.leaf.keyAlgorithm,
    '-pkeyopt',
    `rsa_keygen_bits:${profile.algorithms.leaf.keyBits}`,
    '-out',
    privateKey,
  ])
  await runOpenSsl([
    'req',
    '-new',
    '-key',
    privateKey,
    '-subj',
    subjectArgument(leaf.subjectRfc2253),
    '-out',
    request,
  ])
  await writeFile(extensions, extensionConfiguration(leaf), { mode: 0o600 })
  await runOpenSsl([
    'x509',
    '-req',
    '-in',
    request,
    '-CA',
    caCertificate,
    '-CAkey',
    caPrivateKey,
    '-set_serial',
    `0x${randomBytes(16).toString('hex')}`,
    '-days',
    String(days),
    '-sha256',
    '-extfile',
    extensions,
    '-extensions',
    'leaf',
    '-out',
    certificate,
  ])
  return { certificate, privateKey }
}

async function issueTrustDomain({
  domain,
  domainName,
  issuerRoot,
  lifetime,
  profile,
}) {
  const workspace = await mkdtemp(path.join(issuerRoot, `${domainName}-`))
  try {
    const caPrivateKey = path.join(workspace, 'ca-signing.key')
    const caCertificate = path.join(workspace, 'ca.crt')
    const caConfig = path.join(workspace, 'ca.cnf')
    const validity = profile.validity[lifetime]
    await writeFile(caConfig, caConfiguration(domain.ca), { mode: 0o600 })
    await runOpenSsl([
      'genpkey',
      '-algorithm',
      profile.algorithms.ca.keyAlgorithm,
      '-pkeyopt',
      `rsa_keygen_bits:${profile.algorithms.ca.keyBits}`,
      '-out',
      caPrivateKey,
    ])
    await runOpenSsl([
      'req',
      '-x509',
      '-new',
      '-key',
      caPrivateKey,
      '-sha256',
      '-days',
      String(validity.caDays),
      '-config',
      caConfig,
      '-out',
      caCertificate,
    ])
    const server = await issueLeaf({
      caCertificate,
      caPrivateKey,
      days: validity.leafDays,
      leaf: domain.server,
      name: 'server',
      profile,
      workspace,
    })
    const client = await issueLeaf({
      caCertificate,
      caPrivateKey,
      days: validity.leafDays,
      leaf: domain.client,
      name: 'client',
      profile,
      workspace,
    })
    const wrongClient = await issueLeaf({
      caCertificate,
      caPrivateKey,
      days: validity.leafDays,
      leaf: domain.wrongClient,
      name: 'wrong-client',
      profile,
      workspace,
    })
    const wrongServer = await issueLeaf({
      caCertificate,
      caPrivateKey,
      days: validity.leafDays,
      leaf: domain.wrongServer,
      name: 'wrong-server',
      profile,
      workspace,
    })
    return {
      material: new Map([
        [domain.ca.materialId, await readFile(caCertificate)],
        [
          domain.server.certificateMaterialId,
          await readFile(server.certificate),
        ],
        [domain.server.privateKeyMaterialId, await readFile(server.privateKey)],
        [
          domain.client.certificateMaterialId,
          await readFile(client.certificate),
        ],
        [domain.client.privateKeyMaterialId, await readFile(client.privateKey)],
        [
          domain.wrongClient.certificateMaterialId,
          await readFile(wrongClient.certificate),
        ],
        [
          domain.wrongClient.privateKeyMaterialId,
          await readFile(wrongClient.privateKey),
        ],
        [
          domain.wrongServer.certificateMaterialId,
          await readFile(wrongServer.certificate),
        ],
        [
          domain.wrongServer.privateKeyMaterialId,
          await readFile(wrongServer.privateKey),
        ],
      ]),
    }
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
}

function generationPath(rootDir, state, generationId) {
  return path.join(rootDir, state, generationId)
}

async function writeSelection(rootDir, selection) {
  const temporary = path.join(rootDir, `.selection-${randomUUID()}.json`)
  await writeFile(temporary, `${JSON.stringify(selection, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, path.join(rootDir, 'selection.json'))
}

async function readSelection(rootDir, { optional = false } = {}) {
  try {
    return JSON.parse(
      await readFile(path.join(rootDir, 'selection.json'), 'utf8'),
    )
  } catch (error) {
    if (optional && error.code === 'ENOENT')
      return { current: null, previous: null }
    fail('SELECTION_INVALID', 'Generation selection could not be read', {
      cause: error,
    })
  }
}

function materialLocations(profile) {
  const locations = new Map()
  for (const [role, bundle] of Object.entries(profile.runtimeBundles)) {
    for (const [filename, materialId] of Object.entries(bundle.files)) {
      const existing = locations.get(materialId) ?? []
      existing.push({ filename, role })
      locations.set(materialId, existing)
    }
  }
  return locations
}

async function distributeMaterial(generationDir, profile, material) {
  const locations = materialLocations(profile)
  for (const [materialId, contents] of material) {
    for (const { filename, role } of locations.get(materialId) ?? []) {
      const file = path.join(generationDir, 'bundles', role, filename)
      const temporary = `${file}.${randomUUID()}.tmp`
      await writeFile(temporary, contents, { mode: 0o600 })
      await rename(temporary, file)
    }
  }
}

async function secureBundles(generationDir, profile) {
  for (const [role, bundle] of Object.entries(profile.runtimeBundles)) {
    for (const filename of Object.keys(bundle.files)) {
      await setRuntimeFileSecurity(
        path.join(generationDir, 'bundles', role, filename),
        filename,
        bundle.owner,
        profile,
      )
    }
    await setRuntimeDirectorySecurity(
      path.join(generationDir, 'bundles', role),
      bundle.owner,
    )
  }
}

function firstMaterialFile(generationDir, profile, materialId) {
  const [{ filename, role }] = materialLocations(profile).get(materialId) ?? []
  assert(
    role,
    'BUNDLE_CONTENT_INVALID',
    `Material ${materialId} is absent from runtime bundles`,
  )
  return path.join(generationDir, 'bundles', role, filename)
}

async function certificateNames(certificatePath) {
  const { stdout } = await runOpenSsl([
    'x509',
    '-in',
    certificatePath,
    '-noout',
    '-subject',
    '-issuer',
    '-nameopt',
    'RFC2253',
  ])
  const entries = Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map(line => line.split(/=(.*)/s).slice(0, 2)),
  )
  return { issuerRfc2253: entries.issuer, subjectRfc2253: entries.subject }
}

async function certificateMetadata(materialId, certificatePath) {
  let certificate
  let raw
  try {
    raw = await readFile(certificatePath)
    certificate = new X509Certificate(raw)
  } catch (error) {
    fail('CERTIFICATE_MALFORMED', 'Certificate material is malformed', {
      cause: error,
    })
  }
  const names = await certificateNames(certificatePath)
  return {
    digestSha256: createHash('sha256').update(raw).digest('hex'),
    issuerRfc2253: names.issuerRfc2253,
    materialId,
    notAfter: certificate.validToDate.toISOString(),
    notBefore: certificate.validFromDate.toISOString(),
    subjectRfc2253: names.subjectRfc2253,
  }
}

async function readExtension(certificatePath, extension) {
  const { stdout } = await runOpenSsl([
    'x509',
    '-in',
    certificatePath,
    '-noout',
    '-ext',
    extension,
  ])
  return stdout
}

function assertExactCriticalKeyUsage(extension, expectedValues, subject) {
  const [heading, ...valueLines] = extension
    .trim()
    .split(/\r?\n/u)
    .map(line => line.trim())
  assert(
    heading === 'X509v3 Key Usage: critical',
    'KEY_USAGE_INVALID',
    `${subject} key usage is not critical`,
  )
  const actualValues = valueLines
    .join(' ')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .sort()
  assert(
    JSON.stringify(actualValues) === JSON.stringify([...expectedValues].sort()),
    'KEY_USAGE_INVALID',
    `${subject} key usage does not exactly match the profile`,
  )
}

function assertCertificateTime(certificate, now) {
  assert(
    certificate.validFromDate <= now,
    'CERTIFICATE_NOT_YET_VALID',
    'Certificate is not yet valid',
  )
  assert(
    certificate.validToDate > now,
    'CERTIFICATE_EXPIRED',
    'Certificate has expired',
  )
}

async function validateCa({ caPath, domain, now, profile }) {
  let certificate
  try {
    certificate = new X509Certificate(await readFile(caPath))
  } catch (error) {
    fail('CERTIFICATE_MALFORMED', 'CA certificate is malformed', {
      cause: error,
    })
  }
  assert(
    certificate.ca,
    'CA_CONSTRAINT_INVALID',
    'Trust root is not a CA certificate',
  )
  assertCertificateTime(certificate, now)
  assert(
    certificate.signatureAlgorithm === profile.algorithms.signature,
    'SIGNATURE_ALGORITHM_INVALID',
    'CA signature algorithm does not match the profile',
  )
  assert(
    certificate.checkIssued(certificate) &&
      certificate.verify(certificate.publicKey),
    'CA_CONSTRAINT_INVALID',
    'Trust root is not self-issued and self-signed',
  )
  const names = await certificateNames(caPath)
  assert(
    names.subjectRfc2253 === domain.ca.subjectRfc2253,
    'CA_IDENTITY_INVALID',
    'Trust root subject is unexpected',
  )
  assert(
    certificate.publicKey.asymmetricKeyType === 'rsa' &&
      certificate.publicKey.asymmetricKeyDetails?.modulusLength ===
        profile.algorithms.ca.keyBits,
    'KEY_ALGORITHM_INVALID',
    'CA public key does not match the profile',
  )
  const constraints = await readExtension(caPath, 'basicConstraints')
  assert(
    /X509v3 Basic Constraints: critical/.test(constraints),
    'CA_CONSTRAINT_INVALID',
    'CA constraints are not critical',
  )
  assert(
    /CA:TRUE, pathlen:0/.test(constraints),
    'CA_CONSTRAINT_INVALID',
    'CA path length is invalid',
  )
  const usage = await readExtension(caPath, 'keyUsage')
  assertExactCriticalKeyUsage(
    usage,
    domain.ca.keyUsage.values.map(value => OPENSSL_KEY_USAGE_NAMES[value]),
    'CA',
  )
}

async function validateLeaf({
  caPath,
  certificatePath,
  keyPath,
  kind,
  leaf,
  now,
  profile,
}) {
  let certificate
  let privateKey
  try {
    certificate = new X509Certificate(await readFile(certificatePath))
  } catch (error) {
    fail('CERTIFICATE_MALFORMED', 'Leaf certificate is malformed', {
      cause: error,
    })
  }
  try {
    privateKey = createPrivateKey(await readFile(keyPath))
  } catch (error) {
    fail('PRIVATE_KEY_MALFORMED', 'Leaf private key is malformed', {
      cause: error,
    })
  }
  assert(
    !certificate.ca,
    'LEAF_CONSTRAINT_INVALID',
    'CA certificate cannot be used as a leaf',
  )
  assertCertificateTime(certificate, now)
  assert(
    certificate.signatureAlgorithm === profile.algorithms.signature,
    'SIGNATURE_ALGORITHM_INVALID',
    'Leaf signature algorithm does not match the profile',
  )
  assert(
    certificate.publicKey
      .export({ format: 'der', type: 'spki' })
      .equals(
        createPublicKey(privateKey).export({ format: 'der', type: 'spki' }),
      ),
    'CERT_KEY_MISMATCH',
    'Certificate and private key do not match',
  )
  assert(
    certificate.publicKey.asymmetricKeyType === 'rsa' &&
      certificate.publicKey.asymmetricKeyDetails?.modulusLength ===
        profile.algorithms.leaf.keyBits,
    'KEY_ALGORITHM_INVALID',
    'Leaf public key does not match the profile',
  )
  assert(
    JSON.stringify(certificate.keyUsage) ===
      JSON.stringify(
        leaf.extendedKeyUsage.map(value => EXTENDED_KEY_USAGE_OIDS[value]),
      ),
    'EXTENDED_KEY_USAGE_INVALID',
    'Leaf EKU is not single-purpose',
  )
  const keyUsage = await readExtension(certificatePath, 'keyUsage')
  const expectedKeyUsages = leaf.keyUsage.values.map(
    value => OPENSSL_KEY_USAGE_NAMES[value],
  )
  assertExactCriticalKeyUsage(keyUsage, expectedKeyUsages, 'Leaf')
  const constraints = await readExtension(certificatePath, 'basicConstraints')
  assert(
    /X509v3 Basic Constraints: critical/.test(constraints) &&
      /CA:FALSE/.test(constraints),
    'LEAF_CONSTRAINT_INVALID',
    'Leaf basic constraints are invalid',
  )
  const names = await certificateNames(certificatePath)
  if (leaf.authorization.type === 'dns-san') {
    assert(
      certificate.subjectAltName === `DNS:${leaf.authorization.value}` &&
        certificate.checkHost(leaf.authorization.value, {
          multiLabelWildcards: false,
          partialWildcards: false,
          singleLabelSubdomains: false,
          subject: 'never',
          wildcards: false,
        }) === leaf.authorization.value,
      'PEER_IDENTITY_INVALID',
      'Server DNS identity is invalid',
    )
  } else if (leaf.authorization.type === 'subject-rfc2253') {
    assert(
      names.subjectRfc2253 === leaf.authorization.value,
      'PEER_IDENTITY_INVALID',
      'Client subject identity is invalid',
    )
  } else {
    const fields = Object.fromEntries(
      names.subjectRfc2253
        .split(',')
        .map(value => value.split(/=(.*)/s).slice(0, 2)),
    )
    assert(
      fields[leaf.authorization.field] === leaf.authorization.value,
      'PEER_IDENTITY_INVALID',
      'Client subject field identity is invalid',
    )
  }

  const verifyArgs = [
    'verify',
    '-CAfile',
    caPath,
    '-purpose',
    kind === 'server' ? 'sslserver' : 'sslclient',
  ]
  if (kind === 'server')
    verifyArgs.push('-verify_hostname', leaf.authorization.value)
  verifyArgs.push(certificatePath)
  try {
    await execFileAsync('openssl', verifyArgs, { encoding: 'utf8' })
  } catch (error) {
    fail('CHAIN_UNTRUSTED', 'Leaf certificate is not trusted for its role', {
      cause: error,
    })
  }
}

export async function validateCertificateMaterial(options) {
  await validateLeaf(options)
  return { valid: true }
}

export async function validateCertificateAuthorityMaterial(options) {
  await validateCa(options)
  return { valid: true }
}

async function verifyBundleFiles(generationDir, profile) {
  for (const [role, bundle] of Object.entries(profile.runtimeBundles)) {
    const directory = path.join(generationDir, 'bundles', role)
    let actual
    try {
      actual = (await readdir(directory)).sort()
    } catch (error) {
      fail('BUNDLE_CONTENT_INVALID', `Runtime bundle ${role} is missing`, {
        cause: error,
      })
    }
    const expected = Object.keys(bundle.files).sort()
    assert(
      JSON.stringify(actual) === JSON.stringify(expected),
      'BUNDLE_CONTENT_INVALID',
      `Runtime bundle ${role} differs from its allowlist`,
    )
    for (const filename of expected) {
      const details = await stat(path.join(directory, filename))
      const expectedMode = Number.parseInt(
        filename.endsWith('.key')
          ? profile.fileModes.privateKey
          : profile.fileModes.publicCertificate,
        8,
      )
      assert(
        (details.mode & 0o777) === expectedMode,
        'FILE_MODE_INVALID',
        `${role}/${filename} has an invalid mode`,
      )
      assert(
        details.uid === bundle.owner.uid && details.gid === bundle.owner.gid,
        'FILE_OWNER_INVALID',
        `${role}/${filename} has an invalid owner`,
      )
    }
  }
  for (const [materialId, locations] of materialLocations(profile)) {
    if (locations.length < 2) continue
    const digests = new Set()
    for (const { role, filename } of locations) {
      digests.add(
        createHash('sha256')
          .update(
            await readFile(path.join(generationDir, 'bundles', role, filename)),
          )
          .digest('hex'),
      )
    }
    assert(
      digests.size === 1,
      'BUNDLE_CONTENT_INVALID',
      `${materialId} differs between permitted bundles`,
    )
  }
}

async function buildMetadata({
  generationDir,
  generationId,
  lifetime,
  profile,
  rotatedTrustDomains,
}) {
  const trustDomains = {}
  for (const [name, domain] of Object.entries(profile.trustDomains)) {
    trustDomains[name] = {
      ca: await certificateMetadata(
        domain.ca.materialId,
        firstMaterialFile(generationDir, profile, domain.ca.materialId),
      ),
      client: await certificateMetadata(
        domain.client.certificateMaterialId,
        firstMaterialFile(
          generationDir,
          profile,
          domain.client.certificateMaterialId,
        ),
      ),
      server: await certificateMetadata(
        domain.server.certificateMaterialId,
        firstMaterialFile(
          generationDir,
          profile,
          domain.server.certificateMaterialId,
        ),
      ),
      wrongClient: await certificateMetadata(
        domain.wrongClient.certificateMaterialId,
        firstMaterialFile(
          generationDir,
          profile,
          domain.wrongClient.certificateMaterialId,
        ),
      ),
      wrongServer: await certificateMetadata(
        domain.wrongServer.certificateMaterialId,
        firstMaterialFile(
          generationDir,
          profile,
          domain.wrongServer.certificateMaterialId,
        ),
      ),
    }
  }
  return {
    createdAt: new Date().toISOString(),
    generationId,
    lifetime,
    profileDigest: digestCertificateProfile(profile),
    rotatedTrustDomains,
    schemaVersion: 1,
    trustDomains,
  }
}

function validateMetadataShape(metadata, profile) {
  const allowedTopLevel = new Set(
    profile.generationMetadata.allowedTopLevelFields,
  )
  assert(
    Object.keys(metadata).every(key => allowedTopLevel.has(key)),
    'METADATA_UNSAFE',
    'Generation metadata contains an unsafe field',
  )
  const allowedCertificate = new Set(
    profile.generationMetadata.allowedCertificateFields,
  )
  for (const domain of Object.values(metadata.trustDomains ?? {})) {
    for (const certificate of Object.values(domain)) {
      assert(
        Object.keys(certificate).every(key => allowedCertificate.has(key)),
        'METADATA_UNSAFE',
        'Certificate metadata contains an unsafe field',
      )
    }
  }
  const serialized = JSON.stringify(metadata).toLowerCase()
  for (const fragment of profile.generationMetadata.forbiddenFieldFragments) {
    assert(
      !serialized.includes(`"${fragment.toLowerCase()}`),
      'METADATA_UNSAFE',
      'Metadata contains a forbidden field',
    )
  }
  assert(
    !serialized.includes('begin certificate'),
    'METADATA_UNSAFE',
    'Metadata contains certificate PEM',
  )
  assert(
    !serialized.includes('private key'),
    'METADATA_UNSAFE',
    'Metadata contains private-key material',
  )
}

export async function verifyGenerationDirectory({
  generationDir,
  now = new Date(),
  profile,
}) {
  await verifyBundleFiles(generationDir, profile)
  const metadataPath = path.join(generationDir, 'metadata.json')
  let metadata
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  } catch (error) {
    fail('METADATA_INVALID', 'Generation metadata could not be read', {
      cause: error,
    })
  }
  validateMetadataShape(metadata, profile)
  assert(
    metadata.profileDigest === digestCertificateProfile(profile),
    'PROFILE_DIGEST_MISMATCH',
    'Generation uses another certificate profile',
  )

  for (const domain of Object.values(profile.trustDomains)) {
    const caPath = firstMaterialFile(
      generationDir,
      profile,
      domain.ca.materialId,
    )
    await validateCa({ caPath, domain, now, profile })
    for (const [kind, leaf] of [
      ['server', domain.server],
      ['client', domain.client],
      ['client', domain.wrongClient],
      ['server', domain.wrongServer],
    ]) {
      await validateLeaf({
        caPath,
        certificatePath: firstMaterialFile(
          generationDir,
          profile,
          leaf.certificateMaterialId,
        ),
        keyPath: firstMaterialFile(
          generationDir,
          profile,
          leaf.privateKeyMaterialId,
        ),
        kind,
        leaf,
        now,
        profile,
      })
    }
  }
  const rebuilt = await buildMetadata({
    generationDir,
    generationId: metadata.generationId,
    lifetime: metadata.lifetime,
    profile,
    rotatedTrustDomains: metadata.rotatedTrustDomains,
  })
  rebuilt.createdAt = metadata.createdAt
  assert(
    JSON.stringify(rebuilt) === JSON.stringify(metadata),
    'METADATA_INVALID',
    'Generation metadata does not match its certificates',
  )
  return metadata
}

async function initializeGenerationDirectory(directory) {
  await mkdir(directory, { recursive: false, mode: 0o700 })
  await mkdir(path.join(directory, 'bundles'), { mode: 0o700 })
  for (const role of certificateProfileContract.runtimeRoles) {
    await mkdir(path.join(directory, 'bundles', role), { mode: 0o700 })
  }
}

export async function stageGeneration({
  issuerRoot,
  lifetime = 'persistent',
  profile,
  rootDir,
  rotateTrustDomains = certificateProfileContract.trustDomains,
  sourceGenerationId = null,
}) {
  assert(
    path.isAbsolute(rootDir),
    'OUTPUT_ROOT_INVALID',
    'Output root must be absolute',
  )
  assert(
    profile.validity[lifetime],
    'LIFETIME_INVALID',
    'Certificate lifetime is invalid',
  )
  const domainNames = [...new Set(rotateTrustDomains)]
  assert(
    domainNames.length > 0 &&
      domainNames.every(name =>
        certificateProfileContract.trustDomains.includes(name),
      ),
    'TRUST_DOMAIN_INVALID',
    'Rotation trust domain is invalid',
  )
  await assertTmpfs(issuerRoot)
  await mkdir(path.join(rootDir, 'staged'), { recursive: true, mode: 0o700 })
  await mkdir(path.join(rootDir, 'generations'), {
    recursive: true,
    mode: 0o700,
  })
  const generationId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID()}`
  const directory = generationPath(rootDir, 'staged', generationId)
  await initializeGenerationDirectory(directory)
  try {
    if (sourceGenerationId) {
      const source = generationPath(rootDir, 'generations', sourceGenerationId)
      await verifyGenerationDirectory({ generationDir: source, profile })
      for (const role of certificateProfileContract.runtimeRoles) {
        await rm(path.join(directory, 'bundles', role), { recursive: true })
        await cp(
          path.join(source, 'bundles', role),
          path.join(directory, 'bundles', role),
          {
            preserveTimestamps: true,
            recursive: true,
          },
        )
      }
    }
    for (const domainName of domainNames) {
      const result = await issueTrustDomain({
        domain: profile.trustDomains[domainName],
        domainName,
        issuerRoot,
        lifetime,
        profile,
      })
      await distributeMaterial(directory, profile, result.material)
      assert(
        (await readdir(issuerRoot)).length === 0,
        'ISSUER_KEY_RETAINED',
        'Issuer workspace was not destroyed',
      )
    }
    await secureBundles(directory, profile)
    const metadata = await buildMetadata({
      generationDir: directory,
      generationId,
      lifetime,
      profile,
      rotatedTrustDomains: domainNames,
    })
    validateMetadataShape(metadata, profile)
    await writeFile(
      path.join(directory, 'metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
      {
        mode: 0o600,
      },
    )
    await verifyGenerationDirectory({ generationDir: directory, profile })
    return metadata
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    if (error instanceof ProvisionerError) throw error
    fail('GENERATION_FAILED', 'Certificate generation failed closed', {
      cause: error,
    })
  }
}

export async function promoteGeneration({ generationId, profile, rootDir }) {
  const staged = generationPath(rootDir, 'staged', generationId)
  await verifyGenerationDirectory({ generationDir: staged, profile })
  const selection = await readSelection(rootDir, { optional: true })
  assert(
    !selection.previous,
    'PENDING_FINALIZATION',
    'Finalize or roll back the prior promotion first',
  )
  const promoted = generationPath(rootDir, 'generations', generationId)
  try {
    await rename(staged, promoted)
  } catch (error) {
    fail('PROMOTION_FAILED', 'Staged generation could not be promoted', {
      cause: error,
    })
  }
  const nextSelection = { current: generationId, previous: selection.current }
  try {
    await writeSelection(rootDir, nextSelection)
  } catch (error) {
    await rename(promoted, staged)
    throw error
  }
  return { generationId, previousGenerationId: selection.current }
}

export async function inspectGeneration({ profile, rootDir }) {
  const selection = await readSelection(rootDir, { optional: true })
  const result = { current: null, previous: null, selection }
  for (const key of ['current', 'previous']) {
    const generationId = selection[key]
    if (!generationId) continue
    const metadata = await verifyGenerationDirectory({
      generationDir: generationPath(rootDir, 'generations', generationId),
      profile,
    })
    result[key] = metadata
  }
  return result
}

/**
 * Copy the selected immutable generation into four separately mounted runtime
 * volumes. Orchestration must stop affected services before calling this for
 * rotation; runtime containers mount only one role directory read-only.
 */
export async function materializeSelectedGeneration({
  includeProbes = false,
  profile,
  rootDir,
  runtimeRoot,
}) {
  assert(
    path.isAbsolute(runtimeRoot),
    'RUNTIME_ROOT_INVALID',
    'Runtime material root must be absolute',
  )
  const selection = await readSelection(rootDir)
  assert(
    typeof selection.current === 'string' && selection.current.length > 0,
    'SELECTION_INVALID',
    'No generation was selected',
  )
  const generationDir = generationPath(
    rootDir,
    'generations',
    selection.current,
  )
  await verifyGenerationDirectory({ generationDir, profile })
  const roles = Object.keys(profile.runtimeBundles).filter(
    role => role !== 'probe' || includeProbes,
  )
  for (const role of roles) {
    const target = path.join(runtimeRoot, role)
    await mkdir(target, { mode: 0o700, recursive: true })
    await setRuntimeDirectorySecurity(
      target,
      profile.runtimeBundles[role].owner,
    )
    for (const existing of await readdir(target)) {
      await rm(path.join(target, existing), { force: true, recursive: true })
    }
    for (const filename of Object.keys(profile.runtimeBundles[role].files)) {
      const runtimeFile = path.join(target, filename)
      await cp(
        path.join(generationDir, 'bundles', role, filename),
        runtimeFile,
        { force: false },
      )
      await setRuntimeFileSecurity(
        runtimeFile,
        filename,
        profile.runtimeBundles[role].owner,
        profile,
      )
    }
  }
  return {
    generationId: selection.current,
    roles,
  }
}

export function generationNeedsRenewal(metadata, profile, lifetime, now) {
  if (lifetime === 'ephemeral') return false
  const threshold =
    now.getTime() + profile.validity.renewalThresholdDays * 86_400_000
  return Object.values(metadata.trustDomains).some(domain =>
    Object.values(domain).some(
      certificate => new Date(certificate.notAfter).getTime() <= threshold,
    ),
  )
}

export async function ensureGeneration({
  issuerRoot,
  lifetime = 'persistent',
  now = new Date(),
  profile,
  rootDir,
}) {
  await mkdir(rootDir, { recursive: true, mode: 0o700 })
  const selection = await readSelection(rootDir, { optional: true })
  if (selection.current) {
    try {
      const metadata = await verifyGenerationDirectory({
        generationDir: generationPath(
          rootDir,
          'generations',
          selection.current,
        ),
        now,
        profile,
      })
      if (!generationNeedsRenewal(metadata, profile, lifetime, now)) {
        return { action: 'reused', generationId: selection.current }
      }
    } catch (error) {
      if (!(error instanceof ProvisionerError)) throw error
    }
    assert(
      !selection.previous,
      'PENDING_FINALIZATION',
      'Cannot replace an invalid generation while a prior promotion is pending',
    )
  }
  const staged = await stageGeneration({
    issuerRoot,
    lifetime,
    profile,
    rootDir,
  })
  const promoted = await promoteGeneration({
    generationId: staged.generationId,
    profile,
    rootDir,
  })
  return { action: 'promoted', ...promoted }
}

export async function rotateTrustDomain({
  issuerRoot,
  lifetime = 'persistent',
  profile,
  rootDir,
  trustDomain,
}) {
  assert(
    certificateProfileContract.trustDomains.includes(trustDomain),
    'TRUST_DOMAIN_INVALID',
    'Rotation trust domain is invalid',
  )
  const selection = await readSelection(rootDir)
  assert(
    selection.current,
    'SELECTION_INVALID',
    'No current generation is selected',
  )
  assert(
    !selection.previous,
    'PENDING_FINALIZATION',
    'Finalize or roll back the prior promotion first',
  )
  const staged = await stageGeneration({
    issuerRoot,
    lifetime,
    profile,
    rootDir,
    rotateTrustDomains: [trustDomain],
    sourceGenerationId: selection.current,
  })
  return promoteGeneration({
    generationId: staged.generationId,
    profile,
    rootDir,
  })
}

export async function rollbackGeneration({ profile, rootDir }) {
  const selection = await readSelection(rootDir)
  assert(
    selection.current && selection.previous,
    'ROLLBACK_UNAVAILABLE',
    'No prior generation is available',
  )
  await verifyGenerationDirectory({
    generationDir: generationPath(rootDir, 'generations', selection.previous),
    profile,
  })
  const failedGenerationId = selection.current
  await writeSelection(rootDir, { current: selection.previous, previous: null })
  await rm(generationPath(rootDir, 'generations', failedGenerationId), {
    force: true,
    recursive: true,
  })
  return {
    deletedGenerationId: failedGenerationId,
    generationId: selection.previous,
  }
}

export async function finalizeGeneration({
  expectedGenerationId,
  profile,
  rootDir,
}) {
  assert(
    typeof expectedGenerationId === 'string' && expectedGenerationId.length > 0,
    'ARGUMENT_INVALID',
    'Authenticated generation ID is required for finalization',
  )
  const selection = await readSelection(rootDir)
  assert(
    selection.current,
    'SELECTION_INVALID',
    'No current generation is selected',
  )
  assert(
    selection.current === expectedGenerationId,
    'SELECTION_INVALID',
    'Selected generation does not match the authenticated generation',
  )
  await verifyGenerationDirectory({
    generationDir: generationPath(rootDir, 'generations', selection.current),
    profile,
  })
  if (!selection.previous) {
    return { deletedGenerationId: null, generationId: selection.current }
  }
  await rm(generationPath(rootDir, 'generations', selection.previous), {
    force: true,
    recursive: true,
  })
  await writeSelection(rootDir, { current: selection.current, previous: null })
  return {
    deletedGenerationId: selection.previous,
    generationId: selection.current,
  }
}
