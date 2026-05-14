import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSuggestion } from '@/lib/dal/improvement-suggestions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  businessTextSchema,
  idParamSchema,
  parseRouteParams,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const suggestionUpdateSchema = z
  .object({
    content: businessTextSchema,
  })
  .strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()

  try {
    const item = await getSuggestion(db, id)
    return NextResponse.json(item)
  } catch (error) {
    if (isRequirementsServiceError(error) && error.code === 'not_found') {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    throw error
  }
}

export const PUT = secureMutationRoute({
  bodySchema: suggestionUpdateSchema,
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof suggestionUpdateSchema>,
    { id: number }
  >(({ params }) => ({
    kind: 'manage_suggestion',
    operation: 'edit',
    suggestionId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      await service.manageSuggestion(context, {
        operation: 'edit',
        suggestionId: params.id,
        content: body.content,
        responseFormat: 'json',
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to update improvement suggestion', error)
      return NextResponse.json(
        { error: 'Failed to update improvement suggestion' },
        { status: 500 },
      )
    }
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<unknown, { id: number }>(({ params }) => ({
    kind: 'manage_suggestion',
    operation: 'delete',
    suggestionId: params.id,
  })),
  handler: async ({ context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      await service.manageSuggestion(context, {
        operation: 'delete',
        suggestionId: params.id,
        responseFormat: 'json',
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to delete improvement suggestion', error)
      return NextResponse.json(
        { error: 'Failed to delete improvement suggestion' },
        { status: 500 },
      )
    }
  },
})
