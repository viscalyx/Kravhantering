import { NextResponse } from 'next/server'
import type { z } from 'zod'
import {
  rfiQuestionSuggestionParamsSchema,
  rfiQuestionSuggestionResolutionSchema,
} from '@/app/api/rfi-questions/_schemas'
import {
  RFI_SUGGESTION_DISMISSED,
  RFI_SUGGESTION_RESOLVED,
} from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { resolveRfiQuestionSuggestionWithAudit } from '@/lib/requirements/rfi-question-suggestion-mutations'

type RfiQuestionSuggestionParams = z.infer<
  typeof rfiQuestionSuggestionParamsSchema
>
type RfiQuestionSuggestionResolutionBody = z.infer<
  typeof rfiQuestionSuggestionResolutionSchema
>

const policy = {
  action: ({ params }) => ({
    kind: 'manage_rfi_question_suggestion',
    operation: 'resolve',
    suggestionId: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<
  RfiQuestionSuggestionResolutionBody,
  RfiQuestionSuggestionParams
>

export const POST = secureMutationRoute({
  bodySchema: rfiQuestionSuggestionResolutionSchema,
  paramsSchema: rfiQuestionSuggestionParamsSchema,
  policy,
  handler: async ({ body, context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const actor = requireHumanActorSnapshot(context)
    const suggestion = await resolveRfiQuestionSuggestionWithAudit(
      activeDb,
      params.id,
      {
        resolution:
          body.resolution === 'resolved'
            ? RFI_SUGGESTION_RESOLVED
            : RFI_SUGGESTION_DISMISSED,
        resolutionMotivation: body.resolutionMotivation,
      },
      actor,
      context,
    )
    return NextResponse.json({ suggestion })
  },
})
