import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { createRequirementSelectionAnswer } from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { answerSchema } from '../../_schemas'

export const POST = secureMutationRoute({
  bodySchema: answerSchema,
  paramsSchema: idParamSchema,
  policy: authenticatedMutationPolicy('requirement_selection_answer.create'),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const question = await createRequirementSelectionAnswer(db, params.id, body)
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_answer.create',
      details: { questionId: params.id },
      targetId: params.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
