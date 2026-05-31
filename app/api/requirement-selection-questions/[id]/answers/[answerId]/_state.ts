import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  resolveRequirementSelectionQuestionId,
  setRequirementSelectionAnswerState,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { answerRouteParamsSchema } from '../../../_schemas'

export function answerStateRoute(
  operation: 'activate' | 'archive' | 'deactivate' | 'reactivate',
) {
  return secureMutationRoute({
    paramsSchema: answerRouteParamsSchema,
    policy: authenticatedMutationPolicy(
      `requirement_selection_answer.${operation}`,
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
      const question = await setRequirementSelectionAnswerState(
        db,
        questionId,
        params.answerId,
        operation,
      )
      if (!question) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await recordAllowedActionAuditEvent(db, context, {
        action: `requirement_selection_answer.${operation}`,
        details: { questionId },
        targetId: params.answerId,
        targetKind: 'requirement_selection_answer',
      })
      return NextResponse.json(question)
    },
  })
}
