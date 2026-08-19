import { listAreaIdsActorCanAuthor } from '@/lib/dal/requirement-areas'
import {
  listRfiQuestionSuggestions as listRfiQuestionSuggestionRows,
  listRfiQuestions,
  type RfiQuestionListOptions,
  type RfiQuestionRow,
  type RfiQuestionSuggestionRow,
} from '@/lib/dal/rfi-questions'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import { unauthorizedError, validationError } from '@/lib/requirements/errors'
import {
  assertRfiQuestionSuggestionCursorMatches,
  decodeRfiQuestionSuggestionCursor,
  encodeRfiQuestionSuggestionCursor,
  fingerprintRfiQuestionSuggestionQuery,
  MAX_RFI_QUESTION_SUGGESTION_PAGE_LIMIT,
} from '@/lib/requirements/rfi-question-suggestion-cursor'
import { authorize } from '@/lib/requirements/service-shared'

export const DEFAULT_RFI_QUESTION_SUGGESTION_PAGE_LIMIT = 100
export const MAX_RFI_QUESTION_SUGGESTION_PAGE_BYTES = 1_048_576

const RFI_QUESTION_SUGGESTION_PAGE_ENVELOPE_BYTES = 4_096

export interface RfiQuestionSuggestionPageInput {
  areaId?: number
  cursor?: string
  limit?: number
  specificationId?: number
}

export interface RfiQuestionSuggestionPageResult {
  pagination: {
    count: number
    hasMore: boolean
    limit: number
    nextCursor: string | null
  }
  suggestions: RfiQuestionSuggestionRow[]
}

export interface RfiQuestionQueryService {
  listRfiQuestionSuggestions(
    context: RequestContext,
    input: RfiQuestionSuggestionPageInput,
  ): Promise<RfiQuestionSuggestionPageResult>
  listRfiQuestions(
    context: RequestContext,
    input: Omit<RfiQuestionListOptions, 'areaIds'>,
  ): Promise<RfiQuestionRow[]>
}

function normalizeSuggestionPageLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_RFI_QUESTION_SUGGESTION_PAGE_LIMIT
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_RFI_QUESTION_SUGGESTION_PAGE_LIMIT
  ) {
    throw validationError('Expected limit to be an integer from 1 to 200')
  }
  return limit
}

function suggestionsWithinByteBudget(
  rows: RfiQuestionSuggestionRow[],
  limit: number,
): RfiQuestionSuggestionRow[] {
  const encoder = new TextEncoder()
  const itemBudget =
    MAX_RFI_QUESTION_SUGGESTION_PAGE_BYTES -
    RFI_QUESTION_SUGGESTION_PAGE_ENVELOPE_BYTES
  const suggestions: RfiQuestionSuggestionRow[] = []
  let encodedBytes = 0

  for (const row of rows.slice(0, limit)) {
    const rowBytes = encoder.encode(JSON.stringify(row)).byteLength
    const separatorBytes = suggestions.length === 0 ? 0 : 1
    if (encodedBytes + separatorBytes + rowBytes > itemBudget) break
    suggestions.push(row)
    encodedBytes += separatorBytes + rowBytes
  }

  if (rows.length > 0 && suggestions.length === 0) {
    throw validationError('Stored RFI question suggestion exceeds page budget')
  }
  return suggestions
}

export function createRfiQuestionQueryService({
  authorization,
  db,
}: {
  authorization: AuthorizationService
  db: SqlServerDatabase
}): RfiQuestionQueryService {
  return {
    async listRfiQuestions(context, input) {
      if (input.areaId != null) {
        await authorize(
          authorization,
          {
            areaId: input.areaId,
            kind: 'manage_rfi_question',
            operation: 'read',
          },
          context,
        )
        return listRfiQuestions(db, input)
      }

      if (context.actor.roles.includes('Admin')) {
        return listRfiQuestions(db, input)
      }

      const areaIds = await listAreaIdsActorCanAuthor(db, context.actor.hsaId)
      if (areaIds.length === 0) return []

      return listRfiQuestions(db, {
        areaIds,
        includeArchived: input.includeArchived,
      })
    },

    async listRfiQuestionSuggestions(context, input) {
      if (!context.actor.isAuthenticated) throw unauthorizedError()

      const limit = normalizeSuggestionPageLimit(input.limit)
      let actorHsaId: string | undefined
      if (input.areaId != null) {
        await authorize(
          authorization,
          {
            areaId: input.areaId,
            kind: 'manage_rfi_question_suggestion',
            operation: 'list',
          },
          context,
        )
      } else if (!context.actor.roles.includes('Admin')) {
        actorHsaId = context.actor.hsaId ?? undefined
        if (!actorHsaId) {
          return {
            pagination: { count: 0, hasMore: false, limit, nextCursor: null },
            suggestions: [],
          }
        }
      }

      const queryFingerprint = fingerprintRfiQuestionSuggestionQuery({
        actorHsaId,
        areaId: input.areaId,
        specificationId: input.specificationId,
      })
      const cursor = input.cursor
        ? decodeRfiQuestionSuggestionCursor(input.cursor)
        : undefined
      if (cursor) {
        assertRfiQuestionSuggestionCursorMatches(cursor, queryFingerprint)
      }

      const rows = await listRfiQuestionSuggestionRows(db, {
        actorHsaId,
        after: cursor?.boundary,
        areaId: input.areaId,
        limit: limit + 1,
        specificationId: input.specificationId,
      })
      const suggestions = suggestionsWithinByteBudget(rows, limit)
      const hasMore = rows.length > suggestions.length
      const boundary = suggestions.at(-1)

      return {
        pagination: {
          count: suggestions.length,
          hasMore,
          limit,
          nextCursor:
            hasMore && boundary
              ? encodeRfiQuestionSuggestionCursor(
                  { createdAt: boundary.createdAt, id: boundary.id },
                  queryFingerprint,
                )
              : null,
        },
        suggestions,
      }
    },
  }
}
