import { createHash, createHmac } from 'node:crypto'

const ACTOR_FINGERPRINT_KEY_CONTEXT = 'kravhantering:hsa-actor-fingerprint:v1'
const TARGET_FINGERPRINT_KEY_CONTEXT = 'kravhantering:hsa-target-fingerprint:v1'

function derivedKey(secret, context) {
  return createHash('sha256')
    .update(context)
    .update('\0')
    .update(secret)
    .digest()
}

export function createRequirementResponsibilityPersonActorFingerprint(
  actor,
  secret,
) {
  const digest = createHmac(
    'sha256',
    derivedKey(secret, ACTOR_FINGERPRINT_KEY_CONTEXT),
  )
    .update(JSON.stringify(actor))
    .digest('base64url')
    .slice(0, 22)
  return `afp_${digest}`
}

export function createRequirementResponsibilityPersonTargetFingerprint(
  normalizedHsaId,
  secret,
) {
  const digest = createHmac(
    'sha256',
    derivedKey(secret, TARGET_FINGERPRINT_KEY_CONTEXT),
  )
    .update(normalizedHsaId.toLowerCase())
    .digest('base64url')
    .slice(0, 22)
  return `hfp_${digest}`
}
