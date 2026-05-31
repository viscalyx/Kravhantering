import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  type RequirementSelectionQuestionRow,
  setRequirementSelectionQuestionState,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'

export function questionStateRoute(
  operation: 'activate' | 'archive' | 'deactivate' | 'reactivate',
) {
  return secureMutationRoute({
    paramsSchema: idParamSchema,
    policy: authenticatedMutationPolicy(
      `requirement_selection_question.${operation}`,
    ),
    handler: async ({ context, params }) => {
      const db = await getRequestSqlServerDataSource()
      const question = (await setRequirementSelectionQuestionState(
        db,
        params.id,
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
