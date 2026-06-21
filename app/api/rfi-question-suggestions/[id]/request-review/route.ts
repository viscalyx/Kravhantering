import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { rfiQuestionSuggestionParamsSchema } from '@/app/api/rfi-questions/_schemas'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { requestRfiQuestionSuggestionReview } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

type RfiQuestionSuggestionParams = z.infer<
  typeof rfiQuestionSuggestionParamsSchema
>

const policy = {
  action: ({ params }) => ({
    kind: 'manage_rfi_question_suggestion',
    operation: 'request_review',
    suggestionId: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<undefined, RfiQuestionSuggestionParams>

export const POST = secureMutationRoute({
  paramsSchema: rfiQuestionSuggestionParamsSchema,
  policy,
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const suggestion = await requestRfiQuestionSuggestionReview(
      activeDb,
      params.id,
    )
    if (!suggestion) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'rfi_question_suggestion.request_review',
      targetId: suggestion.id,
      targetKind: 'rfi_question_suggestion',
    })
    return NextResponse.json({ suggestion })
  },
})
