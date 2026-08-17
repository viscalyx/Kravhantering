import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  resolveRequirementSelectionQuestionId,
  setRequirementSelectionAnswerState,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import { requirementSelectionAnswerPolicy } from '../../../_authorization'
import { answerRouteParamsSchema } from '../../../_schemas'

export function answerStateRoute(
  operation: 'activate' | 'archive' | 'deactivate' | 'reactivate',
) {
  return secureMutationRoute({
    paramsSchema: answerRouteParamsSchema,
    policy: requirementSelectionAnswerPolicy(`answer.${operation}`),
    handler: async ({ context, db, params }) => {
      const activeDb = db ?? (await getRequestSqlServerDataSource())
      const questionId = await resolveRequirementSelectionQuestionId(
        activeDb,
        params.id,
      )
      if (questionId == null) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const question = await setRequirementSelectionAnswerState(
        activeDb,
        questionId,
        params.answerId,
        operation,
      )
      if (!question) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await recordAllowedActionAuditEvent(activeDb, context, {
        action: `requirement_selection_answer.${operation}`,
        details: { questionId },
        targetId: params.answerId,
        targetKind: 'requirement_selection_answer',
      })
      return NextResponse.json(question)
    },
  })
}
