/**
 * Security event audit log for authentication and token handling.
 *
 * Emits one JSON line per security event to `console.info`, tagged with
 * `channel:"security-audit"` so the OpenShift log collector can route the
 * stream independently from the application action audit log. Stateless and
 * dependency-free — no transport, no buffering.
 *
 * Callers MUST never pass tokens, secrets, codes, verifiers, state, or
 * nonces in `detail`. The redactor strips any top-level `detail` key whose
 * name matches the deny-list as a defense-in-depth measure.
 */

export type SecurityEventName =
  | 'auth.login.succeeded'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'auth.session.rejected'
  | 'auth.token.rejected'
  | 'auth.mcp.token.accepted'
  | 'auth.roles.changed'
  | 'auth.csrf.rejected'

export type SecurityEventOutcome = 'success' | 'failure'

export type SecurityEventActorSource = 'oidc' | 'mcp' | 'anonymous'

export interface SecurityEventActor {
  clientId?: string
  hsaId?: string
  source: SecurityEventActorSource
  sub?: string
}

export interface SecurityEventRequest {
  method: string
  path: string
  requestId?: string
  userAgent?: string
}

export type SecurityEventDetailValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]

export interface SecurityEventInput {
  actor: SecurityEventActor
  detail?: Record<string, SecurityEventDetailValue>
  event: SecurityEventName
  outcome: SecurityEventOutcome
  request: Request | SecurityEventRequest
  /** ISO-8601 UTC. Defaulted to `new Date().toISOString()` when omitted. */
  ts?: string
}

interface NormalizedSecurityEvent {
  actor: SecurityEventActor
  channel: 'security-audit'
  detail?: Record<string, SecurityEventDetailValue>
  event: SecurityEventName
  outcome: SecurityEventOutcome
  request: SecurityEventRequest
  ts: string
}

interface RedactedSecurityEventDetail {
  detail?: Record<string, SecurityEventDetailValue>
  redactedKeys: string[]
}

const DENY_LIST_PATTERNS: readonly RegExp[] = [
  /^.*token(?:_?hint)?$/i,
  /^.*secret$/i,
  /^.*password$/i,
  /^code$/i,
  /^authorization_?code$/i,
  /^code_?verifier$/i,
  /^state$/i,
  /^nonce$/i,
]

function isDenied(key: string): boolean {
  return DENY_LIST_PATTERNS.some(pattern => pattern.test(key))
}

function redactDetail(
  detail: Record<string, SecurityEventDetailValue> | undefined,
): RedactedSecurityEventDetail {
  if (!detail) return { redactedKeys: [] }
  const out: Record<string, SecurityEventDetailValue> = {}
  const redactedKeys: string[] = []
  let kept = 0
  for (const [key, value] of Object.entries(detail)) {
    if (isDenied(key)) {
      redactedKeys.push(key)
      continue
    }
    out[key] = value
    kept += 1
  }
  return { detail: kept === 0 ? undefined : out, redactedKeys }
}

function normalizeRequest(
  input: Request | SecurityEventRequest,
): SecurityEventRequest {
  const stripQueryAndFragment = (path: string): string =>
    path.split(/[?#]/, 1)[0] ?? ''

  if (input instanceof Request) {
    const req = input
    let path = ''
    try {
      path = new URL(req.url).pathname
    } catch {
      path = stripQueryAndFragment(req.url)
    }
    const out: SecurityEventRequest = {
      method: req.method,
      path,
    }
    const ua = req.headers.get('user-agent')
    if (ua) out.userAgent = ua
    const requestId = req.headers.get('x-request-id')
    if (requestId) out.requestId = requestId
    return out
  }
  const out: SecurityEventRequest = {
    method: input.method,
    path: stripQueryAndFragment(input.path),
  }
  if (input.userAgent) out.userAgent = input.userAgent
  if (input.requestId) out.requestId = input.requestId
  return out
}

function safeLogString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value)
  }
  return fallback
}

function auditEventName(input: SecurityEventInput): string {
  return safeLogString(input.event, 'unknown-event')
}

function auditActorSource(input: SecurityEventInput): string {
  return safeLogString(
    (input as { actor?: { source?: unknown } }).actor?.source,
    'unknown-actor',
  )
}

function recordRedactionBreadcrumb(
  input: SecurityEventInput,
  detailKey: string,
  ts: string,
): void {
  try {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        channel: 'security-audit',
        ts,
        breadcrumb: 'detail-key-redacted',
        auditEvent: auditEventName(input),
        actorSource: auditActorSource(input),
        detailKey,
      }),
    )
  } catch {
    /* swallow — redaction observability must not break auth flow */
  }
}

/**
 * Record a single security event. Never throws — defensive try/catch
 * ensures auth flow continues even if logging fails.
 */
export function recordSecurityEvent(input: SecurityEventInput): void {
  try {
    const normalized: NormalizedSecurityEvent = {
      channel: 'security-audit',
      ts: input.ts ?? new Date().toISOString(),
      event: input.event,
      outcome: input.outcome,
      actor: input.actor,
      request: normalizeRequest(input.request),
    }
    const { detail, redactedKeys } = redactDetail(input.detail)
    if (detail) normalized.detail = detail
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(normalized))
    for (const detailKey of redactedKeys) {
      recordRedactionBreadcrumb(input, detailKey, normalized.ts)
    }
  } catch (err) {
    try {
      // eslint-disable-next-line no-console
      console.error(
        '[security-audit] failed to record event',
        auditEventName(input),
        auditActorSource(input),
        err instanceof Error ? err.message : String(err),
      )
    } catch {
      /* swallow — must never throw out of the auth flow */
    }
  }
}
