import { createHash } from 'node:crypto'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import type {
  AiSafetyBlockedStep,
  AiSafetyDirection,
  AiSafetyForensicEvidence,
  AiSafetyScreeningResult,
} from './safety'

export const AI_FORENSIC_MAX_EVENT_BYTES = 8_192
export const AI_FORENSIC_MAX_EVENT_ITEMS = 8
export const AI_FORENSIC_MAX_EXCERPT_BYTES = 2_048

interface ActiveCaptureRow {
  captureWindowId: number
  eventByteLimit?: number
  eventItemLimit?: number
}

interface StoredEvidenceItem {
  excerpt: string
  label: string
  trigger: string | null
}

interface MatchSpan {
  end: number
  start: number
}

function utf8Prefix(value: string, maximumBytes: number): string {
  let bytes = 0
  let result = ''
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maximumBytes) break
    result += character
    bytes += characterBytes
  }
  return result
}

function utf8Suffix(value: string, maximumBytes: number): string {
  const characters = Array.from(value)
  let bytes = 0
  let start = characters.length
  while (start > 0) {
    const characterBytes = Buffer.byteLength(characters[start - 1], 'utf8')
    if (bytes + characterBytes > maximumBytes) break
    start -= 1
    bytes += characterBytes
  }
  return characters.slice(start).join('')
}

function normalizeEvidenceText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ')
}

function redactEvidence(value: string): string {
  return value
    .replace(
      /\b(?:authorization\s*:\s*bearer|bearer)\s+[A-Za-z0-9._~+/=-]+/giu,
      'Authorization: Bearer [REDACTED_SECRET]',
    )
    .replace(
      /\b(api[_ -]?key|client[_ -]?secret|password|token)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/giu,
      '$1: [REDACTED_SECRET]',
    )
    .replace(/\b[A-Z]{2}\d{10}-[A-Za-z0-9._-]+\b/giu, '[REDACTED_IDENTIFIER]')
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
      '[REDACTED_IDENTIFIER]',
    )
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, '[REDACTED_IDENTIFIER]')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function firstTriggerSpan(
  text: string,
  evidence: readonly AiSafetyForensicEvidence[],
): MatchSpan | null {
  let first: MatchSpan | null = null
  for (const trigger of evidence.flatMap(item => item.terms)) {
    const pattern = trigger.matchedText
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/gu, '')
      .trim()
      .split(/\s+/u)
      .map(escapeRegExp)
      .join('\\s*')
    if (!pattern) continue
    const match = new RegExp(pattern, 'iu').exec(text)
    if (!match || (first && match.index >= first.start)) continue
    first = { end: match.index + match[0].length, start: match.index }
  }
  return first
}

function byteCenteredExcerpt(
  text: string,
  match: MatchSpan | null,
  maximumBytes: number,
): { excerpt: string; trigger: string | null } {
  if (!match) {
    return { excerpt: utf8Prefix(text, maximumBytes), trigger: null }
  }
  const trigger = text.slice(match.start, match.end)
  const triggerBytes = Buffer.byteLength(trigger, 'utf8')
  if (triggerBytes >= maximumBytes) {
    const excerpt = utf8Prefix(trigger, maximumBytes)
    return { excerpt, trigger: excerpt || null }
  }

  const contextBudget = maximumBytes - triggerBytes
  const initialLeft = utf8Suffix(
    text.slice(0, match.start),
    Math.floor(contextBudget / 2),
  )
  const right = utf8Prefix(
    text.slice(match.end),
    contextBudget - Buffer.byteLength(initialLeft, 'utf8'),
  )
  const remainingBytes =
    contextBudget -
    Buffer.byteLength(initialLeft, 'utf8') -
    Buffer.byteLength(right, 'utf8')
  const left = utf8Suffix(
    text.slice(0, match.start),
    Buffer.byteLength(initialLeft, 'utf8') + remainingBytes,
  )
  return { excerpt: `${left}${trigger}${right}`, trigger }
}

function storedItems(
  screening: AiSafetyScreeningResult,
  itemLimit: number,
): StoredEvidenceItem[] {
  const candidates = screening.contentParts.flatMap(part => {
    const evidence = screening.forensicEvidence.filter(
      item => item.partLabel === part.label || item.partLabel === 'combined',
    )
    const safeText = redactEvidence(normalizeEvidenceText(part.text))
    const match = firstTriggerSpan(safeText, evidence)
    if (screening.forensicEvidence.length > 0 && !match) {
      return []
    }
    return [
      {
        centered: byteCenteredExcerpt(
          safeText,
          match,
          AI_FORENSIC_MAX_EXCERPT_BYTES,
        ),
        part,
      },
    ]
  })
  return candidates.slice(0, itemLimit).map(({ centered, part }) => ({
    excerpt: centered.excerpt,
    label: utf8Prefix(part.label, 80),
    trigger: centered.trigger,
  }))
}

function boundedItem(
  item: StoredEvidenceItem,
  maximumExcerptBytes: number,
): { excerpt: string; label: string } {
  const triggerStart = item.trigger ? item.excerpt.indexOf(item.trigger) : -1
  const match =
    triggerStart < 0 || !item.trigger
      ? null
      : { end: triggerStart + item.trigger.length, start: triggerStart }
  return {
    excerpt: byteCenteredExcerpt(item.excerpt, match, maximumExcerptBytes)
      .excerpt,
    label: item.label,
  }
}

function boundedEvidence(
  items: StoredEvidenceItem[],
  byteLimit: number,
): { items: StoredEvidenceItem[]; json: string } {
  const fitsSqlNvarchar = (value: string) =>
    Buffer.byteLength(value, 'utf8') <= byteLimit &&
    Buffer.byteLength(value, 'utf16le') <= byteLimit
  const selected = [...items]
  while (
    selected.length > 0 &&
    !fitsSqlNvarchar(JSON.stringify(selected.map(item => boundedItem(item, 0))))
  ) {
    selected.pop()
  }
  if (selected.length === 0) return { items: [], json: '[]' }

  let low = 0
  let high = AI_FORENSIC_MAX_EXCERPT_BYTES
  let json = JSON.stringify(selected.map(item => boundedItem(item, 0)))
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = selected.map(item => boundedItem(item, middle))
    const candidateJson = JSON.stringify(candidate)
    if (fitsSqlNvarchar(candidateJson)) {
      json = candidateJson
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return { items: selected, json }
}

function actorFingerprint(
  captureWindowId: number,
  context: RequestContext,
): string | null {
  const durableIdentity = context.actor.hsaId?.trim()
  if (!durableIdentity) return null
  return createHash('sha256')
    .update(`${captureWindowId}:${durableIdentity}`)
    .digest('hex')
}

export async function persistAiForensicEvidence(args: {
  blockedStep: AiSafetyBlockedStep
  context: RequestContext
  db: SqlServerDatabase
  direction: AiSafetyDirection
  eventId: string
  operation: string
  screening: AiSafetyScreeningResult
}): Promise<boolean> {
  const captures = await args.db.query<ActiveCaptureRow[]>(
    `
      SELECT TOP (1)
        id AS captureWindowId,
        event_byte_limit AS eventByteLimit,
        event_item_limit AS eventItemLimit
      FROM ai_forensic_capture_windows
      WHERE approved_at IS NOT NULL
        AND stopped_at IS NULL
        AND purged_at IS NULL
        AND expires_at > SYSUTCDATETIME()
        AND operation = @0
        AND direction = @1
      ORDER BY approved_at DESC, id DESC
    `,
    [args.operation, args.direction],
  )
  const capture = captures[0]
  if (!capture) return false

  const itemLimit = Math.max(
    1,
    Math.min(
      AI_FORENSIC_MAX_EVENT_ITEMS,
      Math.trunc(capture.eventItemLimit ?? AI_FORENSIC_MAX_EVENT_ITEMS),
    ),
  )
  const byteLimit = Math.max(
    1,
    Math.min(
      AI_FORENSIC_MAX_EVENT_BYTES,
      Math.trunc(capture.eventByteLimit ?? AI_FORENSIC_MAX_EVENT_BYTES),
    ),
  )
  const bounded = boundedEvidence(
    storedItems(args.screening, itemLimit),
    byteLimit,
  )
  if (bounded.items.length === 0) return false

  const inserted = await args.db.query<Array<{ id: number }>>(
    `
      INSERT INTO ai_forensic_evidence_events (
        ai_forensic_capture_window_id,
        event_id,
        actor_fingerprint,
        blocked_step,
        primary_rule_id,
        rule_ids_json,
        evidence_json,
        item_count,
        byte_count,
        captured_at
      )
      OUTPUT INSERTED.id
      SELECT
        @0, @1, @2, @5, @6, @7, @8, @9,
        DATALENGTH(@8), SYSUTCDATETIME()
      WHERE EXISTS (
        SELECT 1
        FROM ai_forensic_capture_windows AS capture WITH (UPDLOCK, HOLDLOCK)
        WHERE capture.id = @0
          AND capture.approved_at IS NOT NULL
          AND capture.stopped_at IS NULL
          AND capture.purged_at IS NULL
          AND capture.expires_at > SYSUTCDATETIME()
          AND capture.operation = @3
          AND capture.direction = @4
          AND (
            SELECT COUNT_BIG(*)
            FROM ai_forensic_evidence_events AS evidence WITH (UPDLOCK, HOLDLOCK)
            WHERE evidence.ai_forensic_capture_window_id = capture.id
          ) < capture.collection_item_limit
      )
    `,
    [
      capture.captureWindowId,
      args.eventId,
      actorFingerprint(capture.captureWindowId, args.context),
      args.operation,
      args.direction,
      args.blockedStep,
      args.screening.decision.primaryRuleId,
      JSON.stringify(args.screening.decision.ruleIds),
      bounded.json,
      bounded.items.length,
    ],
  )
  return inserted.length === 1
}
