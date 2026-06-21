import { type NextRequest, NextResponse } from 'next/server'
import type { z } from 'zod'
import {
  rfiQuestionSuggestionCreateSchema,
  rfiQuestionSuggestionQuerySchema,
} from '@/app/api/rfi-questions/_schemas'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { resolveSpecificationId } from '@/lib/dal/requirement-selection-questions'
import {
  createRfiQuestionSuggestion,
  listRfiQuestionSuggestions,
} from '@/lib/dal/rfi-questions'
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
import { authorize } from '@/lib/requirements/service-shared'

type RfiQuestionSuggestionCreateBody = z.infer<
  typeof rfiQuestionSuggestionCreateSchema
>

function errorResponse(error: unknown) {
  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
    status,
  })
}

export async function GET(request: NextRequest) {
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    rfiQuestionSuggestionQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  if (parsedQuery.data.areaId == null) {
    return NextResponse.json(
      { error: 'areaId is required' },
      { headers: { 'Cache-Control': 'no-store' }, status: 400 },
    )
  }

  const runtime = await createRequirementsRestRuntime(request)
  try {
    await authorize(
      runtime.authorization,
      {
        areaId: parsedQuery.data.areaId,
        kind: 'manage_rfi_question_suggestion',
        operation: 'list',
      },
      runtime.context,
    )
    const suggestions = await listRfiQuestionSuggestions(runtime.db, {
      areaId: parsedQuery.data.areaId,
    })
    return applyResponseCorrelationHeaders(
      NextResponse.json(
        { suggestions },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
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
    kind: 'manage_rfi_question_suggestion',
    operation: 'create',
    specificationId: body.specificationId,
    specificationSlug: body.specificationSlug,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<RfiQuestionSuggestionCreateBody, undefined>

export const POST = secureMutationRoute({
  bodySchema: rfiQuestionSuggestionCreateSchema,
  policy: createPolicy,
  handler: async ({ body, context, db }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const actor = requireHumanActorSnapshot(context)
    const specificationId =
      body.specificationId ??
      (body.specificationSlug
        ? await resolveSpecificationId(activeDb, body.specificationSlug)
        : null)
    if (body.specificationSlug && !specificationId) {
      return NextResponse.json(
        { error: 'Specification not found' },
        { status: 404 },
      )
    }
    const suggestion = await createRfiQuestionSuggestion(
      activeDb,
      {
        areaId: body.areaId,
        content: body.content,
        rfiQuestionId: body.rfiQuestionId ?? null,
        specificationId,
      },
      actor,
    )
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'rfi_question_suggestion.create',
      details: {
        areaId: suggestion.areaId,
        rfiQuestionId: suggestion.rfiQuestionId,
        specificationId: suggestion.specificationId,
      },
      targetId: suggestion.id,
      targetKind: 'rfi_question_suggestion',
    })
    return NextResponse.json({ suggestion }, { status: 201 })
  },
})
