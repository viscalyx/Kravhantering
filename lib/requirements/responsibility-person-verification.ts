import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getAuthConfig } from '@/lib/auth/config'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import { getRequirementResponsibilityPerson } from '@/lib/dal/requirement-responsibility-people'
import { lookupHsaPersonStrict } from '@/lib/hsa/strict-person-lookup'
import type { ActorContext } from '@/lib/requirements/auth'
import { validationError } from '@/lib/requirements/errors'
import {
  formatRequirementResponsibilityPersonName,
  type RequirementResponsibilityPersonRecord,
} from '@/lib/requirements/responsibility-person'
import {
  REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES,
  type RequirementResponsibilityPersonVerificationPurpose,
} from '@/lib/requirements/responsibility-person-verification-contract'
import {
  createRequirementResponsibilityPersonActorFingerprint,
  createRequirementResponsibilityPersonTargetFingerprint,
} from '@/lib/requirements/responsibility-person-verification-fingerprint.mjs'

export {
  REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES,
  type RequirementResponsibilityPersonVerificationPurpose,
} from '@/lib/requirements/responsibility-person-verification-contract'

export type RequirementResponsibilityPersonVerificationMode =
  | 'refresh'
  | 'reuse_local'

export interface RequirementResponsibilityPersonVerificationPayload
  extends RequirementResponsibilityPersonRecord {
  displayName: string
}

export interface RequirementResponsibilityPersonVerificationEvidence {
  evidence: string
  expiresAt: string
}

interface VerificationActor {
  hsaId: string | null
  id: string | null
  source: ActorContext['source']
}

interface CreateVerificationEvidenceInput {
  actor: VerificationActor
  person: RequirementResponsibilityPersonRecord
  purpose: RequirementResponsibilityPersonVerificationPurpose
  scopeId?: number
}

export interface ResolveVerifiedPersonInput {
  actor: VerificationActor
  hsaId: string
  purpose: RequirementResponsibilityPersonVerificationPurpose
  scopeId?: number
}

interface VerificationEvidenceOptions {
  now?: Date
  secret?: string
  ttlSeconds?: number
}

interface QueryExecutor {
  query(sql: string, parameters?: unknown[]): Promise<unknown>
}

const EVIDENCE_VERSION = 1
const DEFAULT_EVIDENCE_TTL_SECONDS = 300
const MAX_EVIDENCE_TTL_SECONDS = 600
export const REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_EVIDENCE_MAX_LENGTH = 4096
const EVIDENCE_KEY_CONTEXT = 'kravhantering:hsa-verification-evidence:v1'

const actorSchema = z
  .object({
    hsaId: z.string().max(HSA_ID_MAX_LENGTH).nullable(),
    id: z.string().max(255).nullable(),
    source: z.enum(['anonymous', 'oidc', 'mcp']),
  })
  .strict()

const personSchema = z
  .object({
    email: z.string().max(320).nullable(),
    givenName: z.string().max(255),
    hasProtectedPersonalData: z.boolean(),
    hsaId: z.string().max(HSA_ID_MAX_LENGTH).refine(isHsaId),
    middleName: z.string().max(255).nullable(),
    surname: z.string().max(255).nullable(),
  })
  .strict()

const evidencePayloadSchema = z
  .object({
    actor: actorSchema,
    expiresAt: z.number().int().positive(),
    issuedAt: z.number().int().positive(),
    person: personSchema,
    purpose: z.enum(REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES),
    scopeId: z.number().int().positive().nullable(),
    version: z.literal(EVIDENCE_VERSION),
  })
  .strict()

type EvidencePayload = z.infer<typeof evidencePayloadSchema>

function verificationEvidenceError(): never {
  throw validationError('Verification evidence is invalid or expired', {
    reason: 'requirement_responsibility_person_evidence_invalid',
  })
}

function assertValidNormalizedHsaId(normalizedHsaId: string): void {
  if (isHsaId(normalizedHsaId)) return
  throw validationError('Expected a valid HSA-id', {
    reason: 'invalid_hsa_id',
  })
}

function evidenceSecret(options: VerificationEvidenceOptions): string {
  const secret = options.secret ?? getAuthConfig().cookiePassword
  if (secret.length < 32) {
    throw new Error(
      'HSA verification evidence secret must be at least 32 characters',
    )
  }
  return secret
}

function derivedKey(secret: string, context: string): Buffer {
  return createHash('sha256')
    .update(context)
    .update('\0')
    .update(secret)
    .digest()
}

function signPayload(payloadSegment: string, secret: string): string {
  return createHmac('sha256', derivedKey(secret, EVIDENCE_KEY_CONTEXT))
    .update(payloadSegment)
    .digest('base64url')
}

function signaturesMatch(actual: string, expected: string): boolean {
  try {
    const actualBuffer = Buffer.from(actual, 'base64url')
    const expectedBuffer = Buffer.from(expected, 'base64url')
    return (
      actualBuffer.toString('base64url') === actual &&
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    )
  } catch {
    return false
  }
}

function normalizedActor(actor: VerificationActor): VerificationActor {
  return {
    hsaId: actor.hsaId?.trim() || null,
    id: actor.id?.trim() || null,
    source: actor.source,
  }
}

function sameActor(left: VerificationActor, right: VerificationActor): boolean {
  return (
    left.source === right.source &&
    left.id === right.id &&
    left.hsaId === right.hsaId
  )
}

function parseEvidence(
  evidence: string,
  options: VerificationEvidenceOptions,
): EvidencePayload {
  if (
    !evidence ||
    evidence.length >
      REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_EVIDENCE_MAX_LENGTH
  ) {
    return verificationEvidenceError()
  }
  const segments = evidence.split('.')
  if (segments.length !== 2) return verificationEvidenceError()
  const [payloadSegment, signature] = segments
  if (!payloadSegment || !signature) return verificationEvidenceError()

  const expectedSignature = signPayload(payloadSegment, evidenceSecret(options))
  if (!signaturesMatch(signature, expectedSignature)) {
    return verificationEvidenceError()
  }

  try {
    const decoded = Buffer.from(payloadSegment, 'base64url').toString('utf8')
    if (Buffer.from(decoded).toString('base64url') !== payloadSegment) {
      return verificationEvidenceError()
    }
    return evidencePayloadSchema.parse(JSON.parse(decoded))
  } catch {
    return verificationEvidenceError()
  }
}

export function requirementResponsibilityPersonTargetFingerprint(
  hsaId: string,
  options: Pick<VerificationEvidenceOptions, 'secret'> = {},
): string {
  const normalizedHsaId = hsaId.trim()
  assertValidNormalizedHsaId(normalizedHsaId)
  return createRequirementResponsibilityPersonTargetFingerprint(
    normalizedHsaId,
    evidenceSecret(options),
  )
}

export function requirementResponsibilityPersonActorFingerprint(
  actor: VerificationActor,
  options: Pick<VerificationEvidenceOptions, 'secret'> = {},
): string {
  return createRequirementResponsibilityPersonActorFingerprint(
    normalizedActor(actor),
    evidenceSecret(options),
  )
}

export function createRequirementResponsibilityPersonVerificationEvidence(
  input: CreateVerificationEvidenceInput,
  options: VerificationEvidenceOptions = {},
): RequirementResponsibilityPersonVerificationEvidence {
  const now = options.now ?? new Date()
  const issuedAt = Math.floor(now.getTime() / 1000)
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_EVIDENCE_TTL_SECONDS
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > MAX_EVIDENCE_TTL_SECONDS
  ) {
    throw new Error('Invalid HSA verification evidence TTL')
  }
  const payload = evidencePayloadSchema.parse({
    actor: normalizedActor(input.actor),
    expiresAt: issuedAt + ttlSeconds,
    issuedAt,
    person: {
      email: input.person.email,
      givenName: input.person.givenName,
      hasProtectedPersonalData: input.person.hasProtectedPersonalData ?? false,
      hsaId: input.person.hsaId.trim(),
      middleName: input.person.middleName,
      surname: input.person.surname,
    },
    purpose: input.purpose,
    scopeId: input.scopeId ?? null,
    version: EVIDENCE_VERSION,
  })
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  )
  const evidence = `${payloadSegment}.${signPayload(
    payloadSegment,
    evidenceSecret(options),
  )}`
  if (
    evidence.length >
    REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_EVIDENCE_MAX_LENGTH
  ) {
    throw new Error('HSA verification evidence exceeds its size limit')
  }
  return {
    evidence,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
  }
}

export function toRequirementResponsibilityPersonVerificationPayload(
  person: RequirementResponsibilityPersonRecord,
): RequirementResponsibilityPersonVerificationPayload {
  return {
    ...person,
    displayName: formatRequirementResponsibilityPersonName(person),
    hasProtectedPersonalData: person.hasProtectedPersonalData ?? false,
  }
}

export async function verifyRequirementResponsibilityPerson(
  db: QueryExecutor,
  hsaId: string,
  mode: RequirementResponsibilityPersonVerificationMode,
): Promise<RequirementResponsibilityPersonRecord> {
  const normalizedHsaId = hsaId.trim()
  assertValidNormalizedHsaId(normalizedHsaId)

  if (mode === 'reuse_local') {
    const existing = await getRequirementResponsibilityPerson(
      db,
      normalizedHsaId,
    )
    if (existing) return existing
  }

  return lookupHsaPersonStrict(normalizedHsaId)
}

export function requirementResponsibilityPersonFromActor(
  actor: Pick<
    ActorContext,
    | 'displayName'
    | 'email'
    | 'familyName'
    | 'givenName'
    | 'hsaId'
    | 'isAuthenticated'
  >,
): RequirementResponsibilityPersonRecord {
  const hsaId = actor.hsaId?.trim() ?? ''
  assertValidNormalizedHsaId(hsaId)
  if (!actor.isAuthenticated) {
    throw validationError('Authenticated actor is required', {
      reason: 'missing_actor_hsa_id',
    })
  }
  return {
    email: actor.email?.trim() || null,
    givenName: actor.givenName?.trim() || actor.displayName.trim() || hsaId,
    hsaId,
    middleName: null,
    surname: actor.familyName?.trim() || null,
  }
}

export function resolveVerifiedRequirementResponsibilityPerson(
  evidence: string,
  expected: ResolveVerifiedPersonInput,
  options: VerificationEvidenceOptions = {},
): RequirementResponsibilityPersonRecord {
  const normalizedHsaId = expected.hsaId.trim()
  assertValidNormalizedHsaId(normalizedHsaId)
  const payload = parseEvidence(evidence, options)
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000)
  const expectedScopeId = expected.scopeId ?? null
  if (
    payload.expiresAt <= now ||
    payload.issuedAt > now + 30 ||
    payload.expiresAt - payload.issuedAt > MAX_EVIDENCE_TTL_SECONDS ||
    !sameActor(payload.actor, normalizedActor(expected.actor)) ||
    payload.person.hsaId !== normalizedHsaId ||
    payload.purpose !== expected.purpose ||
    payload.scopeId !== expectedScopeId
  ) {
    return verificationEvidenceError()
  }
  return payload.person
}

export function resolveVerifiedRequirementResponsibilityPeople(
  evidence: string[],
  expected: Omit<ResolveVerifiedPersonInput, 'hsaId'> & { hsaIds: string[] },
  options: VerificationEvidenceOptions = {},
): RequirementResponsibilityPersonRecord[] {
  const expectedHsaIds = new Set(expected.hsaIds.map(hsaId => hsaId.trim()))
  const people = evidence.map(item => {
    const payload = parseEvidence(item, options)
    if (!expectedHsaIds.has(payload.person.hsaId)) {
      return verificationEvidenceError()
    }
    return resolveVerifiedRequirementResponsibilityPerson(
      item,
      { ...expected, hsaId: payload.person.hsaId },
      options,
    )
  })
  if (new Set(people.map(person => person.hsaId)).size !== people.length) {
    return verificationEvidenceError()
  }
  return people
}
