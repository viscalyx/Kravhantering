import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  replaceSpecificationRequirementSelectionAnswers,
  resolveSpecificationId,
  type SpecificationRequirementSelectionQuestionRow,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { DELETED_USER_INTERNAL_NAME } from '@/lib/privacy/display-name'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

const paramsSchema = z
  .object({
    id: specificationIdOrSlugSchema,
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
  policy: authenticatedMutationPolicy(
    'specification_requirement_selection_answer.replace',
  ),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, params.id)
    if (!specificationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    let questions: SpecificationRequirementSelectionQuestionRow[]
    try {
      questions = await replaceSpecificationRequirementSelectionAnswers(
        db,
        specificationId,
        params.questionId,
        body.answerIds,
        {
          displayName:
            context.actor.displayName.trim() ||
            context.actor.id ||
            DELETED_USER_INTERNAL_NAME,
          hsaId: context.actor.hsaId,
        },
        { confirmHiddenAnswerClear: body.confirmHiddenAnswerClear },
      )
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
    await recordAllowedActionAuditEvent(db, context, {
      action: 'specification_requirement_selection_answer.replace',
      details: {
        answerCount: body.answerIds.length,
        questionId: params.questionId,
      },
      targetId: specificationId,
      targetKind: 'requirements_specification',
    })
    return NextResponse.json({ questions })
  },
})
