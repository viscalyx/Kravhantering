import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { rfiQuestionSuggestionParamsSchema } from '@/app/api/rfi-questions/_schemas'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { deleteRfiQuestionSuggestion } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

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
    await deleteRfiQuestionSuggestion(activeDb, params.id)
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'rfi_question_suggestion.delete',
      targetId: params.id,
      targetKind: 'rfi_question_suggestion',
    })
    return NextResponse.json({ ok: true })
  },
})
