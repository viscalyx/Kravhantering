import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  duplicateRequirementSelectionQuestion,
  resolveRequirementSelectionQuestionId,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import { requirementSelectionQuestionPolicy } from '../../_authorization'
import { questionRouteParamsSchema } from '../../_schemas'

export const POST = secureMutationRoute({
  paramsSchema: questionRouteParamsSchema,
  policy: requirementSelectionQuestionPolicy('duplicate'),
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const sourceQuestionId = await resolveRequirementSelectionQuestionId(
      activeDb,
      params.id,
    )
    if (sourceQuestionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const question = await duplicateRequirementSelectionQuestion(
      activeDb,
      sourceQuestionId,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'requirement_selection_question.duplicate',
      details: { sourceQuestionId },
      targetId: question.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
