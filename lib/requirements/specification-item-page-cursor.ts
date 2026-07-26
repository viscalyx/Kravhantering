import { z } from 'zod'
import {
  createVersionedCursorCodec,
  fingerprintCursorQuery,
  type VersionedCursorPayload,
} from '@/lib/requirements/cursor-codec'

const CURSOR_VERSION = 2
export const SPECIFICATION_ITEM_CURSOR_MAX_LENGTH = 8192

const boundarySchema = z
  .object({
    kindRank: z.union([z.literal(0), z.literal(1)]),
    nullRank: z.union([z.literal(0), z.literal(1)]),
    sortValue: z.union([z.string(), z.number().finite(), z.null()]),
    sourceId: z.number().int().positive(),
    uniqueId: z.string(),
  })
  .strict()

export type SpecificationItemPageBoundary = z.infer<typeof boundarySchema>
export type SpecificationItemPageCursorBoundary = SpecificationItemPageBoundary

export type SpecificationItemPageCursorPayload = VersionedCursorPayload<
  SpecificationItemPageCursorBoundary,
  typeof CURSOR_VERSION
>

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
  return fingerprintCursorQuery(value, stableValue)
}

const cursorCodec = createVersionedCursorCodec({
  boundarySchema,
  maxLength: SPECIFICATION_ITEM_CURSOR_MAX_LENGTH,
  version: CURSOR_VERSION,
})

export function encodeSpecificationItemPageCursor(
  boundary: SpecificationItemPageBoundary,
  queryFingerprint: string,
): string {
  return cursorCodec.encode(boundary, queryFingerprint)
}

export function decodeSpecificationItemPageCursor(
  cursor: string,
): SpecificationItemPageCursorPayload {
  return cursorCodec.decode(cursor)
}

export function assertSpecificationItemPageCursorMatches(
  payload: SpecificationItemPageCursorPayload,
  queryFingerprint: string,
): void {
  cursorCodec.assertMatches(payload, queryFingerprint)
}
