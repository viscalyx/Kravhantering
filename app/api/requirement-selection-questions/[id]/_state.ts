import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  type RequirementSelectionQuestionRow,
  resolveRequirementSelectionQuestionId,
  setRequirementSelectionQuestionState,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import { requirementSelectionQuestionPolicy } from '../_authorization'
import { questionRouteParamsSchema } from '../_schemas'

export function questionStateRoute(
  operation: 'activate' | 'archive' | 'deactivate' | 'reactivate',
) {
  return secureMutationRoute({
    paramsSchema: questionRouteParamsSchema,
    policy: requirementSelectionQuestionPolicy(operation),
    handler: async ({ context, db, params }) => {
      const activeDb = db ?? (await getRequestSqlServerDataSource())
      const questionId = await resolveRequirementSelectionQuestionId(
        activeDb,
        params.id,
      )
      if (questionId == null) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const question = (await setRequirementSelectionQuestionState(
        activeDb,
        questionId,
        operation,
      )) as RequirementSelectionQuestionRow | null
      if (!question) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await recordAllowedActionAuditEvent(activeDb, context, {
        action: `requirement_selection_question.${operation}`,
        targetId: question.id,
        targetKind: 'requirement_selection_question',
        targetUniqueId: question.questionCode,
      })
      return NextResponse.json(question)
    },
  })
}
