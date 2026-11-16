import { HSA_ID_PATTERN_SOURCE } from '@/lib/auth/hsa-id'
import {
  BEARER_TOKEN_PATTERN,
  OPENROUTER_KEY_PATTERN,
  redactJwtCredentials,
  SECRET_ASSIGNMENT_PATTERN,
} from '@/lib/credential-patterns'

export const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error'
export const AI_PROVIDER_UNAVAILABLE_MESSAGE = 'AI provider is unavailable'

export interface SafeMessageError extends Error {
  readonly safeMessage: string
}

interface SafeErrorLogValue {
  message: string
  name?: string
  query?: string
  sql?: Record<string, string | number>
  stack?: string
}

const HSA_ID_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])${HSA_ID_PATTERN_SOURCE}(?![A-Za-z0-9])`,
  'gu',
)

const SQL_FRAGMENT_PATTERNS: readonly RegExp[] = [
  /\bSELECT\b\s+[\s\S]{0,500}?\bFROM\b\s+[\w.[\]"`-]+/gi,
  /\bINSERT\s+INTO\b\s+[\w.[\]"`-]+/gi,
  /\bUPDATE\b\s+[\w.[\]"`-]+/gi,
  /\bDELETE\s+FROM\b\s+[\w.[\]"`-]+/gi,
  /\bMERGE\s+INTO\b\s+[\w.[\]"`-]+/gi,
]

export function redactDiagnosticText(value: string): string {
  return redactJwtCredentials(
    value
      .replace(BEARER_TOKEN_PATTERN, '$1Bearer [REDACTED]')
      .replace(OPENROUTER_KEY_PATTERN, '[OPENROUTER_KEY_REDACTED]'),
    '[JWT_REDACTED]',
  )
    .replace(HSA_ID_PATTERN, '[HSA_ID_REDACTED]')
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1=[REDACTED]')
}

export function redactSensitiveText(value: string): string {
  let redacted = redactDiagnosticText(value)

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
    return JSON.stringify(value) ?? 'Unknown error'
  } catch {
    return 'Unknown error'
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : stringifyUnknown(error)
}

export function getSafeErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const safeMessage = (error as Partial<SafeMessageError>).safeMessage
  if (typeof safeMessage !== 'string') return null
  const trimmed = safeMessage.trim()
  if (trimmed.length === 0 || trimmed.length > 1_000) return null
  return redactSensitiveText(trimmed)
}

export function toSafeErrorLogValue(error: unknown): SafeErrorLogValue {
  const sqlError = findSqlError(error)
  if (sqlError) {
    const protectedContent = /\bai_model_verification_attempts\b/iu.test(
      `${sqlError.query ?? ''} ${sqlError.message ?? ''}`,
    )
    const metadata: Record<string, string | number> = {}
    const driver = sqlError.driverError as Record<string, unknown> | undefined
    for (const key of [
      'code',
      'number',
      'state',
      'class',
      'lineNumber',
      'procName',
      'serverName',
    ]) {
      const value = driver?.[key] ?? sqlError[key]
      if (typeof value === 'number' || typeof value === 'string') {
        metadata[key] =
          typeof value === 'string' ? redactDiagnosticText(value) : value
      }
    }
    return {
      message: protectedContent
        ? 'Protected SQL operation failed'
        : redactDiagnosticText(
            String(sqlError.message ?? 'SQL operation failed'),
          ),
      name: String(sqlError.name ?? 'Error'),
      ...(!protectedContent && typeof sqlError.stack === 'string'
        ? { stack: redactDiagnosticText(sqlError.stack) }
        : {}),
      ...(!protectedContent && typeof sqlError.query === 'string'
        ? { query: redactDiagnosticText(sqlError.query) }
        : {}),
      sql: metadata,
    }
  }
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

export interface SqlFailureReference {
  code: 'sql_failure'
  correlationId: string
  error: string
  timestamp: string
}

const sqlFailures = new WeakMap<object, SqlFailureReference>()

function findSqlError(
  error: unknown,
  seen = new Set<object>(),
): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object' || seen.has(error)) return undefined
  seen.add(error)
  const record = error as Record<string, unknown>
  if (
    record.name === 'QueryFailedError' ||
    ((record.name === 'RequestError' ||
      record.name === 'ConnectionError' ||
      record.name === 'TransactionError') &&
      typeof record.code === 'string' &&
      /^E[A-Z]+$/.test(record.code))
  )
    return record
  return findSqlError(record.cause, seen)
}

/** One occurrence survives service and transport catches without depending on DB_LOGGING. */
export function reportSqlFailure(
  error: unknown,
  context: {
    correlationId?: string
    requestId?: string
    source?: string
    toolName?: string
    operation?: string
  } = {},
): SqlFailureReference | undefined {
  const sqlError = findSqlError(error)
  if (!sqlError) return undefined
  const existing = sqlFailures.get(sqlError)
  if (existing) return existing
  const reference: SqlFailureReference = {
    code: 'sql_failure',
    correlationId: context.correlationId ?? crypto.randomUUID(),
    error:
      'The database operation could not be confirmed. Check saved state before repeating the operation.',
    timestamp: new Date().toISOString(),
  }
  sqlFailures.set(sqlError, reference)
  console.error(
    JSON.stringify({
      event: 'sql.operation.failed',
      level: 'error',
      code: reference.code,
      correlation_id: reference.correlationId,
      timestamp: reference.timestamp,
      request_id: context.requestId,
      source: context.source,
      tool_name: context.toolName,
      operation: context.operation,
      error: toSafeErrorLogValue(error),
    }),
  )
  return reference
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
  if (reportSqlFailure(error)) return
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

function getErrorProperty(error: unknown, property: string): unknown {
  return error && typeof error === 'object'
    ? (error as Record<string, unknown>)[property]
    : undefined
}

export function isForeignKeyViolation(error: unknown): boolean {
  const errorNumber = getErrorProperty(error, 'number')
  return (
    errorNumber === 547 ||
    errorNumber === '547' ||
    /\b(?:foreign key|reference constraint)\b/i.test(getErrorMessage(error))
  )
}

export function isForeignKeyOrConstraintError(error: unknown): boolean {
  return (
    isForeignKeyViolation(error) ||
    /\b(?:constraint|foreign key)\b/i.test(getErrorMessage(error))
  )
}
