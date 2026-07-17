import { createHash } from 'node:crypto'
import { z } from 'zod'
import { invalidCursorError } from '@/lib/requirements/errors'

const CURSOR_VERSION = 1
export const SPECIFICATION_ITEM_CURSOR_MAX_LENGTH = 512

const boundarySchema = z
  .object({
    kindRank: z.union([z.literal(0), z.literal(1)]),
    nullRank: z.union([z.literal(0), z.literal(1)]),
    sortValue: z.union([z.string(), z.number().finite(), z.null()]),
    sourceId: z.number().int().positive(),
    uniqueId: z.string(),
  })
  .strict()

const cursorBoundarySchema = boundarySchema.pick({
  kindRank: true,
  sourceId: true,
})

const cursorPayloadSchema = z
  .object({
    boundary: cursorBoundarySchema,
    queryFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    version: z.literal(CURSOR_VERSION),
  })
  .strict()

export type SpecificationItemPageBoundary = z.infer<typeof boundarySchema>
export type SpecificationItemPageCursorBoundary = z.infer<
  typeof cursorBoundarySchema
>

export interface SpecificationItemPageCursorPayload {
  boundary: SpecificationItemPageCursorBoundary
  queryFingerprint: string
  version: typeof CURSOR_VERSION
}

function invalidCursor(): never {
  throw invalidCursorError()
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue)
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

export function fingerprintSpecificationItemPageQuery(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

export function encodeSpecificationItemPageCursor(
  boundary: SpecificationItemPageBoundary,
  queryFingerprint: string,
): string {
  const payload = cursorPayloadSchema.parse({
    boundary: {
      kindRank: boundary.kindRank,
      sourceId: boundary.sourceId,
    },
    queryFingerprint,
    version: CURSOR_VERSION,
  }) satisfies SpecificationItemPageCursorPayload
  const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url')
  if (cursor.length > SPECIFICATION_ITEM_CURSOR_MAX_LENGTH) invalidCursor()
  return cursor
}

export function decodeSpecificationItemPageCursor(
  cursor: string,
): SpecificationItemPageCursorPayload {
  if (!cursor || cursor.length > SPECIFICATION_ITEM_CURSOR_MAX_LENGTH) {
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

export function assertSpecificationItemPageCursorMatches(
  payload: SpecificationItemPageCursorPayload,
  queryFingerprint: string,
): void {
  if (payload.queryFingerprint !== queryFingerprint) invalidCursor()
}
