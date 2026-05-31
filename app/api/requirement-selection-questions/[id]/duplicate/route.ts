import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { duplicateRequirementSelectionQuestion } from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: authenticatedMutationPolicy(
    'requirement_selection_question.duplicate',
  ),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const question = await duplicateRequirementSelectionQuestion(db, params.id)
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_question.duplicate',
      details: { sourceQuestionId: params.id },
      targetId: question.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
