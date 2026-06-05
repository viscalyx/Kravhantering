import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  createRequirementSelectionAnswer,
  resolveRequirementSelectionQuestionId,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { answerSchema, questionRouteParamsSchema } from '../../_schemas'

export const POST = secureMutationRoute({
  bodySchema: answerSchema,
  paramsSchema: questionRouteParamsSchema,
  policy: authenticatedMutationPolicy('requirement_selection_answer.create'),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const questionId = await resolveRequirementSelectionQuestionId(
      db,
      params.id,
    )
    if (questionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const question = await createRequirementSelectionAnswer(
      db,
      questionId,
      body,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_answer.create',
      details: { questionId },
      targetId: params.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
