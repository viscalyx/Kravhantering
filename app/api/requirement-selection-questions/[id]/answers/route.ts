import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  createRequirementSelectionAnswer,
  resolveRequirementSelectionQuestionId,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import { requirementSelectionQuestionPolicy } from '../../_authorization'
import { answerSchema, questionRouteParamsSchema } from '../../_schemas'

export const POST = secureMutationRoute({
  bodySchema: answerSchema,
  paramsSchema: questionRouteParamsSchema,
  policy: requirementSelectionQuestionPolicy('answer.create'),
  handler: async ({ body, context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const questionId = await resolveRequirementSelectionQuestionId(
      activeDb,
      params.id,
    )
    if (questionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const question = await createRequirementSelectionAnswer(
      activeDb,
      questionId,
      body,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'requirement_selection_answer.create',
      details: { questionId },
      targetId: questionId,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
