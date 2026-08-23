import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { fail } from './errors.mjs'

const TRUST_DOMAIN_NAMES = ['app-to-kong', 'kong-to-adapter', 'adapter-to-hsa']
const RUNTIME_ROLES = ['app', 'kong', 'adapter', 'mock', 'probe']
const PRIVATE_KEY_PATTERN = /-private-key$/
const CERTIFICATE_PATTERN = /-(?:certificate|ca)$/

function assert(condition, message) {
  if (!condition) fail('PROFILE_INVALID', message)
}

function assertExactKeys(value, expected, location) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    `${location} must be an object`,
  )
  assert(
    JSON.stringify(Object.keys(value)) === JSON.stringify(expected),
    `${location} must define exactly ${expected.join(', ')}`,
  )
}

function assertLeaf(leaf, kind, roles, materialIds, location) {
  assert(roles.has(leaf.runtimeRole), `${location}.runtimeRole is unknown`)
  assert(
    typeof leaf.certificateMaterialId === 'string',
    `${location} certificate material is required`,
  )
  assert(
    typeof leaf.privateKeyMaterialId === 'string',
    `${location} private-key material is required`,
  )
  assert(
    !materialIds.has(leaf.certificateMaterialId),
    `${location} certificate material must be unique`,
  )
  materialIds.add(leaf.certificateMaterialId)
  assert(
    !materialIds.has(leaf.privateKeyMaterialId),
    `${location} private-key material must be unique`,
  )
  materialIds.add(leaf.privateKeyMaterialId)
  assert(
    typeof leaf.subjectRfc2253 === 'string' && leaf.subjectRfc2253.length > 0,
    `${location} subject is required`,
  )
  assert(
    leaf.basicConstraints?.critical === true,
    `${location} basic constraints must be critical`,
  )
  assert(
    leaf.basicConstraints?.ca === false,
    `${location} must be a non-CA leaf`,
  )
  assert(
    leaf.keyUsage?.critical === true,
    `${location} key usage must be critical`,
  )
  const expectedUsage =
    kind === 'server'
      ? ['digitalSignature', 'keyEncipherment']
      : ['digitalSignature']
  assert(
    JSON.stringify(leaf.keyUsage.values) === JSON.stringify(expectedUsage),
    `${location} key usage is not role-appropriate`,
  )
  assert(
    JSON.stringify(leaf.extendedKeyUsage) === JSON.stringify([`${kind}Auth`]),
    `${location} must have one ${kind}Auth EKU`,
  )
  if (kind === 'server') {
    assert(
      Array.isArray(leaf.dnsSans) && leaf.dnsSans.length === 1,
      `${location} must have one DNS SAN`,
    )
    assert(
      !leaf.dnsSans[0].includes('*'),
      `${location} wildcard DNS SAN is forbidden`,
    )
    assert(
      leaf.dnsSans[0] !== 'localhost',
      `${location} localhost DNS SAN is forbidden`,
    )
    assert(
      leaf.authorization?.type === 'dns-san',
      `${location} must authorize a DNS SAN`,
    )
    assert(
      leaf.authorization.value === leaf.dnsSans[0],
      `${location} authorization must match its only DNS SAN`,
    )
    assert(
      leaf.authorization.allowWildcard === false,
      `${location} wildcard authorization is forbidden`,
    )
    assert(
      leaf.authorization.allowCommonNameFallback === false,
      `${location} common-name fallback is forbidden`,
    )
  } else {
    assert(
      Array.isArray(leaf.dnsSans) && leaf.dnsSans.length === 0,
      `${location} client must not have DNS SANs`,
    )
    assert(
      ['subject-rfc2253', 'subject-field'].includes(leaf.authorization?.type),
      `${location} client authorization is invalid`,
    )
  }
}

function validateProfile(profile) {
  assert(profile.schemaVersion === 1, 'schemaVersion must be 1')
  assert(
    profile.profileName === 'kravhantering-hsa-test-pki',
    'profileName is invalid',
  )
  assert(
    profile.runtimeMountPath === '/run/kravhantering/hsa-mtls',
    'runtime mount path is invalid',
  )
  assert(
    profile.algorithms?.ca?.keyAlgorithm === 'RSA',
    'CA algorithm must be RSA',
  )
  assert(profile.algorithms.ca.keyBits === 4096, 'CA keys must be RSA-4096')
  assert(
    profile.algorithms?.leaf?.keyAlgorithm === 'RSA',
    'leaf algorithm must be RSA',
  )
  assert(profile.algorithms.leaf.keyBits === 2048, 'leaf keys must be RSA-2048')
  assert(
    profile.algorithms.signature === 'sha256WithRSAEncryption',
    'signature must be SHA-256 with RSA',
  )
  assert(
    profile.validity?.persistent?.caDays === 425,
    'persistent CA validity must be 425 days',
  )
  assert(
    profile.validity.persistent.leafDays === 397,
    'persistent leaf validity must be 397 days',
  )
  assert(
    profile.validity?.ephemeral?.caDays === 7,
    'ephemeral CA validity must be seven days',
  )
  assert(
    profile.validity.ephemeral.leafDays === 7,
    'ephemeral leaf validity must be seven days',
  )
  assert(
    profile.validity.renewalThresholdDays === 30,
    'renewal threshold must be 30 days',
  )
  assert(
    profile.fileModes?.privateKey === '0400',
    'private keys must use mode 0400',
  )
  assert(
    profile.fileModes?.publicCertificate === '0444',
    'certificates must use mode 0444',
  )
  assertExactKeys(profile.trustDomains, TRUST_DOMAIN_NAMES, 'trustDomains')
  assertExactKeys(profile.runtimeBundles, RUNTIME_ROLES, 'runtimeBundles')

  const roles = new Set(RUNTIME_ROLES)
  const materialIds = new Set()
  const materialOwners = new Map()
  for (const [name, domain] of Object.entries(profile.trustDomains)) {
    const location = `trustDomains.${name}`
    assert(
      domain.ca?.basicConstraints?.critical === true,
      `${location} CA constraints must be critical`,
    )
    assert(
      domain.ca.basicConstraints.ca === true,
      `${location} CA must be a CA`,
    )
    assert(
      domain.ca.basicConstraints.pathLength === 0,
      `${location} CA path length must be zero`,
    )
    assert(
      domain.ca.keyUsage?.critical === true,
      `${location} CA key usage must be critical`,
    )
    assert(
      JSON.stringify(domain.ca.keyUsage.values) ===
        JSON.stringify(['keyCertSign', 'cRLSign']),
      `${location} CA usage must be certificate and CRL signing`,
    )
    assert(
      !materialIds.has(domain.ca.materialId),
      `${location} CA material must be unique`,
    )
    materialIds.add(domain.ca.materialId)
    materialOwners.set(domain.ca.materialId, null)
    assertLeaf(
      domain.server,
      'server',
      roles,
      materialIds,
      `${location}.server`,
    )
    assertLeaf(
      domain.client,
      'client',
      roles,
      materialIds,
      `${location}.client`,
    )
    assertLeaf(
      domain.wrongClient,
      'client',
      roles,
      materialIds,
      `${location}.wrongClient`,
    )
    assertLeaf(
      domain.wrongServer,
      'server',
      roles,
      materialIds,
      `${location}.wrongServer`,
    )
    materialOwners.set(
      domain.server.certificateMaterialId,
      domain.server.runtimeRole,
    )
    materialOwners.set(
      domain.server.privateKeyMaterialId,
      domain.server.runtimeRole,
    )
    materialOwners.set(
      domain.client.certificateMaterialId,
      domain.client.runtimeRole,
    )
    materialOwners.set(
      domain.client.privateKeyMaterialId,
      domain.client.runtimeRole,
    )
    materialOwners.set(
      domain.wrongClient.certificateMaterialId,
      domain.wrongClient.runtimeRole,
    )
    materialOwners.set(
      domain.wrongClient.privateKeyMaterialId,
      domain.wrongClient.runtimeRole,
    )
    materialOwners.set(
      domain.wrongServer.certificateMaterialId,
      domain.wrongServer.runtimeRole,
    )
    materialOwners.set(
      domain.wrongServer.privateKeyMaterialId,
      domain.wrongServer.runtimeRole,
    )
  }

  const bundledMaterials = new Map([...materialIds].map(id => [id, 0]))
  for (const [role, bundle] of Object.entries(profile.runtimeBundles)) {
    assert(
      Number.isInteger(bundle.owner?.uid) && bundle.owner.uid >= 0,
      `${role} UID is invalid`,
    )
    assert(
      Number.isInteger(bundle.owner?.gid) && bundle.owner.gid >= 0,
      `${role} GID is invalid`,
    )
    assert(
      bundle.files && typeof bundle.files === 'object',
      `${role} bundle files are required`,
    )
    for (const [filename, materialId] of Object.entries(bundle.files)) {
      assert(
        /^[a-z][a-z0-9-]*\.(?:crt|key)$/.test(filename),
        `${role} bundle filename is invalid`,
      )
      assert(
        materialIds.has(materialId),
        `${role} bundle references unknown material`,
      )
      assert(
        (filename.endsWith('.key') && PRIVATE_KEY_PATTERN.test(materialId)) ||
          (filename.endsWith('.crt') && CERTIFICATE_PATTERN.test(materialId)),
        `${role} bundle filename and material type differ`,
      )
      const owner = materialOwners.get(materialId)
      assert(
        owner === null || owner === role,
        `${role} receives another runtime role's private material`,
      )
      bundledMaterials.set(materialId, bundledMaterials.get(materialId) + 1)
    }
  }
  for (const [materialId, count] of bundledMaterials) {
    assert(count > 0, `${materialId} is not distributed`)
    if (PRIVATE_KEY_PATTERN.test(materialId)) {
      assert(
        count === 1,
        `${materialId} must appear in exactly one runtime bundle`,
      )
    }
  }

  const metadata = profile.generationMetadata
  assert(
    metadata?.allowedTopLevelFields?.includes('profileDigest'),
    'safe metadata must include profileDigest',
  )
  assert(
    metadata.allowedCertificateFields?.includes('digestSha256'),
    'safe metadata must include certificate digests',
  )
  assert(
    metadata.forbiddenFieldFragments?.some(
      value => value.toLowerCase() === 'privatekey',
    ),
    'safe metadata must forbid private-key fields',
  )
  return profile
}

export async function loadCertificateProfile(profilePath, { rawProfile } = {}) {
  let profile = rawProfile
  try {
    profile ??= JSON.parse(await readFile(profilePath, 'utf8'))
  } catch (error) {
    fail('PROFILE_INVALID', 'Certificate profile could not be read', {
      cause: error,
    })
  }
  return validateProfile(structuredClone(profile))
}

export function digestCertificateProfile(profile) {
  return createHash('sha256').update(JSON.stringify(profile)).digest('hex')
}

export const certificateProfileContract = Object.freeze({
  runtimeRoles: RUNTIME_ROLES,
  trustDomains: TRUST_DOMAIN_NAMES,
})
