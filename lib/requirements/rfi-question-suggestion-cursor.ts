import { z } from 'zod'
import type { RfiQuestionSuggestionPageBoundary } from '@/lib/dal/rfi-questions'
import {
  createVersionedCursorCodec,
  fingerprintCursorQuery,
  type VersionedCursorPayload,
} from '@/lib/requirements/cursor-codec'

const CURSOR_VERSION = 1
export const MAX_RFI_QUESTION_SUGGESTION_PAGE_LIMIT = 200
export const RFI_QUESTION_SUGGESTION_CURSOR_MAX_LENGTH = 1024

const boundarySchema = z
  .object({
    createdAt: z.string().datetime(),
    id: z.number().int().positive(),
  })
  .strict()

export type RfiQuestionSuggestionCursorPayload = VersionedCursorPayload<
  RfiQuestionSuggestionPageBoundary,
  typeof CURSOR_VERSION
>

const cursorCodec = createVersionedCursorCodec({
  boundarySchema,
  maxLength: RFI_QUESTION_SUGGESTION_CURSOR_MAX_LENGTH,
  version: CURSOR_VERSION,
})

export function fingerprintRfiQuestionSuggestionQuery(value: unknown): string {
  return fingerprintCursorQuery(value)
}

export function encodeRfiQuestionSuggestionCursor(
  boundary: RfiQuestionSuggestionPageBoundary,
  queryFingerprint: string,
): string {
  return cursorCodec.encode(boundary, queryFingerprint)
}

export function decodeRfiQuestionSuggestionCursor(
  cursor: string,
): RfiQuestionSuggestionCursorPayload {
  return cursorCodec.decode(cursor)
}

export function assertRfiQuestionSuggestionCursorMatches(
  payload: RfiQuestionSuggestionCursorPayload,
  queryFingerprint: string,
): void {
  cursorCodec.assertMatches(payload, queryFingerprint)
}
