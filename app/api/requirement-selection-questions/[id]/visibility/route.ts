import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  getRequirementSelectionQuestionById,
  replaceRequirementSelectionQuestionVisibilityGroups,
  resolveRequirementSelectionQuestionId,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import { requirementSelectionQuestionPolicy } from '../../_authorization'
import {
  questionRouteParamsSchema,
  visibilityUpdateSchema,
} from '../../_schemas'

export const PUT = secureMutationRoute({
  bodySchema: visibilityUpdateSchema,
  paramsSchema: questionRouteParamsSchema,
  policy: requirementSelectionQuestionPolicy('visibility.update'),
  handler: async ({ body, context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const questionId = await resolveRequirementSelectionQuestionId(
      activeDb,
      params.id,
    )
    if (questionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const question = await replaceRequirementSelectionQuestionVisibilityGroups(
      activeDb,
      questionId,
      body.groups,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'requirement_selection_question.visibility.update',
      details: {
        groupCount: body.groups.length,
      },
      targetId: question.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    const refreshed = await getRequirementSelectionQuestionById(
      activeDb,
      question.id,
    )
    return NextResponse.json(refreshed ?? question)
  },
})
