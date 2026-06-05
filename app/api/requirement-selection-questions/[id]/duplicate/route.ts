import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  duplicateRequirementSelectionQuestion,
  resolveRequirementSelectionQuestionId,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { questionRouteParamsSchema } from '../../_schemas'

export const POST = secureMutationRoute({
  paramsSchema: questionRouteParamsSchema,
  policy: authenticatedMutationPolicy(
    'requirement_selection_question.duplicate',
  ),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const sourceQuestionId = await resolveRequirementSelectionQuestionId(
      db,
      params.id,
    )
    if (sourceQuestionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const question = await duplicateRequirementSelectionQuestion(
      db,
      sourceQuestionId,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_question.duplicate',
      details: { sourceQuestionId },
      targetId: question.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
