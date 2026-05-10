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

interface SafeStaleEditHttpDetails {
  latest: {
    uniqueId: string
    versionNumber: number | null
  } | null
  reason: 'stale_requirement_edit'
}

type SafeHttpErrorDetails = SafeStaleEditHttpDetails

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
): SafeHttpErrorDetails | undefined {
  if (code !== 'conflict' || details?.reason !== 'stale_requirement_edit') {
    return undefined
  }

  return {
    latest: toSafeLatestEditSummary(details.latest),
    reason: 'stale_requirement_edit',
  }
}

export function toHttpErrorPayload(error: unknown): HttpErrorPayload {
  if (isRequirementsServiceError(error)) {
    const details = toSafeHttpErrorDetails(error.code, error.details)
    const status =
      error.code === 'validation' && error.details?.httpStatus === 422
        ? 422
        : error.status
    return {
      body: {
        code: error.code,
        ...(details ? { details } : {}),
        error:
          error.code === 'internal'
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
        error: error.message,
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
