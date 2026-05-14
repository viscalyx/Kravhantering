import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  businessTextSchema,
  idParamSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const createSuggestionSchema = z
  .object({
    content: businessTextSchema,
    createdBy: nullableBusinessTextSchema.optional(),
    requirementVersionId: positiveIntegerSchema.nullable().optional(),
  })
  .strict()

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data

  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const payload = await service.listSuggestions(context, {
      requirementId: id,
      responseFormat: 'json',
    })
    return NextResponse.json({ suggestions: payload.suggestions })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    if (!isRequirementsServiceError(error) && status === 500) {
      logSanitizedError('Failed to list improvement suggestions', error)
    }
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute({
  bodySchema: createSuggestionSchema,
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof createSuggestionSchema>,
    { id: number }
  >(({ params }) => ({
    kind: 'manage_suggestion',
    operation: 'create',
    requirementId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    const { content, createdBy, requirementVersionId } = body
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const payload = await service.manageSuggestion(context, {
        operation: 'create',
        requirementId: params.id,
        requirementVersionId: requirementVersionId ?? null,
        content,
        createdBy: createdBy ?? null,
        responseFormat: 'json',
      })
      return NextResponse.json(payload.result, { status: 201 })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to create improvement suggestion', error)
      return NextResponse.json(
        { error: 'Failed to create improvement suggestion' },
        { status: 500 },
      )
    }
  },
})
