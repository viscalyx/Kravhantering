import { recordSecurityEvent } from '@/lib/auth/audit'
import { getClientIp } from '@/lib/auth/client-ip'
import { getAuthConfig } from '@/lib/auth/config'
import { version } from '@/package.json'

// Per process, deliberately independent of the Admin logging switch.
export const CSP_REPORT_LIMITS = Object.freeze({
  bytes: 65_536,
  batch: 20,
  fieldLength: 4096,
  keyLength: 128,
  depth: 8,
  nodes: 2048,
  windowMs: 60_000,
  requests: 120,
  sourceRequests: 30,
  events: 240,
  sourceEvents: 60,
  sources: 64,
  concurrent: 8,
  readTimeoutMs: 5000,
})

const DIRECTIVES = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'connect-src',
  'media-src',
  'object-src',
  'frame-src',
  'child-src',
  'worker-src',
  'manifest-src',
  'base-uri',
  'form-action',
  'frame-ancestors',
  'sandbox',
  'upgrade-insecure-requests',
  'trusted-types',
  'require-trusted-types-for',
])
type ReportObject = Record<string, unknown>
interface DiagnosticCategories {
  blockedResource: string
  directive: string
  surface: 'application' | 'api-documentation' | 'unknown'
}
class ReportRejection extends Error {
  constructor(readonly status: number) {
    super('CSP report rejected')
  }
}
function object(value: unknown): value is ReportObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Validate without recursion; arbitrary nested input is never passed to the logger.
function assertBoundedFields(root: unknown): void {
  const pending = [{ value: root, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const item = pending.pop()
    if (!item) break
    if (
      ++nodes > CSP_REPORT_LIMITS.nodes ||
      item.depth > CSP_REPORT_LIMITS.depth
    )
      throw new ReportRejection(400)
    const { value, depth } = item
    if (
      typeof value === 'string' &&
      value.length > CSP_REPORT_LIMITS.fieldLength
    )
      throw new ReportRejection(400)
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.length > CSP_REPORT_LIMITS.keyLength)
          throw new ReportRejection(400)
        pending.push({ value: child, depth: depth + 1 })
      }
    }
  }
}
function surface(
  value: unknown,
  origin: string,
): DiagnosticCategories['surface'] {
  if (typeof value !== 'string') return 'unknown'
  try {
    const url = new URL(value)
    if (url.origin !== origin) return 'unknown'
    if (url.pathname === '/api-docs' || url.pathname.startsWith('/api-docs/'))
      return 'api-documentation'
    if (/^\/(?:en|sv)(?:\/|$)/.test(url.pathname) || url.pathname === '/')
      return 'application'
  } catch {
    /* Only the fixed category survives. */
  }
  return 'unknown'
}
function blockedResource(value: unknown, origin: string): string {
  if (typeof value !== 'string') return 'unknown'
  if (['inline', 'eval', 'wasm-eval'].includes(value)) return value
  if (value === 'data' || value.startsWith('data:')) return 'data'
  if (value === 'blob' || value.startsWith('blob:')) return 'blob'
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin === origin ? 'same-origin' : 'cross-origin'
    }
  } catch {
    /* Do not retain unknown schemes or input. */
  }
  return 'unknown'
}
function normalize(
  body: ReportObject,
  modern: boolean,
  origin: string,
): DiagnosticCategories {
  const directive = modern
    ? body.effectiveDirective
    : (body['effective-directive'] ?? body['violated-directive'])
  return {
    directive:
      typeof directive === 'string' && DIRECTIVES.has(directive)
        ? directive
        : 'unknown',
    blockedResource: blockedResource(
      modern ? body.blockedURL : body['blocked-uri'],
      origin,
    ),
    surface: surface(modern ? body.documentURL : body['document-uri'], origin),
  }
}
function reports(
  payload: unknown,
  modern: boolean,
  origin: string,
): DiagnosticCategories[] {
  if (modern) {
    if (!Array.isArray(payload)) throw new ReportRejection(400)
    if (payload.length > CSP_REPORT_LIMITS.batch) throw new ReportRejection(413)
  }
  assertBoundedFields(payload)
  if (!modern) {
    if (!object(payload) || !object(payload['csp-report']))
      throw new ReportRejection(400)
    return [normalize(payload['csp-report'], false, origin)]
  }
  const result: DiagnosticCategories[] = []
  for (const report of payload as unknown[]) {
    if (!object(report) || typeof report.type !== 'string')
      throw new ReportRejection(400)
    if (report.type !== 'csp-violation') continue
    if (!object(report.body)) throw new ReportRejection(400)
    result.push(normalize(report.body, true, origin))
  }
  return result
}
async function readPayload(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new ReportRejection(400)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ReportRejection(408)),
      CSP_REPORT_LIMITS.readTimeoutMs,
    )
  })
  let complete = false
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timeout])
      if (done) break
      size += value.byteLength
      if (size > CSP_REPORT_LIMITS.bytes) throw new ReportRejection(413)
      chunks.push(value)
    }
    complete = true
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown
  } finally {
    clearTimeout(timer)
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function environment(): string {
  const configured =
    process.env.KRAVHANTERING_DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV
  return ['production', 'staging', 'prodlike', 'development', 'test'].includes(
    configured ?? '',
  )
    ? (configured as string)
    : 'unknown'
}

/** One instance per route module; no sessions, URL fetches, report storage or cached setting. */
export function createCspReportReceiver(
  loggingEnabled: () => Promise<boolean>,
): (request: Request) => Promise<Response> {
  let windowStart = Date.now()
  let requests = 0
  let events = 0
  let active = 0
  let nextFailureSignal = 0
  const sources = new Map<string, { requests: number; events: number }>()

  function refreshWindow(now: number): void {
    if (now - windowStart >= CSP_REPORT_LIMITS.windowMs) {
      windowStart = now
      requests = 0
      events = 0
      sources.clear()
    }
  }

  return async (request: Request): Promise<Response> => {
    const now = Date.now()
    refreshWindow(now)
    if (
      requests >= CSP_REPORT_LIMITS.requests ||
      active >= CSP_REPORT_LIMITS.concurrent
    )
      return new Response(null, { status: 429 })
    requests++
    // The edge must overwrite this header. Unknown sources share a single bucket.
    const key = getClientIp(request) ?? 'unknown'
    let source = sources.get(key)
    if (!source) {
      if (sources.size >= CSP_REPORT_LIMITS.sources)
        return new Response(null, { status: 429 })
      source = { requests: 0, events: 0 }
      sources.set(key, source)
    }
    if (source.requests >= CSP_REPORT_LIMITS.sourceRequests)
      return new Response(null, { status: 429 })
    source.requests++
    active++
    try {
      const media = request.headers
        .get('content-type')
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase()
      if (
        media !== 'application/csp-report' &&
        media !== 'application/reports+json'
      )
        throw new ReportRejection(415)
      const accepted = reports(
        await readPayload(request),
        media === 'application/reports+json',
        new URL(getAuthConfig().redirectUri).origin,
      )
      // A body can straddle a window reset caused by a different request.
      // Charge the current source bucket, never a detached prior-window object.
      refreshWindow(Date.now())
      let eventSource = sources.get(key)
      if (!eventSource) {
        if (sources.size >= CSP_REPORT_LIMITS.sources)
          throw new ReportRejection(429)
        eventSource = { requests: 0, events: 0 }
        sources.set(key, eventSource)
      }
      if (
        events + accepted.length > CSP_REPORT_LIMITS.events ||
        eventSource.events + accepted.length > CSP_REPORT_LIMITS.sourceEvents
      )
        throw new ReportRejection(429)
      events += accepted.length
      eventSource.events += accepted.length
      if (accepted.length === 0) return new Response(null, { status: 204 })
      let enabled: boolean
      try {
        enabled = await loggingEnabled()
      } catch {
        if (Date.now() >= nextFailureSignal) {
          nextFailureSignal = Date.now() + CSP_REPORT_LIMITS.windowMs
          console.warn('CSP report logging unavailable: settings read failed')
        }
        return new Response(null, { status: 503 })
      }
      if (enabled === true) {
        for (const categories of accepted) {
          recordSecurityEvent({
            actor: { source: 'anonymous' },
            event: 'security.csp.violation_reported',
            outcome: 'success',
            request: { method: 'POST', path: '/api/security/csp-reports' },
            ts: new Date(now).toISOString(),
            detail: { ...categories, environment: environment(), version },
          })
        }
      }
      return new Response(null, { status: 204 })
    } catch (error) {
      return new Response(null, {
        status: error instanceof ReportRejection ? error.status : 400,
      })
    } finally {
      active--
    }
  }
}
