/**
 * Security event audit log (plan-auth Phase 5c).
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

const DENY_LIST_PATTERNS: readonly RegExp[] = [
  /token/i,
  /secret/i,
  /password/i,
  /^code$/i,
  /^code_verifier$/i,
  /^state$/i,
  /^nonce$/i,
]

function isDenied(key: string): boolean {
  return DENY_LIST_PATTERNS.some(pattern => pattern.test(key))
}

function redactDetail(
  detail: Record<string, SecurityEventDetailValue> | undefined,
): Record<string, SecurityEventDetailValue> | undefined {
  if (!detail) return undefined
  const out: Record<string, SecurityEventDetailValue> = {}
  let kept = 0
  for (const [key, value] of Object.entries(detail)) {
    if (isDenied(key)) continue
    out[key] = value
    kept += 1
  }
  return kept === 0 ? undefined : out
}

function normalizeRequest(
  input: Request | SecurityEventRequest,
): SecurityEventRequest {
  if (typeof (input as Request).headers?.get === 'function') {
    const req = input as Request
    let path = ''
    try {
      path = new URL(req.url).pathname
    } catch {
      path = req.url
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
  return input as SecurityEventRequest
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
    const detail = redactDetail(input.detail)
    if (detail) normalized.detail = detail
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(normalized))
  } catch (err) {
    try {
      // eslint-disable-next-line no-console
      console.error(
        '[security-audit] failed to record event',
        err instanceof Error ? err.message : String(err),
      )
    } catch {
      /* swallow — must never throw out of the auth flow */
    }
  }
}
