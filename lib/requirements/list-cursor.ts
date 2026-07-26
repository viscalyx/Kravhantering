import { z } from 'zod'
import {
  createVersionedCursorCodec,
  fingerprintCursorQuery,
  type VersionedCursorPayload,
} from '@/lib/requirements/cursor-codec'

const CURSOR_VERSION = 4
export const REQUIREMENT_LIST_CURSOR_MAX_LENGTH = 8192

const boundarySchema = z
  .object({
    nullRank: z.union([z.literal(0), z.literal(1)]),
    requirementId: z.number().int().positive(),
    sortValue: z.union([z.string(), z.number().finite(), z.null()]),
  })
  .strict()

export type RequirementListPageBoundary = z.infer<typeof boundarySchema>

export type RequirementListCursorPayload = VersionedCursorPayload<
  RequirementListPageBoundary,
  typeof CURSOR_VERSION
>

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
  return fingerprintCursorQuery(value, stableValue)
}

const cursorCodec = createVersionedCursorCodec({
  boundarySchema,
  maxLength: REQUIREMENT_LIST_CURSOR_MAX_LENGTH,
  version: CURSOR_VERSION,
})

export function encodeRequirementListCursor(
  boundary: RequirementListPageBoundary,
  queryFingerprint: string,
): string {
  return cursorCodec.encode(boundary, queryFingerprint)
}

export function decodeRequirementListCursor(
  cursor: string,
): RequirementListCursorPayload {
  return cursorCodec.decode(cursor)
}

export function assertRequirementListCursorMatches(
  payload: RequirementListCursorPayload,
  queryFingerprint: string,
): void {
  cursorCodec.assertMatches(payload, queryFingerprint)
}
