import { type NextRequest, NextResponse } from 'next/server'
import type { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  getRfiQuestion,
  setRfiQuestionArchived,
  updateRfiQuestion,
} from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { parseRouteParams } from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'
import { rfiQuestionParamsSchema, rfiQuestionUpdateSchema } from '../_schemas'

type Params = Promise<{ id: string }>
type RfiQuestionParams = z.infer<typeof rfiQuestionParamsSchema>
type RfiQuestionUpdateBody = z.infer<typeof rfiQuestionUpdateSchema>

function errorResponse(error: unknown) {
  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, { status })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, rfiQuestionParamsSchema)
  if (!parsedParams.ok) return parsedParams.response
  const runtime = await createRequirementsRestRuntime(request)
  try {
    const question = await getRfiQuestion(runtime.db, parsedParams.data.id)
    if (!question)
      return applyResponseCorrelationHeaders(
        NextResponse.json({ error: 'Not found' }, { status: 404 }),
        runtime.context,
      )

    await authorize(
      runtime.authorization,
      {
        areaId: question.areaId,
        kind: 'manage_rfi_question',
        operation: 'read',
      },
      runtime.context,
    )

    return applyResponseCorrelationHeaders(
      NextResponse.json({ question }),
      runtime.context,
    )
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}

const questionPolicy = <TBody>(operation: string) =>
  ({
    action: ({ params }) => ({
      kind: 'manage_rfi_question',
      operation,
      questionId: params.id,
    }),
    kind: 'requirements',
  }) satisfies MutationPolicy<TBody, RfiQuestionParams>

export const PUT = secureMutationRoute({
  bodySchema: rfiQuestionUpdateSchema,
  paramsSchema: rfiQuestionParamsSchema,
  policy: questionPolicy<RfiQuestionUpdateBody>('edit'),
  handler: async ({ body, context, db, params }) => {
    const actor = requireHumanActorSnapshot(context)
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const question = await updateRfiQuestion(activeDb, params.id, body, actor)
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'rfi_question.update',
      details: { changedFields: Object.keys(body) },
      targetId: question.id,
      targetKind: 'rfi_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: rfiQuestionParamsSchema,
  policy: questionPolicy<undefined>('archive'),
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const question = await setRfiQuestionArchived(activeDb, params.id, true)
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'rfi_question.archive',
      targetId: question.id,
      targetKind: 'rfi_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question)
  },
})
