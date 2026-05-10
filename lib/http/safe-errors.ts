export const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error'
export const AI_PROVIDER_UNAVAILABLE_MESSAGE = 'AI provider is unavailable'
export const AI_CREDIT_INFORMATION_UNAVAILABLE_MESSAGE =
  'AI credit information is unavailable'

interface SafeErrorLogValue {
  message: string
  name?: string
  stack?: string
}

const OPENROUTER_KEY_PATTERN = /\bsk-or-(?:v1|mgmt)-[A-Za-z0-9_-]+\b/g
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Za-z0-9_.-]*(?:api[_-]?key|authorization[_-]?code|code[_-]?verifier|nonce|password|secret|state|token)[A-Za-z0-9_.-]*)\s*[:=]\s*["']?[^"',\s}]+/gi

const SQL_FRAGMENT_PATTERNS: readonly RegExp[] = [
  /\bSELECT\b\s+[\s\S]{0,500}?\bFROM\b\s+[\w.[\]"`-]+/gi,
  /\bINSERT\s+INTO\b\s+[\w.[\]"`-]+/gi,
  /\bUPDATE\b\s+[\w.[\]"`-]+/gi,
  /\bDELETE\s+FROM\b\s+[\w.[\]"`-]+/gi,
  /\bMERGE\s+INTO\b\s+[\w.[\]"`-]+/gi,
]

export function redactSensitiveText(value: string): string {
  let redacted = value
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]')
    .replace(OPENROUTER_KEY_PATTERN, '[OPENROUTER_KEY_REDACTED]')
    .replace(JWT_PATTERN, '[JWT_REDACTED]')
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1=[REDACTED]')

  for (const pattern of SQL_FRAGMENT_PATTERNS) {
    redacted = redacted.replace(pattern, '[SQL_REDACTED]')
  }

  return redacted
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return 'Unknown error'
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : stringifyUnknown(error)
}

export function toSafeErrorLogValue(error: unknown): SafeErrorLogValue {
  if (error instanceof Error) {
    return {
      message: redactSensitiveText(error.message),
      name: error.name,
      ...(typeof error.stack === 'string'
        ? { stack: redactSensitiveText(error.stack) }
        : {}),
    }
  }

  return { message: redactSensitiveText(stringifyUnknown(error)) }
}

function sanitizeLogDetailValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSensitiveText(value)
  }
  if (value instanceof Error) {
    return toSafeErrorLogValue(value)
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogDetailValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeLogDetailValue(item),
      ]),
    )
  }
  return value
}

export function logSanitizedError(
  message: string,
  error: unknown,
  detail?: Record<string, unknown>,
): void {
  const payload = {
    error: toSafeErrorLogValue(error),
    ...(detail ? { detail: sanitizeLogDetailValue(detail) } : {}),
  }

  // eslint-disable-next-line no-console
  console.error(message, payload)
}

export function isDuplicateKeyError(error: unknown): boolean {
  return /\b(?:duplicate|unique)\b/i.test(getErrorMessage(error))
}

export function isForeignKeyOrConstraintError(error: unknown): boolean {
  return /\b(?:constraint|foreign key)\b/i.test(getErrorMessage(error))
}
