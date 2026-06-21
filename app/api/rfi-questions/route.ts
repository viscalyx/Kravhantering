import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { createRfiQuestion, listRfiQuestions } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { parseSearchParams } from '@/lib/http/validation'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { rfiQuestionCreateSchema, rfiQuestionQuerySchema } from './_schemas'

type RfiQuestionCreateBody = z.infer<typeof rfiQuestionCreateSchema>

export async function GET(request: Request) {
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    rfiQuestionQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  const db = await getRequestSqlServerDataSource()
  const questions = await listRfiQuestions(db, parsedQuery.data)
  return NextResponse.json({ questions })
}

const createPolicy = {
  action: ({ body }) => ({
    areaId: body.areaId,
    kind: 'manage_rfi_question',
    operation: 'create',
  }),
  kind: 'requirements',
} satisfies MutationPolicy<RfiQuestionCreateBody, undefined>

export const POST = secureMutationRoute({
  bodySchema: rfiQuestionCreateSchema,
  policy: createPolicy,
  handler: async ({ body, context, db }) => {
    const actor = requireHumanActorSnapshot(context)
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const question = await createRfiQuestion(activeDb, body, actor)
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'rfi_question.create',
      details: { areaId: question.areaId },
      targetId: question.id,
      targetKind: 'rfi_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
