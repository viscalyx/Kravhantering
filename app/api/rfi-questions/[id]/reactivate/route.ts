import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { setRfiQuestionArchived } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { rfiQuestionParamsSchema } from '../../_schemas'

type RfiQuestionParams = z.infer<typeof rfiQuestionParamsSchema>

const policy = {
  action: ({ params }) => ({
    kind: 'manage_rfi_question',
    operation: 'reactivate',
    questionId: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<undefined, RfiQuestionParams>

export const POST = secureMutationRoute({
  paramsSchema: rfiQuestionParamsSchema,
  policy,
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const question = await setRfiQuestionArchived(activeDb, params.id, false)
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'rfi_question.reactivate',
      targetId: question.id,
      targetKind: 'rfi_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question)
  },
})
