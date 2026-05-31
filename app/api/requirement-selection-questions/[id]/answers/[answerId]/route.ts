import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  deleteRequirementSelectionAnswer,
  updateRequirementSelectionAnswer,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { answerRouteParamsSchema, answerUpdateSchema } from '../../../_schemas'

export const PUT = secureMutationRoute({
  bodySchema: answerUpdateSchema,
  paramsSchema: answerRouteParamsSchema,
  policy: customMutationPolicy('requirement_selection_answer', () => {}),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const question = await updateRequirementSelectionAnswer(
      db,
      params.id,
      params.answerId,
      body,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_answer.update',
      details: {
        answerId: params.answerId,
        changedFields: Object.keys(body),
        questionId: params.id,
      },
      targetId: params.answerId,
      targetKind: 'requirement_selection_answer',
    })
    return NextResponse.json(question)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: answerRouteParamsSchema,
  policy: customMutationPolicy('requirement_selection_answer', () => {}),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const result = await deleteRequirementSelectionAnswer(
      db,
      params.id,
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
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_answer.delete',
      details: { questionId: params.id },
      targetId: params.answerId,
      targetKind: 'requirement_selection_answer',
    })
    return NextResponse.json({ ok: true })
  },
})
