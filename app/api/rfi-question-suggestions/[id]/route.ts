import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { rfiQuestionSuggestionParamsSchema } from '@/app/api/rfi-questions/_schemas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { deleteRfiQuestionSuggestionWithAudit } from '@/lib/requirements/rfi-question-suggestion-mutations'

type RfiQuestionSuggestionParams = z.infer<
  typeof rfiQuestionSuggestionParamsSchema
>

const deletePolicy = {
  action: ({ params }) => ({
    kind: 'manage_rfi_question_suggestion',
    operation: 'delete',
    suggestionId: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<undefined, RfiQuestionSuggestionParams>

export const DELETE = secureMutationRoute({
  paramsSchema: rfiQuestionSuggestionParamsSchema,
  policy: deletePolicy,
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    await deleteRfiQuestionSuggestionWithAudit(activeDb, params.id, context)
    return NextResponse.json({ ok: true })
  },
})
