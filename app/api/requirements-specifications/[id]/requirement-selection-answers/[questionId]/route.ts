import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SpecificationRequirementSelectionQuestionRow } from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  idParamSchema,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'
import { createDefaultAuthorizationService } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { createSpecificationRequirementSelectionAnswerMutationWorkflow } from '@/lib/requirements/specification-requirement-selection-answer-mutations'

const paramsSchema = z
  .object({
    id: idParamSchema.shape.id,
    questionId: positiveIntegerStringSchema,
  })
  .strict()

const bodySchema = z
  .object({
    answerIds: z.array(positiveIntegerSchema).max(200),
    confirmHiddenAnswerClear: z.boolean().optional(),
  })
  .strict()

export const PUT = secureMutationRoute({
  bodySchema,
  paramsSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof bodySchema>,
    z.infer<typeof paramsSchema>
  >(({ params }) => ({
    kind: 'manage_specification_requirement_selection_answers',
    operation: 'replace',
    specificationId: params.id,
  })),
  handler: async ({ body, context, db: authorizedDb, params }) => {
    const db = authorizedDb ?? (await getRequestSqlServerDataSource())
    const workflow =
      createSpecificationRequirementSelectionAnswerMutationWorkflow({
        authorization: createDefaultAuthorizationService(db),
        db,
      })
    let questions: SpecificationRequirementSelectionQuestionRow[]
    try {
      questions = await workflow.replace(context, {
        answerIds: body.answerIds,
        confirmHiddenAnswerClear: body.confirmHiddenAnswerClear,
        questionId: params.questionId,
        specificationId: params.id,
      })
    } catch (error) {
      if (
        isRequirementsServiceError(error) &&
        error.code === 'conflict' &&
        error.details?.reason === 'hidden_selection_clear_required'
      ) {
        return NextResponse.json(
          {
            code: error.code,
            error: error.message,
            hiddenSelections: error.details.hiddenSelections ?? [],
            reason: error.details.reason,
          },
          { status: error.status },
        )
      }
      throw error
    }
    return NextResponse.json({ questions })
  },
})
