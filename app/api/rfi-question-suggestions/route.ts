import { type NextRequest, NextResponse } from 'next/server'
import type { z } from 'zod'
import {
  rfiQuestionSuggestionCreateSchema,
  rfiQuestionSuggestionQuerySchema,
} from '@/app/api/rfi-questions/_schemas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { parseSearchParams } from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRfiQuestionSuggestionWithAudit } from '@/lib/requirements/rfi-question-suggestion-mutations'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

type RfiQuestionSuggestionCreateBody = z.infer<
  typeof rfiQuestionSuggestionCreateSchema
>

function errorResponse(error: unknown) {
  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, {
    status,
  })
}

async function getHandler(request: NextRequest) {
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    rfiQuestionSuggestionQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  const runtime = await createRequirementsRestRuntime(request)
  try {
    const page = await runtime.service.listRfiQuestionSuggestions(
      runtime.context,
      parsedQuery.data,
    )
    return applyResponseCorrelationHeaders(
      NextResponse.json(page),
      runtime.context,
    )
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}

export const GET = withRestResponsePolicy(getHandler)

const createPolicy = {
  action: ({ body }) => ({
    areaId: body.areaId,
    kind: 'manage_rfi_question_suggestion',
    operation: 'create',
    specificationId: body.specificationId,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<RfiQuestionSuggestionCreateBody, undefined>

export const POST = secureMutationRoute({
  bodySchema: rfiQuestionSuggestionCreateSchema,
  policy: createPolicy,
  handler: async ({ body, context, db }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const actor = requireHumanActorSnapshot(context)
    const suggestion = await createRfiQuestionSuggestionWithAudit(
      activeDb,
      {
        areaId: body.areaId,
        content: body.content,
        rfiQuestionId: body.rfiQuestionId ?? null,
        specificationId: body.specificationId ?? null,
      },
      actor,
      context,
    )
    return NextResponse.json({ suggestion }, { status: 201 })
  },
})
