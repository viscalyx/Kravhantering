import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/lib/dal/improvement-suggestions'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { businessTextSchema, idParamSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

const resolutionBodySchema = z
  .object({
    resolution: z.union([
      z.literal(SUGGESTION_RESOLVED),
      z.literal(SUGGESTION_DISMISSED),
    ]),
    resolutionMotivation: businessTextSchema,
    resolvedBy: businessTextSchema.optional(),
  })
  .strict()

function getSuggestionResolutionOperation(
  resolution: z.infer<typeof resolutionBodySchema>['resolution'],
) {
  return resolution === SUGGESTION_RESOLVED ? 'resolve' : 'dismiss'
}

export const POST = secureMutationRoute({
  bodySchema: resolutionBodySchema,
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof resolutionBodySchema>,
    { id: number }
  >(({ body, params }) => ({
    kind: 'manage_suggestion',
    operation: getSuggestionResolutionOperation(body.resolution),
    suggestionId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    try {
      const operation = getSuggestionResolutionOperation(body.resolution)
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      await service.manageSuggestion(context, {
        operation,
        suggestionId: params.id,
        resolutionMotivation: body.resolutionMotivation,
        resolvedBy: body.resolvedBy,
        responseFormat: 'json',
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to record suggestion resolution', error)
      return NextResponse.json(
        { error: 'Failed to record resolution' },
        { status: 500 },
      )
    }
  },
})
