import {
  getRequirementResponsibilityPerson,
  upsertRequirementResponsibilityPerson,
} from '@/lib/dal/requirement-responsibility-people'
import type { SqlServerDatabase } from '@/lib/db'
import { lookupHsaPerson } from '@/lib/hsa/person-lookup'
import { validationError } from '@/lib/requirements/errors'
import {
  formatRequirementResponsibilityPersonName,
  type RequirementResponsibilityPersonRecord,
} from '@/lib/requirements/responsibility-person'

export type RequirementResponsibilityPersonVerificationMode =
  | 'refresh'
  | 'reuse_local'

const DEFAULT_VERIFIED_PERSON_RETRY_DELAY_MS = 1000

export interface RequirementResponsibilityPersonVerificationPayload
  extends RequirementResponsibilityPersonRecord {
  displayName: string
}

interface ResolveVerifiedPersonOptions {
  retryDelayMs?: number
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function toRequirementResponsibilityPersonVerificationPayload(
  person: RequirementResponsibilityPersonRecord,
): RequirementResponsibilityPersonVerificationPayload {
  return {
    ...person,
    displayName: formatRequirementResponsibilityPersonName(person),
  }
}

export async function verifyRequirementResponsibilityPerson(
  db: SqlServerDatabase,
  hsaId: string,
  mode: RequirementResponsibilityPersonVerificationMode,
): Promise<RequirementResponsibilityPersonRecord> {
  const normalizedHsaId = hsaId.trim()

  if (mode === 'reuse_local') {
    const existing = await getRequirementResponsibilityPerson(
      db,
      normalizedHsaId,
    )
    if (existing) return existing
  }

  const person = await lookupHsaPerson(normalizedHsaId)
  await upsertRequirementResponsibilityPerson(db, person)
  return person
}

export async function resolveVerifiedRequirementResponsibilityPerson(
  db: SqlServerDatabase,
  hsaId: string,
  options: ResolveVerifiedPersonOptions = {},
): Promise<RequirementResponsibilityPersonRecord> {
  const normalizedHsaId = hsaId.trim()
  const firstRead = await getRequirementResponsibilityPerson(
    db,
    normalizedHsaId,
  )
  if (firstRead) return firstRead

  await sleep(options.retryDelayMs ?? DEFAULT_VERIFIED_PERSON_RETRY_DELAY_MS)

  const secondRead = await getRequirementResponsibilityPerson(
    db,
    normalizedHsaId,
  )
  if (secondRead) return secondRead

  throw validationError(
    'HSA-ID is not verified. Verify that the HSA-ID is valid and that the requirement responsibility person could be fetched.',
    {
      httpStatus: 422,
      reason: 'requirement_responsibility_person_not_verified',
    },
  )
}

export async function resolveVerifiedRequirementResponsibilityPeople(
  db: SqlServerDatabase,
  hsaIds: string[],
  options: ResolveVerifiedPersonOptions = {},
): Promise<RequirementResponsibilityPersonRecord[]> {
  return Promise.all(
    hsaIds.map(hsaId =>
      resolveVerifiedRequirementResponsibilityPerson(db, hsaId, options),
    ),
  )
}
