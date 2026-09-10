import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const bodySchema = z
  .object({
    implementingRequirementVersionId: z.number().int().positive(),
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema,
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof bodySchema>,
    { id: number }
  >(({ params }) => ({
    kind: 'manage_suggestion',
    operation: 'attach_implementation',
    suggestionId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      await service.manageSuggestion(context, {
        operation: 'attach_implementation',
        suggestionId: params.id,
        implementingRequirementVersionId: body.implementingRequirementVersionId,
        responseFormat: 'json',
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (!isRequirementsServiceError(error)) throw error
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
  },
})
