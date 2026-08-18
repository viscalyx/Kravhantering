import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { createRfiQuestion } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { parseSearchParams } from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { rfiQuestionCreateSchema, rfiQuestionQuerySchema } from './_schemas'

type RfiQuestionCreateBody = z.infer<typeof rfiQuestionCreateSchema>

function errorResponse(error: unknown) {
  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, { status })
}

export async function GET(request: Request) {
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    rfiQuestionQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  const runtime = await createRequirementsRestRuntime(request)
  try {
    const questions = await runtime.service.listRfiQuestions(
      runtime.context,
      parsedQuery.data,
    )
    return applyResponseCorrelationHeaders(
      NextResponse.json({ questions }),
      runtime.context,
    )
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
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
