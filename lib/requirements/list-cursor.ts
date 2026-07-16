import { createHash } from 'node:crypto'
import { z } from 'zod'
import { invalidCursorError } from '@/lib/requirements/errors'

const CURSOR_VERSION = 1
const MAX_CURSOR_LENGTH = 512

const cursorPayloadSchema = z
  .object({
    anchorRequirementId: z
      .number()
      .int()
      .refine(value => value !== 0),
    queryHash: z.string().regex(/^[a-f0-9]{64}$/u),
    version: z.literal(CURSOR_VERSION),
  })
  .strict()

export interface RequirementListCursorPayload {
  anchorRequirementId: number
  queryHash: string
  version: typeof CURSOR_VERSION
}

function invalidCursor(): never {
  throw invalidCursorError()
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(stableValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      )
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function hashRequirementListQuery(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

export function encodeRequirementListCursor(
  anchorRequirementId: number,
  queryHash: string,
): string {
  const payload = cursorPayloadSchema.parse({
    anchorRequirementId,
    queryHash,
    version: CURSOR_VERSION,
  })
  return Buffer.from(
    JSON.stringify(payload satisfies RequirementListCursorPayload),
  ).toString('base64url')
}

export function decodeRequirementListCursor(
  cursor: string,
): RequirementListCursorPayload {
  if (!cursor || cursor.length > MAX_CURSOR_LENGTH) invalidCursor()

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    const canonical = Buffer.from(decoded).toString('base64url')
    if (canonical !== cursor) invalidCursor()
    return cursorPayloadSchema.parse(JSON.parse(decoded))
  } catch {
    return invalidCursor()
  }
}

export function assertRequirementListCursorMatches(
  payload: RequirementListCursorPayload,
  queryHash: string,
): void {
  if (payload.queryHash !== queryHash) invalidCursor()
}
