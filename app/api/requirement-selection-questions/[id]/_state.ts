import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  type RequirementSelectionQuestionRow,
  resolveRequirementSelectionQuestionId,
  setRequirementSelectionQuestionState,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { questionRouteParamsSchema } from '../_schemas'

export function questionStateRoute(
  operation: 'activate' | 'archive' | 'deactivate' | 'reactivate',
) {
  return secureMutationRoute({
    paramsSchema: questionRouteParamsSchema,
    policy: authenticatedMutationPolicy(
      `requirement_selection_question.${operation}`,
    ),
    handler: async ({ context, params }) => {
      const db = await getRequestSqlServerDataSource()
      const questionId = await resolveRequirementSelectionQuestionId(
        db,
        params.id,
      )
      if (questionId == null) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const question = (await setRequirementSelectionQuestionState(
        db,
        questionId,
        operation,
      )) as RequirementSelectionQuestionRow | null
      if (!question) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await recordAllowedActionAuditEvent(db, context, {
        action: `requirement_selection_question.${operation}`,
        targetId: question.id,
        targetKind: 'requirement_selection_question',
        targetUniqueId: question.questionCode,
      })
      return NextResponse.json(question)
    },
  })
}
