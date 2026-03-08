export type RequirementsErrorCode =
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden'
  | 'internal'

const STATUS_BY_CODE: Record<RequirementsErrorCode, number> = {
  not_found: 404,
  validation: 400,
  conflict: 409,
  unauthorized: 401,
  forbidden: 403,
  internal: 500,
}

export class RequirementsServiceError extends Error {
  readonly code: RequirementsErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(
    code: RequirementsErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'RequirementsServiceError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }
}

export function isRequirementsServiceError(
  error: unknown,
): error is RequirementsServiceError {
  return error instanceof RequirementsServiceError
}

export function createRequirementsError(
  code: RequirementsErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return new RequirementsServiceError(code, message, details)
}

export function notFoundError(
  message: string,
  details?: Record<string, unknown>,
) {
  return createRequirementsError('not_found', message, details)
}

export function validationError(
  message: string,
  details?: Record<string, unknown>,
) {
  return createRequirementsError('validation', message, details)
}

export function conflictError(
  message: string,
  details?: Record<string, unknown>,
) {
  return createRequirementsError('conflict', message, details)
}

export function unauthorizedError(
  message = 'Authentication is required',
  details?: Record<string, unknown>,
) {
  return createRequirementsError('unauthorized', message, details)
}

export function forbiddenError(
  message = 'You are not allowed to perform this action',
  details?: Record<string, unknown>,
) {
  return createRequirementsError('forbidden', message, details)
}

export function internalError(
  message = 'An internal error occurred',
  details?: Record<string, unknown>,
) {
  return createRequirementsError('internal', message, details)
}

export function normalizeRequirementsError(error: unknown) {
  if (isRequirementsServiceError(error)) {
    return error
  }

  if (error instanceof Error) {
    return internalError(error.message)
  }

  return internalError()
}
