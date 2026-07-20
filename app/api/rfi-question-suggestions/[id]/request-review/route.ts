import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { rfiQuestionSuggestionParamsSchema } from '@/app/api/rfi-questions/_schemas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { requestRfiQuestionSuggestionReviewWithAudit } from '@/lib/requirements/rfi-question-suggestion-mutations'

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
    const suggestion = await requestRfiQuestionSuggestionReviewWithAudit(
      activeDb,
      params.id,
      context,
    )
    return NextResponse.json({ suggestion })
  },
})
