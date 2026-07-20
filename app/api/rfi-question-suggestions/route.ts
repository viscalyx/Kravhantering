import { type NextRequest, NextResponse } from 'next/server'
import type { z } from 'zod'
import {
  rfiQuestionSuggestionCreateSchema,
  rfiQuestionSuggestionQuerySchema,
} from '@/app/api/rfi-questions/_schemas'
import { listRfiQuestionSuggestions } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { parseSearchParams } from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRfiQuestionSuggestionWithAudit } from '@/lib/requirements/rfi-question-suggestion-mutations'
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

  const runtime = await createRequirementsRestRuntime(request)
  try {
    const suggestions =
      parsedQuery.data.areaId == null
        ? await listAuthorizedSuggestions(
            runtime,
            parsedQuery.data.specificationId,
          )
        : await listSuggestionsForArea(runtime, {
            areaId: parsedQuery.data.areaId,
            specificationId: parsedQuery.data.specificationId,
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

async function listSuggestionsForArea(
  runtime: Awaited<ReturnType<typeof createRequirementsRestRuntime>>,
  options: { areaId: number; specificationId?: number },
) {
  await authorize(
    runtime.authorization,
    {
      areaId: options.areaId,
      kind: 'manage_rfi_question_suggestion',
      operation: 'list',
    },
    runtime.context,
  )
  return listRfiQuestionSuggestions(runtime.db, options)
}

async function listAuthorizedSuggestions(
  runtime: Awaited<ReturnType<typeof createRequirementsRestRuntime>>,
  specificationId?: number,
) {
  if (!runtime.context.actor.isAuthenticated) {
    throw unauthorizedError()
  }

  const suggestions = await listRfiQuestionSuggestions(runtime.db, {
    specificationId,
  })
  if (runtime.context.actor.roles.includes('Admin')) return suggestions

  const authorizedAreaIds = new Set<number>()
  const deniedAreaIds = new Set<number>()
  for (const suggestion of suggestions) {
    if (authorizedAreaIds.has(suggestion.areaId)) continue
    if (deniedAreaIds.has(suggestion.areaId)) continue

    try {
      await authorize(
        runtime.authorization,
        {
          areaId: suggestion.areaId,
          kind: 'manage_rfi_question_suggestion',
          operation: 'list',
        },
        runtime.context,
      )
      authorizedAreaIds.add(suggestion.areaId)
    } catch (error) {
      const { status } = toHttpErrorPayload(error)
      if (status !== 403) throw error
      deniedAreaIds.add(suggestion.areaId)
    }
  }

  return suggestions.filter(suggestion =>
    authorizedAreaIds.has(suggestion.areaId),
  )
}

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
