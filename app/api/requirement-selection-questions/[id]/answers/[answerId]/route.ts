import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  deleteRequirementSelectionAnswer,
  resolveRequirementSelectionQuestionId,
  updateRequirementSelectionAnswer,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import { requirementSelectionAnswerPolicy } from '../../../_authorization'
import { answerRouteParamsSchema, answerUpdateSchema } from '../../../_schemas'

export const PUT = secureMutationRoute({
  bodySchema: answerUpdateSchema,
  paramsSchema: answerRouteParamsSchema,
  policy: requirementSelectionAnswerPolicy('answer.update'),
  handler: async ({ body, context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const questionId = await resolveRequirementSelectionQuestionId(
      activeDb,
      params.id,
    )
    if (questionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const question = await updateRequirementSelectionAnswer(
      activeDb,
      questionId,
      params.answerId,
      body,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'requirement_selection_answer.update',
      details: {
        answerId: params.answerId,
        changedFields: Object.keys(body),
        questionId,
      },
      targetId: params.answerId,
      targetKind: 'requirement_selection_answer',
    })
    return NextResponse.json(question)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: answerRouteParamsSchema,
  policy: requirementSelectionAnswerPolicy('answer.delete'),
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const questionId = await resolveRequirementSelectionQuestionId(
      activeDb,
      params.id,
    )
    if (questionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const result = await deleteRequirementSelectionAnswer(
      activeDb,
      questionId,
      params.answerId,
    )
    if (result === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (result === 'in_use') {
      return NextResponse.json(
        { error: 'Requirement selection answer is in use' },
        { status: 409 },
      )
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'requirement_selection_answer.delete',
      details: { questionId },
      targetId: params.answerId,
      targetKind: 'requirement_selection_answer',
    })
    return NextResponse.json({ ok: true })
  },
})
