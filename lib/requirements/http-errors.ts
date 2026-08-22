import {
  AI_ADMIN_BLOCKER_CODES,
  AI_ADMIN_BLOCKER_FIELDS,
  type AiAdminBlocker,
  type AiAdminBlockerCode,
  type AiAdminBlockerField,
} from '@/lib/ai/admin-blockers'
import {
  AI_RUN_PROFILE_KEYS,
  type AiRunProfileKey,
} from '@/lib/ai/profile-resolver'
import {
  internalError,
  isRequirementsServiceError,
  type RequirementsErrorCode,
} from '@/lib/requirements/errors'

export interface HttpErrorPayload {
  body: {
    code: RequirementsErrorCode
    details?: SafeHttpErrorDetails
    error: string
  }
  status: number
}

export interface HttpErrorPayloadOptions {
  safeDetails?: 'ai_admin_blockers' | 'ai_admin_model_dependencies'
}

interface SafeStaleEditHttpDetails {
  latest: {
    uniqueId: string
    versionNumber: number | null
  } | null
  reason: 'stale_requirement_edit'
}

interface SafeAiAdminBlockerHttpDetails {
  blockers: AiAdminBlocker[]
}

interface SafeAiAdminModelDependencyHttpDetails {
  profileKeys: AiRunProfileKey[]
  runCount: number
}

const SAFE_NORM_REFERENCE_ID_CONFLICT_REASONS = [
  'norm_reference_id_exists',
  'norm_reference_id_generation_exhausted',
] as const

type SafeNormReferenceIdConflictReason =
  (typeof SAFE_NORM_REFERENCE_ID_CONFLICT_REASONS)[number]

interface SafeNormReferenceIdConflictHttpDetails {
  reason: SafeNormReferenceIdConflictReason
}

const SAFE_RFI_QUESTION_SUGGESTION_CONFLICT_REASONS = [
  'rfi_question_suggestion_review_already_requested',
  'rfi_question_suggestion_review_required',
  'rfi_question_suggestion_already_resolved',
  'rfi_question_suggestion_not_draft',
] as const

const SAFE_IMPROVEMENT_SUGGESTION_CONFLICT_REASONS = [
  'improvement_suggestion_already_draft',
  'improvement_suggestion_already_resolved',
  'improvement_suggestion_not_draft',
  'improvement_suggestion_review_already_requested',
  'improvement_suggestion_review_required',
] as const

type SafeImprovementSuggestionConflictReason =
  (typeof SAFE_IMPROVEMENT_SUGGESTION_CONFLICT_REASONS)[number]

interface SafeImprovementSuggestionConflictHttpDetails {
  reason: SafeImprovementSuggestionConflictReason
}

type SafeRfiQuestionSuggestionConflictReason =
  (typeof SAFE_RFI_QUESTION_SUGGESTION_CONFLICT_REASONS)[number]

interface SafeRfiQuestionSuggestionConflictHttpDetails {
  reason: SafeRfiQuestionSuggestionConflictReason
}

const SAFE_PRIVACY_ERASURE_REASONS = [
  'owner_area_references_blocking',
  'owner_references_blocking',
  'replacement_required',
  'unsupported_owner_action',
  'unsupported_privacy_action',
] as const

type SafePrivacyErasureReason = (typeof SAFE_PRIVACY_ERASURE_REASONS)[number]

interface SafePrivacyErasureHttpDetails {
  groupKey: string
  reason: SafePrivacyErasureReason
}

type SafeHttpErrorDetails =
  | SafeAiAdminBlockerHttpDetails
  | SafeAiAdminModelDependencyHttpDetails
  | SafeImprovementSuggestionConflictHttpDetails
  | SafeNormReferenceIdConflictHttpDetails
  | SafePrivacyErasureHttpDetails
  | SafeRfiQuestionSuggestionConflictHttpDetails
  | SafeStaleEditHttpDetails

function toSafeAiAdminBlockers(value: unknown): AiAdminBlocker[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    return null
  }

  const blockers: AiAdminBlocker[] = []
  for (const valueBlocker of value) {
    if (!valueBlocker || typeof valueBlocker !== 'object') return null
    const blocker = valueBlocker as { code?: unknown; field?: unknown }
    if (
      !AI_ADMIN_BLOCKER_CODES.includes(blocker.code as AiAdminBlockerCode) ||
      (blocker.field !== undefined &&
        !AI_ADMIN_BLOCKER_FIELDS.includes(blocker.field as AiAdminBlockerField))
    ) {
      return null
    }
    blockers.push({
      code: blocker.code as AiAdminBlockerCode,
      ...(blocker.field === undefined
        ? {}
        : { field: blocker.field as AiAdminBlockerField }),
    })
  }
  return blockers
}

function toSafeAiAdminModelDependencies(
  details: Record<string, unknown> | undefined,
): SafeAiAdminModelDependencyHttpDetails | null {
  if (
    !Array.isArray(details?.profileKeys) ||
    details.profileKeys.length > AI_RUN_PROFILE_KEYS.length ||
    !Number.isSafeInteger(details.runCount) ||
    (details.runCount as number) < 0
  ) {
    return null
  }

  const profileKeys = details.profileKeys.filter(
    (profileKey): profileKey is AiRunProfileKey =>
      typeof profileKey === 'string' &&
      AI_RUN_PROFILE_KEYS.includes(profileKey as AiRunProfileKey),
  )
  if (
    profileKeys.length !== details.profileKeys.length ||
    new Set(profileKeys).size !== profileKeys.length ||
    (profileKeys.length === 0 && details.runCount === 0)
  ) {
    return null
  }

  return { profileKeys, runCount: details.runCount as number }
}

function isStatusError(error: unknown): error is Error & {
  details?: Record<string, unknown>
  status: 401 | 403
} {
  if (!(error instanceof Error)) {
    return false
  }

  const maybeStatus = error as { status?: unknown }
  return maybeStatus.status === 401 || maybeStatus.status === 403
}

function toRequirementsCode(status: 401 | 403): RequirementsErrorCode {
  return status === 401 ? 'unauthorized' : 'forbidden'
}

function toSafeLatestEditSummary(
  value: unknown,
): SafeStaleEditHttpDetails['latest'] {
  if (!value || typeof value !== 'object') {
    return null
  }

  const latest = value as {
    uniqueId?: unknown
    versions?: unknown
  }
  if (typeof latest.uniqueId !== 'string') {
    return null
  }

  const [version] = Array.isArray(latest.versions) ? latest.versions : []
  const versionNumber =
    version && typeof version === 'object'
      ? (version as { versionNumber?: unknown }).versionNumber
      : null

  return {
    uniqueId: latest.uniqueId,
    versionNumber: typeof versionNumber === 'number' ? versionNumber : null,
  }
}

function toSafeHttpErrorDetails(
  code: RequirementsErrorCode,
  details: Record<string, unknown> | undefined,
  safeDetails: HttpErrorPayloadOptions['safeDetails'],
): SafeHttpErrorDetails | undefined {
  if (code === 'validation' && safeDetails === 'ai_admin_blockers') {
    const blockers = toSafeAiAdminBlockers(details?.blockers)
    if (blockers) return { blockers }
  }

  if (code === 'conflict' && safeDetails === 'ai_admin_model_dependencies') {
    return toSafeAiAdminModelDependencies(details) ?? undefined
  }

  if (code === 'conflict' && details?.reason === 'stale_requirement_edit') {
    return {
      latest: toSafeLatestEditSummary(details.latest),
      reason: 'stale_requirement_edit',
    }
  }

  if (
    code === 'conflict' &&
    SAFE_NORM_REFERENCE_ID_CONFLICT_REASONS.includes(
      details?.reason as SafeNormReferenceIdConflictReason,
    )
  ) {
    return {
      reason: details?.reason as SafeNormReferenceIdConflictReason,
    }
  }

  if (
    code === 'conflict' &&
    SAFE_IMPROVEMENT_SUGGESTION_CONFLICT_REASONS.includes(
      details?.reason as SafeImprovementSuggestionConflictReason,
    )
  ) {
    return {
      reason: details?.reason as SafeImprovementSuggestionConflictReason,
    }
  }

  if (
    code === 'conflict' &&
    SAFE_RFI_QUESTION_SUGGESTION_CONFLICT_REASONS.includes(
      details?.reason as SafeRfiQuestionSuggestionConflictReason,
    )
  ) {
    return {
      reason: details?.reason as SafeRfiQuestionSuggestionConflictReason,
    }
  }

  if (
    code !== 'validation' ||
    typeof details?.groupKey !== 'string' ||
    !/^[a-z_]+(\.[a-z_]+)+$/.test(details.groupKey) ||
    !SAFE_PRIVACY_ERASURE_REASONS.includes(
      details.reason as SafePrivacyErasureReason,
    )
  ) {
    return undefined
  }

  return {
    groupKey: details.groupKey,
    reason: details.reason as SafePrivacyErasureReason,
  }
}

export function toHttpErrorPayload(
  error: unknown,
  options: HttpErrorPayloadOptions = {},
): HttpErrorPayload {
  if (isRequirementsServiceError(error)) {
    const details = toSafeHttpErrorDetails(
      error.code,
      error.details,
      options.safeDetails,
    )
    const status =
      error.code === 'validation' && error.details?.httpStatus === 422
        ? 422
        : error.status
    return {
      body: {
        code: error.code,
        ...(details ? { details } : {}),
        error:
          error.code === 'forbidden'
            ? 'Forbidden'
            : error.code === 'internal'
              ? 'An internal error occurred'
              : error.message,
      },
      status,
    }
  }

  if (isStatusError(error)) {
    return {
      body: {
        code: toRequirementsCode(error.status),
        error: error.status === 403 ? 'Forbidden' : error.message,
      },
      status: error.status,
    }
  }

  const normalized = internalError()
  return {
    body: {
      code: normalized.code,
      error: normalized.message,
    },
    status: normalized.status,
  }
}
