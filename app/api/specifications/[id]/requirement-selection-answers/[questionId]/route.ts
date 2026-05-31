import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  replaceSpecificationRequirementSelectionAnswers,
  resolveSpecificationId,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'

const paramsSchema = z
  .object({
    id: specificationIdOrSlugSchema,
    questionId: positiveIntegerStringSchema,
  })
  .strict()

const bodySchema = z
  .object({
    answerIds: z.array(positiveIntegerSchema).max(200),
  })
  .strict()

export const PUT = secureMutationRoute({
  bodySchema,
  paramsSchema,
  policy: customMutationPolicy(
    'specification_requirement_selection_answer',
    () => {},
  ),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, params.id)
    if (!specificationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const questions = await replaceSpecificationRequirementSelectionAnswers(
      db,
      specificationId,
      params.questionId,
      body.answerIds,
      {
        displayName:
          context.actor.displayName.trim() || context.actor.id || 'unknown',
        hsaId: context.actor.hsaId,
      },
    )
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
