import { createHash } from 'node:crypto'
import { z } from 'zod'
import { invalidCursorError } from '@/lib/requirements/errors'

const CURSOR_VERSION = 4
export const REQUIREMENT_LIST_CURSOR_MAX_LENGTH = 512

const boundarySchema = z
  .object({
    nullRank: z.union([z.literal(0), z.literal(1)]),
    requirementId: z.number().int().positive(),
    sortValue: z.union([z.string(), z.number().finite(), z.null()]),
  })
  .strict()

const cursorPayloadSchema = z
  .object({
    boundary: boundarySchema,
    queryFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    version: z.literal(CURSOR_VERSION),
  })
  .strict()

export type RequirementListPageBoundary = z.infer<typeof boundarySchema>

export interface RequirementListCursorPayload {
  boundary: RequirementListPageBoundary
  queryFingerprint: string
  version: typeof CURSOR_VERSION
}

function invalidCursor(): never {
  throw invalidCursorError()
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue).sort((left, right) => {
      const leftValue = JSON.stringify(left)
      const rightValue = JSON.stringify(right)
      return leftValue.localeCompare(rightValue)
    })
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

export function fingerprintRequirementListQuery(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

export function encodeRequirementListCursor(
  boundary: RequirementListPageBoundary,
  queryFingerprint: string,
): string {
  const payload = cursorPayloadSchema.parse({
    boundary,
    queryFingerprint,
    version: CURSOR_VERSION,
  }) satisfies RequirementListCursorPayload
  const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url')
  if (cursor.length > REQUIREMENT_LIST_CURSOR_MAX_LENGTH) invalidCursor()
  return cursor
}

export function decodeRequirementListCursor(
  cursor: string,
): RequirementListCursorPayload {
  if (!cursor || cursor.length > REQUIREMENT_LIST_CURSOR_MAX_LENGTH) {
    return invalidCursor()
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    if (Buffer.from(decoded).toString('base64url') !== cursor) invalidCursor()
    return cursorPayloadSchema.parse(JSON.parse(decoded))
  } catch {
    return invalidCursor()
  }
}

export function assertRequirementListCursorMatches(
  payload: RequirementListCursorPayload,
  queryFingerprint: string,
): void {
  if (payload.queryFingerprint !== queryFingerprint) invalidCursor()
}
